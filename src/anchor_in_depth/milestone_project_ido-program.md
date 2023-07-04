# Project IDO Program

## Overview

It is now time to implement the in-depth concepts you learned in section 4 of the book through a project. Create a new anchor workspace

```bash
anchor init ido-program
```

As the name suggests, this is a program that helps projects do an Initial DEX Offering to depositors.

This program will be doing a couple of things. In an IDO, a project distributes its native tokens among willing depositors. There are a few types of IDOs which are done. We will be implementing a fair launch IDO platform. In here, a project escrows the native tokens into a pool. When the IDO opens, depositors come and deposit their deposit tokens into the pool. After the IDO is over, depositors can claim their native tokens, the amount of which is calculated by the the pool percentage share of their deposit. The project can also finally withdraw all the deposited deposit tokens.

We recommend keeping programs in a single `lib.rs` file.

## Setting Up the Pool State

Let’s think about what information we would want to store in our pool account.
We would want to know the authority of the pool.
The mint public keys of the redeemable intermediary token, native tokens, and deposit tokens are also necessary to ensure that the correct tokens are deposited in the pool.
We would need to know the associated token accounts of the pool authority which would store and distribute tokens. Additionally, we would need to know the number of tokens being distributed.
Finally, we would require the timestamps for the IDO and the bump associated with the pool PDA.
Add the following code at the bottom of the `lib.rs` file

```rust
#[account]
pub struct PoolAccount {
    /// Authority of the Pool
    pub pool_authority: Pubkey,

    /// Mint of redeemable tokens (Intermediate tokens which will be exchanged for native tokens)
    pub redeemable_mint: Pubkey,

    /// Mint of project tokens
    pub native_mint: Pubkey,

    /// Mint of deposit tokens
    pub deposit token_mint: Pubkey,

    /// Token Account of Pool associated with the project token mint
    pub pool_native: Pubkey,

    /// Token Account of Pool associated with deposit token mint
    pub pool_deposit token: Pubkey,

    /// Total number of native tokens being distributed
    pub total_native_tokens: u64,

    /// Unix timestamp for starting IDO
    pub start_ido_ts: i64,

    /// Unix timestamp for ending IDO
    pub end_ido_ts: i64,

    /// Unix timestamp for withdrawing deposit token from pool
    pub withdraw_deposit token_ts: i64,

    /// Bump
    pub bump: u8,
}

impl PoolAccount {
    pub const LEN: usize = DISCRIMINATOR_LENGTH   // Discriminator Length
        + PUBKEY_LENGTH                           // Pool Authority
        + PUBKEY_LENGTH                           // Redeemable Mint
        + PUBKEY_LENGTH                           // deposit token Mint
        + PUBKEY_LENGTH                           // Pool Native Token Account
        + PUBKEY_LENGTH                           // Native Mint
        + PUBKEY_LENGTH                           // Pool deposit token Account
        + DATA_LENGTH_64                          // Total Native Token Amount
        + DATA_LENGTH_64                          // Start IDO TS
        + DATA_LENGTH_64                          // End IDO TS
        + DATA_LENGTH_64                          // Withdraw deposit token TS
        + DATA_LENGTH_8; // Bump
}

const DISCRIMINATOR_LENGTH: usize = 8;
const PUBKEY_LENGTH: usize = 32;
const DATA_LENGTH_64: usize = 8;
const DATA_LENGTH_8: usize = 1;
```

This is all the data we store in `PoolAccount`. We also add the `impl` block for `PoolAccount` which calculates the amount of space required to pay rent.

## Instructions and Handler Functions

Let’s think about our program flow. The program will have 4 instructions. We should be able to initialize a pool that will hold information regarding the IDO. When the IDO starts, depositors should be able to exchange their deposit tokens for the same number of intermediary tokens. After the IDO is over, depositors should be able to exchange their intermediary tokens for the project’s tokens. Finally, the project should be able to redeem all the deposit tokens from the pool.

### Initializing the Pool

The first step is adding the instruction that will set up the pool account. We will be writing the `initialize_pool` handler function and the `InitializePool` accounts struct.

```rust
#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(init, payer = authority, space = PoolAccount::LEN)]
    pub pool: Box<Account<'info, PoolAccount>>,

    /// CHECK: This is not dangerous
    #[account(
        mut,
        seeds = [native_mint.key().as_ref()],
        bump
    )]
    pub pool_signer: AccountInfo<'info>,

    #[account(
        mint::authority = pool_signer,
        constraint = redeemable_mint.supply == 0
    )]
    pub redeemable_mint: Box<Account<'info, Mint>>,

    #[account(mint::decimals = redeemable_mint.decimals)]
    pub deposit_token_mint: Box<Account<'info, Mint>>,

    #[account(address = pool_native.mint)]
    pub native_mint: Box<Account<'info, Mint>>,

    #[account(mut, constraint = pool_native.owner == *pool_signer.key)]
    pub pool_native: Box<Account<'info, TokenAccount>>,

    #[account(constraint = pool_deposit_token.owner == *pool_signer.key)]
    pub pool_deposit_token: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub creator_native: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}
```

