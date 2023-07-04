use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

declare_id!("GYpxvUxtesyBSn69gnbfQChoUyJ7qdsG9nXS2Y2dQNH6");

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

#[account]
pub struct PoolAccount {
    /// Authority of the Pool
    pub pool_authority: Pubkey,

    /// Mint of redeemable tokens (Intermediate tokens which will be exchanged for native tokens)
    pub redeemable_mint: Pubkey,

    /// Mint of project tokens
    pub native_mint: Pubkey,

    /// Mint of deposit_token tokens
    pub deposit_token_mint: Pubkey,

    /// Token Account of Pool associated with the project token mint
    pub pool_native: Pubkey,

    /// Token Account of Pool associated with deposit_token mint
    pub pool_deposit_token: Pubkey,

    /// Total number of native tokens being distributed
    pub total_native_tokens: u64,

    /// Unix timestamp for starting IDO
    pub start_ido_ts: i64,

    /// Unix timestamp for ending IDO
    pub end_ido_ts: i64,

    /// Unix timestamp for withdrawing deposit_token from pool
    pub withdraw_deposit_token_ts: i64,

    /// Bump
    pub bump: u8,
}

impl PoolAccount {
    pub const LEN: usize = DISCRIMINATOR_LENGTH   // Discriminator Length
        + PUBKEY_LENGTH                           // Pool Authority
        + PUBKEY_LENGTH                           // Redeemable Mint
        + PUBKEY_LENGTH                           // deposit_token Mint
        + PUBKEY_LENGTH                           // Pool Native Token Account
        + PUBKEY_LENGTH                           // Native Mint
        + PUBKEY_LENGTH                           // Pool deposit_token Token Account
        + DATA_LENGTH_64                          // Total Native Token Amount
        + DATA_LENGTH_64                          // Start IDO TS
        + DATA_LENGTH_64                          // End IDO TS
        + DATA_LENGTH_64                          // Withdraw deposit_token TS
        + DATA_LENGTH_8; // Bump
}

const DISCRIMINATOR_LENGTH: usize = 8;
const PUBKEY_LENGTH: usize = 32;
const DATA_LENGTH_64: usize = 8;
const DATA_LENGTH_8: usize = 1;

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
    #[msg("Insufficient deposit_token Tokens")]
    LowDepositToken,
    #[msg("IDO has not ended yet")]
    IdoNotOver,
    #[msg("Cannot withdraw deposit_token yet")]
    CannotWithdrawYet,
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

//iDO Over
fn ido_over<'info>(pool_account: &Account<'info, PoolAccount>) -> Result<()> {
    if !(pool_account.end_ido_ts < get_timestamp()) {
        return Err(ErrorCode::IdoNotOver.into());
    }
    Ok(())
}

//Can Withdraw deposit_token
fn can_withdraw_deposit_token<'info>(pool_account: &Account<'info, PoolAccount>) -> Result<()> {
    if !(pool_account.withdraw_deposit_token_ts < get_timestamp()) {
        return Err(ErrorCode::CannotWithdrawYet.into());
    }
    Ok(())
}

pub fn get_timestamp() -> UnixTimestamp {
    Clock::get().unwrap().unix_timestamp
}
