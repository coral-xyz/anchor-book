# PDAs
Program derived addresses are addresses with special properties.

Unlike normal addresses, PDAs are not public keys and therefore do not have an associated private key. There are two use cases for PDAs. They provide a mechanism to build hashmap-like structures on-chain and they allow programs to sign instructions.

Working with PDAs is one of the most challenging parts of working with Solana.
This is why in addition to our explanations here, we want to provide you with some further resources.
We cover everything there is to know about PDAs here but it may be useful to learn about PDAs from different perspectives.

- [Pencilflips's twitter thread on PDAs](https://twitter.com/pencilflip/status/1455948263853600768?s=20&t=J2JXCwv395D7MNkX7a9LGw)
- [jarry xiao's talk on PDAs and CPIs](https://www.youtube.com/watch?v=iMWaQRyjpl4)
- [paulx's guide on everything Solana (covers much more than PDAs)](https://paulx.dev/blog/2021/01/14/programming-on-solana-an-introduction/)

## Creation of a PDA

Before we dive into how to use PDAs in anchor, here's a short explainer on what PDAs are.

PDAs are created by hashing a number of seeds the user can choose and the id of a program:
```rust,ignore
// pseudo code
let pda = hash(seeds, program_id);
```

The seeds can be anything. A pubkey, a string, an array of numbers etc.

There's a 50% chance that this hash function results in a public key (but PDAs are not public keys), so a bump has to be searched for so that we get a PDA:
```rust,ignore
// pseudo code
fn find_pda(seeds, program_id) {
  for bump in 0..256 {
    let potential_pda = hash(seeds, bump, program_id);
    if is_pubkey(potential_pda) {
      continue;
    }
    return (potential_pda, bump);
  }
  panic!("Could not find pda after 256 tries.");
}
```

It is technically possible that no bump is found within 256 tries but this probability is negligible.
If you're interested in the exact calculation of a PDA, check out the [`solana_program` source code](https://docs.rs/solana-program/latest/solana_program/pubkey/struct.Pubkey.html#method.find_program_address).

The first bump that results in a PDA is commonly called the "canonical bump". It's recommended to only use the canonical bump to avoid confusion and use the seeds if something like a counter is desired.

## Using PDAs

We are now going to show you what you can do with PDAs and how to do it in Anchor!

### Hashmap-like structures using PDAs

Before we dive into the specifics of creating hashmaps in anchor, let's look at how to create a hashmap with PDAs in general.

#### Building hashmaps with PDAs

PDAs are hashed from the bump, a program id, but also a number of seeds which can be freely chosen by the user.
These seeds can be used to build hashmap-like structures on-chain.

For instance, imagine you're building an in-browser game and want to store some user stats. Maybe their level and their in-game name. You could create an account with a layout that looks like this:

```rust,ignore
pub struct UserStats {
  level: u16,
  name: String,
  authority: Pubkey
}
```

The `authority` would be the user the accounts belongs to.

This approach creates the following problem. It's easy to go from the user stats account to the user account address (just read the `authority` field) but if you just have the user account address (which is more likely), how do you find the user stats account? You can't. This is a problem because your game probably has instructions that require both the user stats account and its authority which means the clients needs to pass those accounts into the instruction (for example, a `ChangeName` instruction). So maybe the frontend could store a mapping between a user's account address and a user's info address in local storage. This works until the user accidentally wipes their local storage.

With PDAs you can have a layout like this:
```rust,ignore
pub struct UserStats {
  level: u16,
  name: String,
  bump: u8
}
```
and encode the information about the relationship between the user and the user stats account in the address of the user stats account itself.

Reusing the pseudo code from above:

```rust,ignore
// pseudo code
let seeds = [b"user-stats", authority];
let (pda, bump) = find_pda(seeds, game_program_id);
```

When a user connects to your website, this pda calculation can be done client-side using their user account address as the `authority` and the resulting pda serves as the address of the user's stats account.

To summarize, we have used PDAs to create a mapping between a user and their user stats account. There is no single hashmap object that exposes a `get` function. Instead, each value (the user stats address) can be found by using certain seeds ("user-stats" and the user account address) as inputs to the `find_pda` function.

#### How to build PDA hashmaps in Anchor

Continuing with the example from the previous sections, create a new workspace
```
anchor init game
```

and copy the following code

```rust,ignore
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod game {
    use super::*;
    // handler function
    pub fn create_user_stats(ctx: Context<CreateUserStats>, name: String) -> ProgramResult {
        let user_stats = &mut ctx.accounts.user_stats;
        user_stats.level = 0;
        if name.as_bytes().len() > 200 {
            // proper error handling omitted for brevity
            panic!();
        }
        user_stats.name = name;
        user_stats.bump = *ctx.bumps.get("user_stats").unwrap();
        Ok(())
    }
}

#[account]
pub struct UserStats {
    level: u16,
    name: String,
    bump: u8,
}

// validation struct
#[derive(Accounts)]
pub struct CreateUserStats<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    // space: 8 discriminator + 2 level + 4 name length + 200 name + 1 bump
    #[account(
    init,
    payer = user,
    space = 8 + 2 + 4 + 200 + 1, seeds = [b"user-stats", user.key().as_ref()], bump)]
    pub user_stats: Account<'info, UserStats>,
    pub system_program: Program<'info, System>,
}
```

In the account validation struct we use `seeds` together with `init` to create a PDA with the desired seeds.
Additionally, we add an empty `bump` constraint to signal to anchor that it should find the bump itself.
Then, in the handler, we call `ctx.bumps.get("user_stats")` to get the bump anchor found and save it to the user stats
account as an extra property.

If we then want to use the created pda in a different instruction, we can do the following:
```rust,ignore
// validation struct
#[derive(Accounts)]
pub struct ChangeUserName<'info> {
    pub user: Signer<'info>,
    #[account(mut, seeds = [b"user-stats", user.key().as_ref()], bump = user_stats.bump)]
    pub user_stats: Account<'info, UserStats>,
}

// handler function
pub fn change_user_name(ctx: Context<ChangeUserName>, new_name: String) -> ProgramResult {
    if new_name.as_bytes().len() > 200 {
        // proper error handling omitted for brevity
        panic!();
    }
    ctx.accounts.user_stats.name = new_name;
    Ok(())
}
```

This will check that the `user_stats` account is the pda created by running `hash(seeds, user_stats.bump, game_program_id)`.

Finally, let's add a test. Copy this into `game.ts`

```ts
import * as anchor from '@project-serum/anchor';
import { web3 } from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { Game } from '../target/types/game';
import { expect } from 'chai';

describe('game', async() => {

anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.Game as Program<Game>;

  it('Sets and changes name!', async () => {
    const [userStatsPDA, _] = await web3.PublicKey
      .findProgramAddress(
        [
          anchor.utils.bytes.utf8.encode("user-stats"),
          anchor.getProvider().wallet.publicKey.toBuffer()
        ],
        program.programId
      );

    await program.rpc.createUserStats("brian", {
      accounts: {
        user: anchor.getProvider().wallet.publicKey,
        userStats: userStatsPDA,
        systemProgram: web3.SystemProgram.programId
      }
    });

    expect((await program.account.userStats.fetch(userStatsPDA)).name).to.equal("brian");

    await program.rpc.changeUserName("tom", {
      accounts: {
        user: anchor.getProvider().wallet.publicKey,
        userStats: userStatsPDA
      }
    })

    expect((await program.account.userStats.fetch(userStatsPDA)).name).to.equal("tom");
  });
});
```

Exactly as described in the subchapter before this one, we use a `find` function to find the PDA. We can then use it just like a normal address. Well, almost. When we call `createUserStats`, we don't have to add the PDA to the `[signers]` array even though account creation requires a signature. This is because it is impossible to sign the transaction from outside the program. The signature is added when the CPI to the system program is made. We'll cover how that works now.

### Programs as Signers

Creating PDAs requires them to sign the `createAccount` CPI of the system program. How does that work? PDAs are not public keys so it's impossible for them to sign anything. However, PDAs can still pseudo sign CPIs.
In anchor, to sign with a pda you have to change `CpiContext::new(cpi_program, cpi_accounts)` to `CpiContext::new_with_signer(cpi_program, cpi_accounts, seeds)` where the `seeds` argument are the seeds and the bump the PDA was created with. 
When the CPI is invoked, for each account in `cpi_accounts` the Solana runtime will check whether`hash(seeds, current_program_id) == account address` is true. If yes, that account's `is_signer` flag will be turned to true.
This means a PDA derived from some program X, may only be used to sign CPIs that originate from that program X. This means that on a high level, PDA signatures can be considered program signatures.

This is great news because for many programs it is necessary that the program itself takes the authority over some assets.
For instance, lending protocol programs need to manage deposited collateral and automated market maker programs need to manage the tokens put into their liquidity pools.

Before we conclude this chapter, let's revisit the puppet workspace and add a PDA signature.

First, adjust the puppet-master code:
```rust,ignore
use anchor_lang::prelude::*;
use puppet::cpi::accounts::SetData;
use puppet::program::Puppet;
use puppet::{self, Data};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

#[program]
mod puppet_master {
    use super::*;
    pub fn pull_strings(ctx: Context<PullStrings>, bump: u8, data: u64) -> ProgramResult {
        let cpi_program = ctx.accounts.puppet_program.to_account_info();
        let cpi_accounts = SetData {
            puppet: ctx.accounts.puppet.to_account_info(),
            authority: ctx.accounts.authority.to_account_info()
        };
        let bumps = &[bump][..];
        let signer = &[&[bumps][..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        puppet::cpi::set_data(cpi_ctx, data)
    }
}

#[derive(Accounts)]
pub struct PullStrings<'info> {
    #[account(mut)]
    pub puppet: Account<'info, Data>,
    pub puppet_program: Program<'info, Puppet>,
    pub authority: UncheckedAccount<'info>
}
```

The `authority` account is now an `UncheckedAccount` instead of a `Signer`. When the puppet-master is invoked, the `authority` pda is not a signer yet so we mustn't add a check for it. We just care about the puppet-master being able to sign so we don't add any additional seeds. Just a bump that is calculated off-chain and then passed to the function. This is the new `puppet.ts`:
```ts
import * as anchor from '@project-serum/anchor';
import { web3 } from '@project-serum/anchor/';
import { Program } from '@project-serum/anchor';
import { Puppet } from '../target/types/puppet';
import { PuppetMaster } from '../target/types/puppet_master';
import { expect } from 'chai';

describe('puppet', () => {
  anchor.setProvider(anchor.Provider.env());

  const puppetProgram = anchor.workspace.Puppet as Program<Puppet>;
  const puppetMasterProgram = anchor.workspace.PuppetMaster as Program<PuppetMaster>;

  const puppetKeypair = web3.Keypair.generate();

  it('Does CPI!', async () => {
    const [puppetMasterPDA, puppetMasterBump] = await web3.PublicKey
      .findProgramAddress([], puppetMasterProgram.programId);

    await puppetProgram.rpc.initialize(puppetMasterPDA, {
      accounts: {
        puppet: puppetKeypair.publicKey,
        user: anchor.getProvider().wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [puppetKeypair]
    });

    await puppetMasterProgram.rpc.pullStrings(puppetMasterBump, new anchor.BN(42),{
      accounts: {
        puppetProgram: puppetProgram.programId,
        puppet: puppetKeypair.publicKey,
        authority: puppetMasterPDA
      ,
    }});

    expect((await puppetProgram.account.data
      .fetch(puppetKeypair.publicKey)).data.toNumber()).to.equal(42);
  });
});
```

The `authority` is no longer a randomly generated keypair but a PDA derived from the puppet-master program. This means the puppet-master can sign with it which it does inside `pullStrings`. It's worth noting that our implementation also allows non-canonical bumps but again because we are only interesting in being able to sign we don't care which bump is used.