Let’s look at the accounts we added

-   `pool`: We create the pool account with the init constraint. We add a payer by the name `authority`: which we add later in the account struct. And we also add the space needed to store the account which we already calculated in the `impl` block of `PoolAccount`.
-   `pool_signer`: This is the authority that will have control of the pool.
-   `redeemable_mint`: The mint address of the redeemable tokens. We add some constraints to check that the token has the correct configurations set.
-   `deposit token_mint`: The mint address of the deposit tokens. We use the constraint that the decimals of the deposit tokens and the redeemable tokens should be the same.
-   `native_mint`: The mint address of the native token.
-   `pool_native`: The token account owned by the pool signer that will hold all the native tokens.
-   `pool_deposit_token`: The token account owned by the pool signer that will hold all the deposit tokens sent by the depositor.
-   `authority`: The transaction signer
-   `creator_native`: The token account owned by the project which will send the native tokens to `pool_native`

Now this code has a problem. We don’t actually have the `Mint`, `Token` and `TokenAccount` structs available in the current scope.

For that, we need the dependency `anchor-spl`. Go into your `Cargo.toml` file inside the src folder and add in the dependency:

```toml
[package]
name = "ido-program"
version = "0.1.0"
description = "Created with Anchor"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "ido_program"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.28.0"
anchor-spl = "0.28.0"
```

Now run the following command.

```bash
anchor build
```

You will see errors, which are easy to fix.

We can bring everything we need into scope. Import everything at the top of your `lib.rs` file.

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_option::COption;
use anchor_spl::token::{self, Burn, Mint, MintTo, TokenAccount, Transfer, Token};

declare_id!("GYpxvUxtesyBSn69gnbfQChoUyJ7qdsG9nXS2Y2dQNH6");

//--snip--
```

Now we can move forward with writing the handler function `initialize_pool`

```rust
#[program]
pub mod ido_program {
    use super::*;

    #[access_control(pre_ido_phase(start_ido_ts))]
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        total_native_tokens: u64,
        start_ido_ts: i64,
        end_ido_ts: i64,
        withdraw_deposit_token_ts: i64,
        bump: u8,
    ) -> Result<()> {
        if !(start_ido_ts < end_ido_ts && end_ido_ts < withdraw_deposit_token_ts) {
            return Err(ErrorCode::NonSequentialTimestamps.into());
        }

        if total_native_tokens == 0 {
            return Err(ErrorCode::InvalidParameter.into());
        }

        let pool = &mut ctx.accounts.pool;

        pool.pool_authority = *ctx.accounts.authority.key;
        pool.redeemable_mint = ctx.accounts.redeemable_mint.key();
        pool.native_mint = ctx.accounts.native_mint.key();
        pool.deposit_token_mint = ctx.accounts.deposit_token_mint.key();
        pool.pool_native = ctx.accounts.pool_native.key();
        pool.pool_deposit_token = ctx.accounts.pool_deposit_token.key();
        pool.total_native_tokens = total_native_tokens;
        pool.start_ido_ts = start_ido_ts;
        pool.end_ido_ts = end_ido_ts;
        pool.withdraw_deposit_token_ts = withdraw_deposit_token_ts;

        pool.bump = bump;

        //Transfer Native tokens from Creator to Pool Account
        let cpi_accounts = Transfer {
            from: ctx.accounts.creator_native.to_account_info(),
            to: ctx.accounts.pool_native.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, total_native_tokens)?;

        Ok(())
    }
}
```

The first thing we see, even before the function definition is an access_control function being invoked. We will come to them at a later point in time. For now let’s move on and understand what is going on.

The first thing we do after declaring the function signature is checking if the timestamps and the number of tokens given by the project are correct or not. If not, we return errors. Then we set all the fields of the `pool` structs.

Now, we need to make a Cross Program Invocation to the Token Program to transfer tokens from the creator’s account to the pool account.

We create a `Transfer` accounts instance. Here, we are basically declaring that tokens will be transferred from the `creator_native` token account to the `pool_native` token account, and the authority for that transfer will be the `authority` account.

We create a new `CpiContext` with the token program and the `Transfer` accounts instance we created.

And finally, we make a call to `token::transfer()` with the context and the number of tokens specified in the parameters.

The code will not compile yet. This is because the function `pre_ido_phase()` we called under `access_control` and the custom `ErrorCode`s we wrote have not been defined yet.

Add this at the bottom of the file.

```rust
//--snip--

