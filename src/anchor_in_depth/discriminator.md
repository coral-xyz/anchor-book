## What is a Discriminator?

In the context of Anchor, a discriminator is a unique identifier used to distinguish between various types of data. A discriminator is particularly crucial for differentiating between different types of account data structures at runtime. In addition, discriminator is also added at the beginning of instructions so that the dispatch function in the anchor will be used to coordinate instructions to methods called in a program.

`Discriminator` is defined as a trait with a `discriminator()` method and a `DISCRIMINATOR` constant:

```
pub trait Discriminator {
    const DISCRIMINATOR: [u8; 8];
    fn discriminator() -> [u8; 8] {
        Self::DISCRIMINATOR
    }
}
```

Here, `DISCRIMINATOR` is an 8-byte array that represents the unique identifier of a type of data. The `discriminator()` method returns the value of `DISCRIMINATOR`.

## The Necessity of the Discriminator in Anchor

Other traits such as  `ZeroCopy`, `InstructionData`, `Event`, and `EventData` all require a type to implement `Discriminator`. This means that each type of data that wishes to be serialized, deserialized, or used in an event or instruction must have a unique `Discriminator`.

```rs
/// An account data structure capable of zero copy deserialization.
pub trait ZeroCopy: Discriminator + Copy + Clone + Zeroable + Pod {}

/// Calculates the data for an instruction invocation, where the data is
/// `Sha256(<namespace>:<method_name>)[..8] || BorshSerialize(args)`.
/// `args` is a borsh serialized struct of named fields for each argument given
/// to an instruction.

pub trait InstructionData: Discriminator + AnchorSerialize {
	fn data(&self) -> Vec<u8> {
		let mut d = Self::discriminator().to_vec();
		d.append(&mut self.try_to_vec().expect("Should always serialize"));
		d
	}
}

/// An event that can be emitted via a Solana log. See [`emit!`](crate::prelude::emit) for an example.

pub trait Event: AnchorSerialize + AnchorDeserialize + Discriminator {
	fn data(&self) -> Vec<u8>;
}

// The serialized event data to be emitted via a Solana log.
// TODO: remove this on the next major version upgrade.

#[doc(hidden)]
#[deprecated(since = "0.4.2", note = "Please use Event instead")]
pub trait EventData: AnchorSerialize + Discriminator {
	fn data(&self) -> Vec<u8>;
}
```

For instance, the `data()` method of the `InstructionData` trait creates a byte array containing the `Discriminator` and the serialized data of the instruction:

```
pub trait InstructionData: Discriminator + AnchorSerialize {
    fn data(&self) -> Vec<u8> {
        let mut d = Self::discriminator().to_vec();
        d.append(&mut self.try_to_vec().expect("Should always serialize"));
        d
    }
}
```

Here, `Self::discriminator().to_vec()` creates a vector containing the `Discriminator` of the data type, and `self.try_to_vec().expect("Should always serialize")` creates a vector containing the serialized data of the instruction. Both vectors are then concatenated to create the resulting byte array.

## Discriminators in Anchor Account Processing

This code block is part of the `#[account]` procedural macro implementation and is responsible for implementing the `Discriminator` trait for a specific account struct.

```
impl #impl_gen anchor_lang::Discriminator for #account_name #type_gen #where_clause {
    const DISCRIMINATOR: [u8; 8] = #discriminator;
}
```

The following piece of code computes the Discriminator by hashing the namespace of the account structure and the name of the account structure. It then takes the first 8 bytes of this hash to form the discriminator. This Discriminator is used to uniquely identify the account structure during the serialization and deserialization process.

```
let discriminator: proc_macro2::TokenStream = {
    // Namespace the discriminator to prevent collisions.
    let discriminator_preimage = {
        // For now, zero copy accounts can't be namespaced.
        if namespace.is_empty() {
            format!("account:{account_name}")
        } else {
            format!("{namespace}:{account_name}")
        }
    };
    let mut discriminator = [0u8; 8];
    discriminator.copy_from_slice(
        &anchor_syn::hash::hash(discriminator_preimage.as_bytes()).to_bytes()[..8],
    );
    format!("{discriminator:?}").parse().unwrap()
};
```

When the account data is being deserialized, this function first checks the length of the data buffer to ensure it is at least as long as the discriminator. It then compares the first 8 bytes of the data buffer with the expected discriminator. If they do not match, this is an indication that an incorrect account data structure is being used, and the function will return with an error.

```
 fn try_deserialize(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
     if buf.len() < #discriminator.len() {
         return Err(anchor_lang::error::ErrorCode::AccountDiscriminatorNotFound.into());
     }
     let given_disc = &buf[..8];
     if &#discriminator != given_disc {
         return Err(anchor_lang::error!(anchor_lang::error::ErrorCode::AccountDiscriminatorMismatch).with_account_name(#account_name_str));
     }
     Self::try_deserialize_unchecked(buf)
 }
```

Let's illustrate the importance of the discriminator with an example.

Consider a program that manages two types of accounts, Account A and Account B. Both accounts are owned by the same program and have identical fields. Now, suppose you have an instruction called 'foo' that is designed to only operate on Account A.

However, a user mistakenly passes Account B as an argument to the 'foo' instruction. Given that Account B shares the same owner and the same fields as Account A, how can the program detect this mistake and throw an error?

This is where the discriminator comes into play. It uniquely identifies the type of an account. Even though Account A and Account B are structurally identical and share the same owner, they have different discriminators.

When the 'foo' instruction gets executed, the Anchor framework checks the discriminator of the account passed as argument. If you have declared 'foo' as `foo: Account<'info, A>`, Anchor will make sure that the passed account's discriminator matches that of Account A. If the discriminators don't match (as would be the case if Account B was passed), Anchor raises an error, preventing any unintended effects on Account B.

The discriminator helps Anchor to ensure that the account being processed is indeed the one expected, preventing type-related errors at runtime. This mechanism is automatically handled when you use the `Account` type in Anchor, adding an extra layer of security to your program.

## Conclusion

In conclusion, discriminators in Anchor play an essential role in managing and distinguishing between various types of data and account structures. They serve as unique identifiers, enabling the Anchor framework to handle data correctly during runtime. The discriminator ensures that each is treated as a distinct entity, thereby preventing any inadvertent account manipulations. This mechanism greatly enhances the robustness and security of your programs, providing reassurance that potential type-related errors are kept to a minimum.

All my code you can find at anchor's github: https://github.com/coral-xyz/anchor/tree/master/lang