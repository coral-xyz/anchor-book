# Events

An [`Event`](https://docs.rs/anchor-lang/latest/anchor_lang/trait.Event.html) in Anchor is a special type of base-64 encoded Solana program log that can be emitted within an instruction and is (de)serialized from Rust a `struct`. Data that is provided within an event emission must be able to be represented as bytes and is logged using the [`sol_log_data`](https://docs.rs/solana-program/latest/solana_program/log/fn.sol_log_data.html) Solana function.

## Event Structs

A new `event` type is easily created using the [`#[event]`](https://docs.rs/anchor-lang/latest/anchor_lang/attr.event.html) attribute on the designated Rust `struct`:

```rust,ignore
use anchor_lang::prelude::*;

#[event]
pub struct MyEvent {
  pub authority: Pubkey,
}
```

This attribute implements the `AnchorSerialize`, `AnchorDeserialize`, `Event`, and `Discriminator` Anchor traits for the `struct` in order to appropriately write the encoded byte data in the Solana program logs for consumption.

## Emitting the Event

Once you have a `struct` definition that is defined as an `Event` using the `#[event]` attribute proc-macro, the [`emit!`](https://docs.rs/anchor-lang/latest/anchor_lang/macro.emit.html) macro is used to initiate the serialization of the argued `struct` into bytes to be logged via the `sol_log_data` function.

```rust,ignore
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct MyInstruction<'info> {
    pub authority: Signer<'info>,
}

#[event]
pub struct MyEvent {
    pub caller: Pubkey,
}

pub fn my_instruction_handler(ctx: Context<MyInstruction>) -> Result<()> {
    emit!(MyEvent {
        caller: ctx.accounts.authority.key(),
    });

    Ok(())
}
```

## Listening for the Event

Since an event is simply an encode series of bytes as a program log, they can be listened for using the program log pubsub capabilities that the Solana runtime provides. Anchor also has easy to use abstractions for both Rust and Node.js clients to be able to subscribe to the events and trigger logic based on their emission.

### Rust

```rust,ignore
use anchor_client::{Client, Cluster};
use anchor_client::solana_sdk::signature::Keypair;
use anchor_client::solana_sdk::commitment_config::CommitmentConfig;
use my_program::events::MyEvent;
use std::rc::Rc;
use std::thread::sleep;
use std::time::Duration;

fn main() -> Result<()> {
    let client = Client::new_with_options(
        Cluster::Localnet,
        Rc::new(Keypair::new()),
        CommitmentConfig::confirmed(),
    );

    let program = client.program(my_program::ID);

    let handler = program.on(|_ctx, e: MyEvent| {
        // ...
    })?;

    sleep(Duration::from_secs(30));

    handler.shutdown()?;

    Ok(())
}
```

### Node.js

```ts,ignore
import { Program, web3 } from '@project-serum/anchor'
import { IDL, MyProgram } from './idl'

const PROGRAM_ID = new web3.PublicKey(/* ... */)

type MyEvent = {
    caller: web3.PublicKey
}

const sleep = (ms: number) =>
    new Promise(resolve => {
        setTimeout(resolve, ms)
    })

async function main() {
    const program = new Program<MyProgram>(
        new web3.Connection('http://localhost:8899', 'confirmed'),
        PROGRAM_ID
    )

    const listener = program.addEventListener('MyEvent', (e: MyEvent, _slot: number) => {
        // ...
    })

    await sleep(30 * 1000)

    await program.removeEventListener(listener)
}
```