#[error_code]
pub enum ErrorCode {
    #[msg("Timestamps are not Sequential")]
    NonSequentialTimestamps,
    #[msg("Invalid Parameter")]
    InvalidParameter,
    #[msg("IDO has not begun yet")]
    IdoFuture
}


// Access Control Modifiers

// IDO Starts in the Future
fn pre_ido_phase<'info>(start_ido_ts: i64) -> Result<()> {
    if !(get_timestamp() < start_ido_ts) {
        return Err(ErrorCode::IdoFuture.into());
    }
    Ok(())
}
```

And finally we add in the `get_timestamp()` function. Add this after the `pre_ido_phase()` function definition.

```rust
pub fn get_timestamp() -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
}
```

Inside the `pre_ido_phase` function, we must ensure that the `start_ido_ts` timestamp parameter is greater than the current timestamp.

Now, run `anchor build`. Now everything will compile correctly, with a warning of unused imports, which we can ignore.

### Exchanging Depositor’s Deposit Token for Redeemable Tokens

Now we can add the instruction that will allow depositors to deposit their deposit tokens and receive an equal number of redeemable tokens. We will write the handler function `exchange_deposit_token_for_redeemable()` and the `ExchangeDepositTokenForRedeemable` accounts struct.

Let’s start with `ExchangeDepositTokenForRedeemable`. Add this code after the `InitializePool` accounts struct.

```rust
#[derive(Accounts)]
pub struct ExchangeDepositTokenForRedeemable<'info> {
    #[account(mut, has_one = redeemable_mint, has_one = pool_deposit_token)]
    pub pool: Box<Account<'info, PoolAccount>>,

    ///CHECK: This is not dangerous
    #[account(seeds = [pool.native_mint.as_ref()], bump = pool.bump)]
    pub pool_signer: AccountInfo<'info>,

    #[account(
        mut,
        mint::authority = pool_signer
    )]
    pub redeemable_mint: Account<'info, Mint>,

    #[account(mut, address = pool_deposit_token.mint)]
    pub deposit_token_mint: Account<'info, Mint>,

    #[account(mut, constraint = pool_deposit_token.owner == *pool_signer.key)]
    pub pool_deposit_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, constraint = depositor_deposit_token.owner == *authority.key)]
    pub depositor_deposit_token: Account<'info, TokenAccount>,

    #[account(mut, constraint = depositor_redeemable.owner == *authority.key)]
    pub depositor_redeemable: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

We need the redeemable and deposit_token mint accounts. This is because we need to know which tokens we will be dealing with in this instruction.

We also need the deposit_token `TokenAccount`s owned by the pool_signer and the depositor. This is because we need to know from which account to which account tokens need to be transferred. In this case, deposit tokens will be transferred from the depositor’s `TokenAccount` to pool_signer’s `TokenAccount`.

And finally, we need to know the depositor’s redeemable `TokenAccount` to be able to mint redeemable token accounts to the depositor.

Let’s add the handler function. Add this after the `initialize_pool` function

```rust
    // --snip--

    #[access_control(unrestricted_phase(&ctx))]
    pub fn exchange_deposit_token_for_redeemable(
        ctx: Context<ExchangeDepositTokenForRedeemable>,
        amount: u64,
    ) -> Result<()> {
        if amount == 0 {
            return Err(ErrorCode::InvalidParameter.into());
        }
        // While token::transfer will check this, we prefer a verbose error msg
        if ctx.accounts.depositor_deposit_token.amount < amount {
            return Err(ErrorCode::LowDepositToken.into());
        }

        // Transfer depositor's deposit_token to pool deposit_token account.
        let cpi_accounts = Transfer {
            from: ctx.accounts.depositor_deposit_token.to_account_info(),
            to: ctx.accounts.pool_deposit_token.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Mint Redeemable to depositor Redeemable account.
        let seeds = &[
            ctx.accounts.pool.native_mint.as_ref(),
            &[ctx.accounts.pool.bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = MintTo {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            to: ctx.accounts.depositor_redeemable.to_account_info(),
            authority: ctx.accounts.pool_signer.clone(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount)?;

        Ok(())
    }
```

The handler function takes two parameters, the context, and the amount of deposit tokens to be sent.

The first thing we do is check if the amount given as the parameter is 0 or not, and throw an error if it is.

