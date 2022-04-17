use anchor_lang::prelude::*;
use anchor_spl::token::{ self, Mint, MintTo, Token, TokenAccount};


declare_id!("ASTi2qK1PbondXrJxSjzmhLSvycW2Wo35Xf3YJRs1Hqe");

#[program]
pub mod token_distributor {

    use super::*;

    pub fn initialize_distributor(
        ctx: Context<InitializeDistributor>,
        distributor_name: String,
        bumps: DistributorBumps,

    ) -> Result<()> {
        let distributor_account = &mut ctx.accounts.distributor_account;

        distributor_account.is_initialized = true;
        distributor_account.distributor_name = distributor_name;
        distributor_account.bumps=bumps;
        distributor_account.token_mint = *ctx.accounts.token_mint.to_account_info().key;
        distributor_account.creator_authority = *ctx.accounts.distributor_creator.key;
        distributor_account.token_supply = 0;
        
        Ok(())
    }

    pub fn get_token(
        ctx: Context<GetToken>,
        amount: u64,
    ) -> Result<()> {

        let distributor_name = &ctx.accounts.distributor_account.distributor_name;
         // Mint Token to user 
         let seeds = &[
             distributor_name.as_bytes(),
            &[ctx.accounts.distributor_account.bumps.distributor_account],
        ];
        let signer = &[&seeds[..]];
        let cpi_accounts = MintTo {
            mint: ctx.accounts.token_mint.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.distributor_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program.clone(), cpi_accounts, signer);
        token::mint_to(cpi_ctx, amount)?;
        let distributor_account = &mut ctx.accounts.distributor_account;
        distributor_account.token_supply += amount;

        Ok(())
    }
}   

#[derive(Accounts)]
#[instruction( distributor_name: String, bumps: DistributorBumps)]
pub struct InitializeDistributor<'info> {
    #[account(mut)]
    pub distributor_creator: Signer<'info>,

    #[account(init,
        seeds = [distributor_name.as_bytes()],
        bump,
        payer = distributor_creator,
        space = 8 + 1 + 2 + 20 + 32 + 32 + 8)
        ]
    pub distributor_account: Box<Account<'info, DistributorAccount>>,

    #[account(init,
        mint::decimals = 0,
        mint::authority = distributor_account,
        seeds = [distributor_name.as_bytes(), b"token_mint"],
        bump,
        payer = distributor_creator)]
    pub token_mint: Account<'info, Mint>,

    // Prorgrams required for creating Account and Token Mint
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct GetToken<'info> {

    #[account(
        mut,
        seeds = [distributor_account.distributor_name.as_bytes()],
        bump = distributor_account.bumps.distributor_account,)
        ]
    pub distributor_account: Box<Account<'info, DistributorAccount>>,

    #[account(
        mut,
        mint::decimals = 0,
        mint::authority = distributor_account.key(),
        seeds = [distributor_account.distributor_name.as_bytes(), b"token_mint"],
        bump = distributor_account.bumps.token_mint,)]
    pub token_mint: Account<'info, Mint>,

    #[account(mut,
        constraint = user_token_account.owner == *user.key
    )]
    pub user_token_account: Box<Account<'info, TokenAccount>>,
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(Default)]
pub struct DistributorAccount {
    pub is_initialized: bool,
    pub bumps: DistributorBumps,
    pub distributor_name: String,
    pub token_mint: Pubkey,
    pub creator_authority: Pubkey,
    pub token_supply: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct DistributorBumps {
    pub distributor_account: u8,
    pub token_mint: u8,
}
