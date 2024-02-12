# Zero Copy in Anchor

## Introduction

In the Solana blockchain development arena, where efficiency is key, Anchor stands out with its implementation of zero-copy deserialization. This technique is a game-changer for smart contract development, offering a way to handle data that's both faster and more resource-efficient.

On Solana, operations cost money and time. Traditional data handling, which often involves copying data from one format to another, can be too slow and expensive for blockchain's fast-paced environment. This is where zero-copy deserialization comes into play.

### What's Zero-Copy All About?

Imagine you're moving house. Traditional data handling is like packing up all your stuff, moving it to the new house, and then unpacking it all again. That's a lot of work, right? Zero-copy is like skipping the packing and unpacking part. You just take your things as they are and put them straight where they need to go in the new house. No extra steps!

#### How Zero-Copy Works

Normally, when programs deal with data, they read it, make a copy, and then work on that copy. But with zero-copy, programs work directly on the original data. It's like reading a book and taking notes directly on the pages instead of copying out all the text onto a separate piece of paper first.

## Zero Copy in Action

- **Saving Time and Money**:
  - Each operation in a Solana smart contract costs money and time.
  - Zero-copy reduces the amount of work, saving time and reducing costs.
- **Great for Big Data**:
  - Ideal for handling large amounts of data.
  - Like accessing any book in a huge library instantly, without moving it.

### Getting into Zero-Copy Deserialization

##### Struct Annotation with Zero-Copy:

- **Marking the Territory**: In Anchor, when you want to use zero-copy, you start by marking your data structures with `#[account(zero_copy)]`. It's like putting up a sign that says, "Hey, handle this data directly, no extra copies needed."

##### Using AccountLoader:

- **Choosing the Right Tool**: Normally, you'd use `Account` for handling data, but for zero-copy, you switch to `AccountLoader`. Think of it as swapping out a regular screwdriver for a power drill – it's more suited for the job.
- **How It Changes Things**: This isn't just a simple swap. Using `AccountLoader` changes how you initialize and access your accounts in the program. It's like learning a new dance move – you've got to get the steps just right.

Alright, let's dive into setting up zero-copy in our Solana program. It's like upgrading our simple digital locker to something more advanced.

**Step 1: Kick Things Off**

First up, we're gonna create a new workspace. This is like laying out our tools and workspace before we start building something cool. Open up your terminal and type:

```shell
anchor init zero-copy
```

**Step 2: The Basic Blueprint**

Now, let's lay down the foundation. We'll start with a basic program, kind of like sketching out what our locker will look like. Here's the code to start with:

```rust,ignore
use anchor_lang::prelude::*;

declare_id!("<program id>"); //Replace this with your program id

#[account]
pub struct MyData {
	pub data_field: u64,
}

#[program]
pub mod zero_copy {
	use super::*;
	pub fn create_data(ctx: Context<CreateData>, data: u64) -> Result<()> {
		let my_data = &mut ctx.accounts.my_data;
		my_data.data_field = data;
		Ok(())
	}
}

#[derive(Accounts)]
pub struct CreateData<'info> {
	#[account(init, payer = user, space = 8 + 8)]
	pub my_data: Account<'info, MyData>,
	#[account(mut)]
	pub user: Signer<'info>,
	pub system_program: Program<'info, System>,
}
```

This simple program lets you store a number on Solana. Think of it as creating a digital locker, named `MyData`, where you can keep a specific type of information—in this case, a number (technically, a 64-bit unsigned integer). The program has a special function, `create_data`, which is like a command that says, "Hey, let's set up a new locker and put this number in it."
When you use this function, you need to tell the program a couple of things: where this new locker (`MyData` account) is going to be and who's going to pay for setting it up (that's the `user`).

Now, build the program

```shell
anchor build
```

and deploy it to the blockchain

```shell
anchor deploy
```

Once we've deployed, we can head over to the Solana explorer to see how things went down. We're checking the transaction fees and account changes - kind of like getting a receipt after you buy something.

![[Initial Explorer]](../images/zero-copy-explorer-1.png)

**Step 3: Implementing Zero Copy**

Now for the cool part. We're going to tweak our program to use zero-copy. Imagine we're adding some fancy features to our locker. Here's what you need to change:

1. Switch `#[account]` to `#[account(zero_copy)]`.
2. Change how we talk to `my_data`. Instead of `let my_data = &mut ctx.accounts.my_data;`, we're now going to use `let mut my_data = ctx.accounts.my_data.load_init()?;`.
3. Update `pub my_data: Account<'info, MyData>,` to `pub my_data: AccountLoader<'info, MyData>,`.

Here's what your final code should look like:

```rust,ignore
use anchor_lang::prelude::*;

declare_id!("<new program id>");

#[account(zero_copy)]
pub struct MyData {
	pub data_field: u64,
}

#[program]
pub mod zero_copy {
	use super::*;
	pub fn create_data(ctx: Context<CreateData>, data: u64) -> Result<()> {
		let mut my_data = ctx.accounts.my_data.load_init()?;
		my_data.data_field = data;
		Ok(())
	}
}

#[derive(Accounts)]
pub struct CreateData<'info> {
	#[account(init, payer = user, space = 8 + 8)]
	pub my_data: AccountLoader<'info, MyData>,
	#[account(mut)]
	pub user: Signer<'info>,
	pub system_program: Program<'info, System>,
}
```