Then we check if the depositor’s deposit tokenAccount has a lesser amount of tokens than the amount specified. Although the `token::transfer` call already checks it, we want a verbose error message.

We create a new context with a `Transfer` object where we declare that tokens will be sent from the depositor’s deposit token account to the pool’s deposit token account.

We create a new `CpiContext` with the token program and the accounts context.

We then invoke `token::transfer` to transfer `amount` number of deposit tokens.

Now we need a mechanism to track which depositor deposited how much to the pool, since we don’t store the data anywhere. The easiest way to do that is to send an equal number of tokens to the depositor which they can use to redeem the native tokens once the IDO is over (Hence the name redeemable tokens). The authority to mint these tokens rests with the `pool_signer` which we check in `redeemable_mint`'s constraint in the accounts struct. These tokens don’t hold any value, and exactly the same number of redeemable tokens will be minted as the number of deposit tokens sent to the pool.

Now, since a PDA needs to sign a transaction to mint redeemable tokens, we have to invoke `CpiContext::new_with_signer()` instead of `CpiContext::new()`. And to get the signer, we need to construct the PDA seeds.

We construct the seeds with the `native_mint` address and bump we already store in the pool account to get the signer.

A `MintTo` context is created. Here we need to tell the program the mint account of the tokens that will be minted, the depositor’s token account to where the redeemable tokens will be sent, and the authority of the transaction which is the `pool_signer`.

We invoke `CpiContext::new_with_signer()` with the token program, the accounts context and the signer which we constructed.

Finally, we call `token::mint_to` to send an equal number of redeemable tokens to the depositor’s token account as the number of deposit tokens sent to the pool.

As a final step, add the errors and access control function, and build the program.

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Timestamps are not Sequential")]
    NonSequentialTimestamps,
    #[msg("Invalid Parameter")]
    InvalidParameter,
    #[msg("IDO has not begun yet")]
    IdoFuture,
	#[msg("Not the correct time to invest")]
    WrongInvestingTime,
    #[msg("Insufficient deposit tokens")]
    LowDepositToken
}

// Access Control Modifiers

// IDO Starts in the Future
fn pre_ido_phase<'info>(start_ido_ts: i64) -> Result<()> {
    if !(get_timestamp() < start_ido_ts) {
        return Err(ErrorCode::IdoFuture.into());
    }
    Ok(())
}

// Unrestricted Phase
fn unrestricted_phase<'info>(
    ctx: &Context<ExchangeDepositTokenForRedeemable<'info>>,
) -> Result<()> {
    if !(ctx.accounts.pool.start_ido_ts < get_timestamp()
        && ctx.accounts.pool.end_ido_ts > get_timestamp())
    {
        return Err(ErrorCode::WrongInvestingTime.into());
    }
    Ok(())
}
```

The access control function `unrestricted_phase` ensures that deposits are limited between the start_ido_ts and end_ido_ts.

Run `anchor build`

### Exchanging depositor’s Redeemable Tokens for Native Tokens

The instruction and handler function for this will look very similar to just the previous one.
Let’s look at `ExchangeRedeemableForNative`.

```rust
#[derive(Accounts)]
pub struct ExchangeRedeemableForNative<'info> {
    #[account(has_one = redeemable_mint, has_one = pool_native)]
    pub pool: Box<Account<'info, PoolAccount>>,

    /// CHECK: This is not dangerous
    #[account(seeds = [pool.native_mint.as_ref()], bump = pool.bump)]
    pub pool_signer: AccountInfo<'info>,

    #[account(
        mut,
        mint::authority = pool_signer
    )]
    pub redeemable_mint: Account<'info, Mint>,

    #[account(mut, constraint = pool_native.owner == *pool_signer.key)]
    pub pool_native: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut, constraint = depositor_native.owner == *authority.key)]
    pub depositor_native: Account<'info, TokenAccount>,

    #[account(mut, constraint = depositor_redeemable.owner == *authority.key)]
    pub depositor_redeemable: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

This is the same as the previous instruction, the only difference being we are dealing with the native and redeemable tokens this time.

We can move on to the `exchange_redeemable_for_native` handler function.

```rust
    // --snip--

    #[access_control(ido_over(&ctx.accounts.pool))]
    pub fn exchange_redeemable_for_native(ctx: Context<ExchangeRedeemableForNative>) -> Result<()> {
        let native_amount = (ctx.accounts.depositor_redeemable.amount as u128)
            .checked_mul(ctx.accounts.pool_native.amount as u128)
            .unwrap()
            .checked_div(ctx.accounts.redeemable_mint.supply as u128)
            .unwrap();

        let cpi_accounts = Burn {
            mint: ctx.accounts.redeemable_mint.to_account_info(),
            from: ctx.accounts.depositor_redeemable.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        token::burn(cpi_ctx, ctx.accounts.depositor_redeemable.amount)?;

        let seeds = &[
            ctx.accounts.pool.native_mint.as_ref(),
            &[ctx.accounts.pool.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_native.to_account_info(),
            to: ctx.accounts.depositor_native.to_account_info(),
            authority: ctx.accounts.pool_signer.to_account_info(),
        };

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);

        token::transfer(cpi_ctx, native_amount as u64)?;

        Ok(())
    }
```

