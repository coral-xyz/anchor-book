# Events

Events in Anchor provide a powerful mechanism for notifying and communicating between different components of a Solana dApp. They allow for the emission and tracking of occurrences within the program's execution. This documentation will cover the concept of events in Anchor and how to use them in your program development.

## Table of Contents

- [Introduction to Events](#introduction-to-events)
- [Defining Events](#defining-events)
- [Emitting Events](#emitting-events)
- [Subscribing to Events](#subscribing-to-events)
- [Unsubscribing from Events](#unsubscribing-from-events)
- [CPI Events](#cpi-events)

## Introduction to Events

An event is a structured piece of data that holds information about a specific occurrence in a program. Events can be used to provide transparency, traceability, and synchronization in decentralized applications.

There is no native support for events in Solana. Because of this, Anchor events depends on logging in order to emit events. Programs log base64 encoded event data and clients parse the logs of the transaction to interpret the events.

[SIMD-0057](https://github.com/solana-foundation/solana-improvement-documents/pull/57) aims to add support for native events.

## Defining Events

Events are defined using the `#[event]` attribute macro. This macro allows you to specify the fields that an event should contain. Events can include various data types, making them versatile for different use cases.

```rust
#[event]
pub struct TransferEvent {
    from: Pubkey,
    to: Pubkey,
    amount: u64,
}
```

In this example, we define an event named `TransferEvent` with three fields: `from` (sender's address), `to` (receiver's address), and `amount` (the transferred amount).

## Emitting Events

To emit an event within your Anchor program, you can use the `emit!` macro:

```rust
#[program]
pub mod my_program {
    use super::*;

    pub fn transfer(ctx: Context<TransferContext>, amount: u64) -> Result<()>  {
        // Perform transfer logic

        // Emit the TransferEvent
        emit!(TransferEvent {
            from: *ctx.accounts.from.key,
            to: *ctx.accounts.to.key,
            amount,
        });

        Ok(())
    }
}
```

In this example, when the `transfer` function is called, a `TransferEvent` is emitted using the `emit!` macro. The relevant data is populated into the event fields.

## Subscribing to Events

Anyone can subscribe to events emitted by your program using Anchor's event subscription mechanisms.

You can subscribe to events using Anchor TS library([@coral-xyz/anchor](https://www.npmjs.com/package/@coral-xyz/anchor)):

```ts
const subscriptionId = program.addEventListener("TransferEvent", (event) => {
  // Handle event...
});
```

## Unsubscribing from Events

The event listener should be removed once it's no longer required:

```ts
program.removeEventListener(subscriptionId);
```

## CPI Events

Solana nodes truncate logs larger than 10 KB by default which makes regular events emitted via `emit!` macro unreliable.

Unlike logs, RPC providers store instruction data without truncation. CPI events make use of this by executing a self-invoke with the event data in order to store the event(s) in the instruction.

To use CPI events, enable `event-cpi` feature of `anchor-lang`:

```toml
anchor-lang = { version = "0.29.0", features = ["event-cpi"] }
```

add `#[event_cpi]` to accounts struct:

```rs
#[event_cpi]
#[derive(Accounts)]
pub struct TransferContext {}
```

and in your instruction handler, use `emit_cpi!`:

```rust
#[program]
pub mod my_program {
    use super::*;

    pub fn transfer(ctx: Context<TransferContext>, amount: u64) -> Result<()>  {
        // Perform transfer logic

        // Emit the TransferEvent
        emit_cpi!(TransferEvent {
            from: *ctx.accounts.from.key,
            to: *ctx.accounts.to.key,
            amount,
        });

        Ok(())
    }
}
```

> Note: `#[event_cpi]` appends 2 accounts to the instruction; one being the event authority and the other the program itself.
> This is necessary in order to make sure only the program can invoke the event CPI instruction.