Time to build this upgraded version:

```shell
anchor build
```

and deploy as well

```shell
anchor deploy
```

Let's head back to the Solana explorer and see the difference this time. We're looking for changes in how the program handles data and costs.

![[After Zero Copy Explorer]](../images/zero-copy-explorer-2.png)

Let's discuss the differences in the explorer for both programs:

| Attribute                  | Non-Zero-Copy Program                        | Zero-Copy Program                            |
| -------------------------- | -------------------------------------------- | -------------------------------------------- |
| **Fee Payer Account**      |                                              |                                              |
| Address                    | E81ZJiW43A7njtWeUSS7AyULgpKzXrCWxzcd3hNsx6cR | C8hp5kENHj6AQo885s9UnhrNZAR9sbdJugeJARERS3Gh |
| Change (SOL)               | -◎0.00115144                                 | -◎1.6549936                                  |
| Post Balance (SOL)         | ◎6.60661956                                  | ◎3.37001744                                  |
| **Signer Account**         |                                              |                                              |
| Address                    | 9mVzvgPy1SEpy8D2gTpvntyFTZRGKedc5C9nFKvPUD7i | 676dsCpSKNXKQSdT9TtP99cLnNQpFkSKW64z8q2Z5tWQ |
| Change (SOL)               | +◎0.00114144                                 | +◎0.00139896                                 |
| Post Balance (SOL)         | ◎0.00114144                                  | ◎0.00139896                                  |
| **Writable Account 1**     |                                              |                                              |
| Address                    | 2YeV5tem9a3LdDxkuaaRFGsYc6PKvqUMgg7Scv9rmMU9 | 2bwADovoqSzbbojfnEUThMT7uKBpN6UiK3iVqi2qLc4N |
| Change (SOL)               | +◎2.68776408                                 | +◎3.308262                                   |
| Post Balance (SOL)         | ◎2.68776408                                  | ◎3.308262                                    |
| **Writable Account 2**     |                                              |                                              |
| Address                    | 5tz3qxaMDZyXAJ7Ufrx4B4wGupThs5kg6aapWbCwuuBg | 8BdZwFLbTah4SYSkCDiw52qAQi4L7ePgYG1kyxYLPBKZ |
| Change (SOL)               | -◎2.68776408                                 | -◎1.65467736                                 |
| Post Balance (SOL)         | ◎0                                           | ◎0                                           |
| **System Program**         | 0 (◎0.000000001)                             | 0 (◎0.000000001)                             |
| **BPF Upgradeable Loader** | 0 (◎0.000000001)                             | 0 (◎0.000000001)                             |
| **Sysvar: Clock**          | 0 (◎0.00116928)                              | 0 (◎0.00116928)                              |
| **Sysvar: Rent**           | 0 (◎0.0010092)                               | 0 (◎0.0010092)                               |

**Key Observations:**

- The fee for the zero-copy program is significantly higher, indicating more complex or larger transactions.
- The writable accounts in both programs show different patterns of credit and debit, reflecting the different operations performed by each program.
- The zero-copy program appears to involve larger transactions or data changes, as seen in the larger changes in SOL for the writable accounts.

## Wrapping it up: Zero Copy, a game changer in Solana Development

So, we've been on quite a journey exploring how zero-copy deserialization shakes things up in the Solana world. Think of it like finding a shortcut that gets you to your destination faster and saves fuel – that's what zero-copy does in the blockchain universe. It's all about getting to your data quickly and efficiently, without the extra hassle of moving it around.

We started with a simple program, kind of like a basic recipe. It was neat and did the job of storing numbers on the blockchain. But then, we spiced things up by introducing zero-copy. This was like upgrading from a home-cooked meal to a gourmet dish. We saw some real differences when we took both versions of our program for a spin on the Solana devnet.

Here's what caught our eye:

- **Cost of Doing Business**: When we used zero-copy, it cost a bit more in transaction fees. It's like paying extra for express delivery because you're getting a more complex service.
- **Handling the Numbers**: The changes in how much SOL was moving around were more noticeable with zero-copy. It's like zero-copy was juggling more balls in the air at the same time.

This shows us that zero-copy is not just a fancy programming trick. It's a real powerhouse for dealing with big, complicated data on the blockchain. It's perfect for when you've got a lot of information to handle and you need to be smart about it.

For those hungry to learn more, there's a bunch of stuff out there on zero-copy. You can dive into tutorials, chat with other developers, and really get into the nitty-gritty of it all.

Here's a [Tutorial on handling large accounts on Solana](https://youtu.be/zs_yU0IuJxc?si=uhXljfVwet1zDdQB) on the Solana youtube channel.

Remember, zero-copy is more than just a time-saver; it's about making your blockchain work smarter, not harder. It's about being ready for the big league of tomorrow's tech world. So, keep exploring, keep learning, and who knows what cool solutions you'll cook up next!