Here we go through a few new steps.

The first step is to calculate how much native tokens the depositor will be receiving. The simple formula is

(Amount of Redeemable Tokens with depositor \* Amount of Native Tokens in Pool) / Supply of Redeemable Tokens

The next step is to `Burn` the depositor’s redeemable tokens. We create a `Burn` instance where we declare the redeemable token mint, depositor’s token account from where the tokens will be burned and the authority.

We create a new `CpiContext` with the token program and invoke `token::burn()`.

We then move on to calculate the seeds of the pool_signer and create a `Transfer` instance. Finally, we transfer the calculated amount of native tokens from `pool_native` to `depositor_native`.

We are not done yet, the final thing left to do is write the access control function `ido_over()`

```rust
//iDO Over
fn ido_over<'info>(pool_account: &Account<'info, PoolAccount>) -> Result<()> {
    if !(pool_account.end_ido_ts < get_timestamp()) {
        return Err(ErrorCode::IdoNotOver.into());
    }
    Ok(())
}
```

It’s a similar check we perform based on the timestamps.

Update the error codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Timestamps are not Sequential")]
    NonSequentialTimestamps,
    #[msg("Invalid Parameter")]
    InvalidParameter,
    #[msg("IDO has not begun yet")]
    IdoFuture,
    #[msg("Not the correct time to invest")]
    WrongInvestingTime,
    #[msg("Insufficient deposit tokens")]
    LowDepositToken,
    #[msg("IDO has not ended yet")]
    IdoNotOver
}
```

Run `anchor build`. You will see now that the warnings have disappeared.

### Withdrawing Deposit Tokens From the Pool

Now the final piece of the program that’s left is allowing the project to withdraw funds from the pool. Add this in the accounts struct

```rust
#[derive(Accounts)]
pub struct WithdrawPoolDepositToken<'info> {
    #[account(has_one = pool_deposit_token)]
    pub pool: Box<Account<'info, PoolAccount>>,

    ///CHECK: This is not dangerous
    #[account(seeds = [pool.native_mint.as_ref()], bump = pool.bump)]
    pub pool_signer: AccountInfo<'info>,

    #[account(address = pool_deposit_token.mint)]
    pub deposit_token_mint: Account<'info, Mint>,

    #[account(mut, constraint = pool_deposit_token.owner == *pool_signer.key)]
    pub pool_deposit_token: Account<'info, TokenAccount>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub creator_deposit_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

Here we need the project authority to sign the transaction to withdraw the pool deposit tokens.

Add in the handler function `withdraw_pool_deposit_token`

```rust
    // --snip--

    #[access_control(can_withdraw_deposit_token(&ctx.accounts.pool))]
    pub fn withdraw_pool_deposit_token(ctx: Context<WithdrawPoolDepositToken>) -> Result<()> {
        let seeds = &[
            ctx.accounts.pool.native_mint.as_ref(),
            &[ctx.accounts.pool.bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = Transfer {
            from: ctx.accounts.pool_deposit_token.to_account_info(),
            to: ctx.accounts.creator_deposit_token.to_account_info(),
            authority: ctx.accounts.pool_signer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, ctx.accounts.pool_deposit_token.amount)?;

        Ok(())
    }
}
```

Again, here we do a similar thing. Calculate the signer seeds of pool_signer, Create a new `CpiContext` with the signer and invoke `token::transfer()` to transfer all deposit tokens from the pool to the project’s deposit `TokenAccount`

Add the access control function

```rust
//Can Withdraw deposit_token
fn can_withdraw_deposit_token<'info>(pool_account: &Account<'info, PoolAccount>) -> Result<()> {
    if !(pool_account.withdraw_deposit_token_ts < get_timestamp()) {
        return Err(ErrorCode::CannotWithdrawYet.into());
    }
    Ok(())
}
```

