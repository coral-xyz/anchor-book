use crate::errors::TicTacToeError;
use crate::state::game::*;
use anchor_lang::prelude::*;

// ANCHOR: fn
pub fn play(ctx: Context<Play>, tile: Tile) -> Result<()> {
    let game = &mut ctx.accounts.game;

    require_keys_eq!(
        game.current_player(),
        ctx.accounts.player.key(),
        TicTacToeError::NotPlayersTurn
    );

    game.play(&tile)
}
// ANCHOR_END: fn

// ANCHOR: struct
#[derive(Accounts)]
pub struct Play<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,
    pub player: Signer<'info>,
}
// ANCHOR_END: struct