And finally, update the error codes.

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Timestamps are not Sequential")]
    NonSequentialTimestamps,
    #[msg("Invalid Parameter")]
    InvalidParameter,
    #[msg("IDO has not begun yet")]
    IdoFuture,
    #[msg("Not the correct time to invest")]
    WrongInvestingTime,
    #[msg("Insufficient deposit tokens")]
    Lowdeposit token,
    #[msg("IDO has not ended yet")]
    IdoNotOver,
    #[msg("Cannot withdraw deposit token yet")]
    CannotWithdrawYet
}
```

Run `anchor build`

Now we can move onto testing our program.

## Testing Our Program

Head over to `tests/ido-program.ts`. It will look something like this.

```ts
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { IdoProgram } from "../target/types/ido_program";

describe("test", () => {
    // Configure the client to use the local cluster.
    anchor.setProvider(anchor.AnchorProvider.env());

    const program = anchor.workspace.Test as Program<IdoProgram>;

    it("Is initialized!", async () => {
        // Add your test here.
        const tx = await program.methods.initialize().rpc();
        console.log("Your transaction signature", tx);
    });
});
```

We need the `@solana/spl-token` npm package to test out our functions. Install it.

```bash
npm i @solana/spl-token
```

Now, the first thing we need to do is separate out the provider because we will need it afterward. And also import all the packages we need.

```ts
import * as anchor from "@coral-xyz/anchor";
import { Transaction, SystemProgram, PublicKey } from "@solana/web3.js";
import {
    createAccount,
    createMint,
    getAccount,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { assert } from "chai";
import { IdoProgram } from "../target/types/ido_program";

describe("ido-program", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);
// --snip--
```

Great! Now the first test we will be to initialize everything so that we can run the actual tests.

Let’s first declare all the variables we will need in the subsequent tests.

```ts
describe("ido-program", () => {
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.local();
    anchor.setProvider(provider);

    const program = anchor.workspace.IdoProgram as Program<IdoProgram>;

    let nativeTokenAmount = new anchor.BN(1000000);

    let depositTokenMint: PublicKey;
    let redeemableMint: PublicKey;
    let nativeMint: PublicKey;

    let projectDepositAccount: PublicKey;
    let projectNativeAccount: PublicKey;

    let depositorDepositAccount: PublicKey;
    let depositorNativeAccount: PublicKey;
    let depositorRedeemable: PublicKey;

    let poolNative: PublicKey;
    let poolDepositToken: PublicKey;

    let poolSigner: PublicKey;

    let nowBn: anchor.BN;
    let startIdoTs: anchor.BN;
    let endIdoTs: anchor.BN;
    let withDrawDepositTokenTs: anchor.BN;

    const payer = anchor.web3.Keypair.generate();
    const mintAuthority = anchor.web3.Keypair.generate();

    const project = anchor.web3.Keypair.generate();
    const depositor = anchor.web3.Keypair.generate();

    let pool = anchor.web3.Keypair.generate();
});
```

### Initialize the Program State

Now let’s write the first test

```ts
	//--snip--

    it("Can initialize the program state", async () => {
        const transferSig = await provider.connection.requestAirdrop(
            payer.publicKey,
            10000000000
        );

        const latestBlockHash = await provider.connection.getLatestBlockhash();

        await provider.connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: transferSig,
        });

        const tx = new Transaction();

        tx.add(
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: mintAuthority.publicKey,
                lamports: 2000000000,
            }),
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: project.publicKey,
                lamports: 2000000000,
            }),
            SystemProgram.transfer({
                fromPubkey: payer.publicKey,
                toPubkey: depositor.publicKey,
                lamports: 2000000000,
            })
        );

        await provider.sendAndConfirm(tx, [payer]);

        depositTokenMint = await createMint(
            provider.connection,
            payer,
            mintAuthority.publicKey,
            null,
            0
        );

        nativeMint = await createMint(
            provider.connection,
            payer,
            mintAuthority.publicKey,
            null,
            0
        );

        projectDepositAccount = await createAccount(
            provider.connection,
            payer,
            depositTokenMint,
            project.publicKey
        );

        projectNativeAccount = await createAccount(
            provider.connection,
            payer,
            nativeMint,
            project.publicKey
        );

        depositorDepositAccount = await createAccount(
            provider.connection,
            payer,
            depositTokenMint,
            depositor.publicKey
        );

        depositorNativeAccount = await createAccount(
            provider.connection,
            payer,
            nativeMint,
            depositor.publicKey
        );

        await mintTo(
            provider.connection,
            payer,
            nativeMint,
            projectNativeAccount,
            mintAuthority,
            nativeTokenAmount.toNumber()
        );

        await mintTo(
            provider.connection,
            payer,
            depositTokenMint,
            depositorDepositAccount,
            mintAuthority,
            10000
        );

        const projectNativeAccountTokenAccount = await getAccount(
            provider.connection,
            projectNativeAccount
        );

        assert.strictEqual(
            projectNativeAccountTokenAccount.amount.toString(),
            nativeTokenAmount.toNumber().toString()
        );
    });
})
```

The first thing we did was request 10 SOL to the `payer` account. Then we transfer 2 SOL each to `mintAuthority`, `project` and `depositor` accounts so that they can pay rent and gas fees.

Then we create dummy `deposit tokenMint` and `nativeMint` accounts for testing purposes.

We create `TokenAccount`s for these mints owned by the `project` and the `depositor`.

Finally we mint native tokens to the `project` and deposit tokens to the `depositor`.

Run `anchor test`. It should show 1 test passed.

Now we are ready to test out our instructions.

### Initialize the Pool

```ts
	//--snip--

	it("Can initialize the Pool", async () => {
        const [_poolSigner, bump] =
            anchor.web3.PublicKey.findProgramAddressSync(
                [nativeMint.toBuffer()],
                program.programId
            );

        poolSigner = _poolSigner;

        redeemableMint = await createMint(
            provider.connection,
            payer,
            poolSigner,
            undefined,
            0,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID
        );

        depositorRedeemable = await createAccount(
            provider.connection,
            payer,
            redeemableMint,
            depositor.publicKey,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID
        );

        let poolNativeAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer,
            nativeMint,
            poolSigner,
            true,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID,
            undefined
        );

        poolNative = poolNativeAccount.address;

        let pooldeposit tokenAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer,
            deposit tokenMint,
            poolSigner,
            true,
            undefined,
            undefined,
            TOKEN_PROGRAM_ID,
            undefined
        );

        pooldeposit token = pooldeposit tokenAccount.address;

        nowBn = new anchor.BN(Date.now() / 1000);
        startIdoTs = nowBn.add(new anchor.BN(10));
        endIdoTs = nowBn.add(new anchor.BN(20));
        withDrawdeposit tokenTs = nowBn.add(new anchor.BN(30));

        await program.methods
            .initializePool(
                nativeTokenAmount,
                startIdoTs,
                endIdoTs,
                withDrawdeposit tokenTs,
                bump
            )
            .accounts({
                pool: pool.publicKey,
                poolSigner: poolSigner,
                redeemableMint: redeemableMint,
                deposit tokenMint: deposit tokenMint,
                nativeMint: nativeMint,
                poolNative: poolNative,
                pooldeposit token: pooldeposit token,
                authority: project.publicKey,
                creatorNative: projectNative,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([pool, project])
            .rpc();

        const poolNativeTokenAccount = await getAccount(
            provider.connection,
            poolNative
        );

        assert.strictEqual(
            poolNativeTokenAccount.amount.toString(),
            nativeTokenAmount.toNumber().toString()
        );

        const createdPool = await program.account.poolAccount.fetch(
            pool.publicKey
        );

        assert.strictEqual(
            createdPool.poolAuthority.toBase58(),
            project.publicKey.toBase58()
        );
        assert.strictEqual(
            createdPool.redeemableMint.toBase58(),
            redeemableMint.toBase58()
        );
        assert.strictEqual(
            createdPool.poolNative.toBase58(),
            poolNative.toBase58()
        );
        assert.strictEqual(
            createdPool.nativeMint.toBase58(),
            nativeMint.toBase58()
        );
        assert.strictEqual(
            createdPool.pooldeposit token.toBase58(),
            pooldeposit token.toBase58()
        );
        assert.strictEqual(
            createdPool.totalNativeTokens.toNumber().toString(),
            nativeTokenAmount.toString()
        );
        assert.strictEqual(
            createdPool.startIdoTs.toNumber().toString(),
            startIdoTs.toString()
        );
        assert.strictEqual(
            createdPool.endIdoTs.toNumber().toString(),
            endIdoTs.toString()
        );
        assert.strictEqual(
            createdPool.withdrawdeposit tokenTs.toNumber().toString(),
            withDrawdeposit tokenTs.toString()
        );
    });
})
```

First we derive the seeds using nativeMint to get the poolSigner PDA. Then we create the redeemable token mint account and the necessary token accounts owned by poolSigner by calling `getOrCreateAssociatedTokenAccount()`. Then we set the different timestamps which we need in the program and call the `program.methods.initializePool()` method. We pass in all the accounts we defined in the accounts struct of our program and the signers, which are `pool` and `project`.

Run `anchor test`. It should show 2 tests passed.

### Exchange depositor deposit token for Redeemable Tokens

```ts
	//--snip--

	let deposit = 5000;

    it("Can exchange depositor Deposit tokens for Redeemable tokens", async () => {
        if (Date.now() < startIdoTs.toNumber() * 1000) {
            await sleep(startIdoTs.toNumber() * 1000 - Date.now() + 5000);
        }

        await program.methods
            .exchangeDepositTokenForRedeemable(new anchor.BN(firstDeposit))
            .accounts({
                pool: pool.publicKey,
                poolSigner: poolSigner,
                redeemableMint: redeemableMint,
                depositTokenMint: depositTokenMint,
                poolDepositToken: poolDepositToken,
                authority: depositor.publicKey,
                depositorDepositToken: depositorDepositAccount,
                depositorRedeemable: depositorRedeemable,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([depositor])
            .rpc();

        const poolDepositTokenTokenAccount = await getAccount(
            provider.connection,
            poolDepositToken
        );

        assert.strictEqual(
            poolDepositTokenTokenAccount.amount.toString(),
            firstDeposit.toString()
        );

        const depositorDepositAccountTokenAccount = await getAccount(
            provider.connection,
            depositorDepositAccount
        );

        const depositorRedeemableTokenAccount = await getAccount(
            provider.connection,
            depositorRedeemable
        );

        assert.strictEqual(
            depositorDepositAccountTokenAccount.amount.toString(),
            (10000 - firstDeposit).toString()
        );

        assert.strictEqual(
            depositorRedeemableTokenAccount.amount.toString(),
            firstDeposit.toString()
        );
    });
})
```

We check for the current time and `sleep` before it is time to call the `exchangeDepositTokenForRedeemable` method. We cannot call the method outside the stipulated time because of the access controls we added. If we try to call it outside the correct time, it will error out.

But we have not added the `sleep` function yet. Add it at the end outside the `describe` block.

```ts
//--snip--
function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Inside the test, we call the `exchangeDepositTokenForRedeemable` program method, and then write the usual assert checks.

Running `anchor test` should now show 3 tests passed.

### Exchange User Redeemable For Native Tokens

```ts
	//--snip--
    it("Can exchange depositor Redeemable tokens for Native tokens", async () => {
        if (Date.now() < endIdoTs.toNumber() * 1000) {
            await sleep(endIdoTs.toNumber() * 1000 - Date.now() + 5000);
        }

        await program.methods
            .exchangeRedeemableForNative()
            .accounts({
                pool: pool.publicKey,
                poolSigner: poolSigner,
                redeemableMint: redeemableMint,
                poolNative: poolNative,
                authority: depositor.publicKey,
                depositorNative: depositorNativeAccount,
                depositorRedeemable: depositorRedeemable,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([depositor])
            .rpc();

        const poolNativeTokenAccount = await getAccount(
            provider.connection,
            poolNative
        );

        assert.strictEqual(poolNativeTokenAccount.amount.toString(), "0");

        const depositorNativeAccountTokenAccount = await getAccount(
            provider.connection,
            depositorNativeAccount
        );

        const depositorRedeemableTokenAccount = await getAccount(
            provider.connection,
            depositorRedeemable
        );

        assert.strictEqual(
            depositorNativeAccountTokenAccount.amount.toString(),
            nativeTokenAmount.toString()
        );

        assert.strictEqual(
            depositorRedeemableTokenAccount.amount.toString(),
            "0"
        );
    });
})
```

Here also, we go through similar steps like the previous one.

`anchor test` should now show 4 tests passed.

### Withdraw Pool deposit tokens

```ts
    it("Can withdraw total deposit tokens from pool account", async () => {
        if (Date.now() < withDrawDepositTokenTs.toNumber() * 1000) {
            await sleep(withDrawDepositTokenTs.toNumber() * 1000 - Date.now() + 5000);
        }

        await program.methods
            .withdrawPoolDepositToken()
            .accounts({
                pool: pool.publicKey,
                poolSigner: poolSigner,
                depositTokenMint: depositTokenMint,
                poolDepositToken: poolDepositToken,
                payer: project.publicKey,
                creatorDepositToken: projectDepositAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([project])
            .rpc();

        const poolDepositTokenTokenAccount = await getAccount(
            provider.connection,
            poolDepositToken
        );

        assert.strictEqual(poolDepositTokenTokenAccount.amount.toString(), "0");

        const projectDepositAccountTokenAccount = await getAccount(
            provider.connection,
            projectDepositAccount
        );

        assert.strictEqual(
            projectDepositAccountTokenAccount.amount.toString(),
            firstDeposit.toString()
        );
    });
})
```

Finally we test the `withdrawPoolDepositToken` program method, and that concludes all our tests.

`anchor test` should now be showing 5 tests passed.

And with that, our IDO Program project comes to a conclusion.
