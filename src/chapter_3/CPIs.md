# Cross-Program Invocations

Often it's useful for programs to interact with each other. In Solana this is achieved via Cross-Program Invocations (CPIs).

Consider the following example of a puppet and a puppet master. Admittedly, it is not very realistic but it allows us to show you the many nuances of CPIs. The milestone project of the intermediate section covers a more realistic program with multiple CPIs.

## Setting up basic CPI functionality

Create a new workspace
```
anchor init puppet
```

and copy the following code.

```rust,ignore
use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod puppet {
    use super::*;
    pub fn initialize(_ctx: Context<Initialize>) -> ProgramResult {
        Ok(())
    }

    pub fn set_data(ctx: Context<SetData>, data: u64) -> ProgramResult {
        let puppet = &mut ctx.accounts.puppet;
        puppet.data = data;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub puppet: Account<'info, Data>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut)]
    pub puppet: Account<'info, Data>,
}

#[account]
pub struct Data {
    pub data: u64,
}
```

There's nothing special happening here. It's a pretty simple program! The interesting part is how it interacts with the next program we are going to create.

Run
```
anchor new puppet-master
```
inside the workspace and copy the following code:

```rust,ignore
use anchor_lang::prelude::*;
use puppet::cpi::accounts::SetData;
use puppet::program::Puppet;
use puppet::{self, Data};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

#[program]
mod puppet_master {
    use super::*;
    pub fn pull_strings(ctx: Context<PullStrings>, data: u64) -> ProgramResult {
        let cpi_program = ctx.accounts.puppet_program.to_account_info();
        let cpi_accounts = SetData {
            puppet: ctx.accounts.puppet.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        puppet::cpi::set_data(cpi_ctx, data)
    }
}

#[derive(Accounts)]
pub struct PullStrings<'info> {
    #[account(mut)]
    pub puppet: Account<'info, Data>,
    pub puppet_program: Program<'info, Puppet>,
}
```

Also add the line `puppet_master = "HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L"` in the `[programs.localnet]` section of your `Anchor.toml`. Finally, import the puppet program into the puppet-master program by adding the following line to the `[dependencies]` section of the `Cargo.toml` file inside the `puppet-master` program folder:
```toml
puppet = { path = "../puppet", features = ["cpi"]}
```

The `features = ["cpi"]` is used so we can not only use puppet's types but also its instruction builders and cpi functions. Without those, we would have to use low level solana syscalls. Fortunately, anchor provides abstractions on top of those. By enabling the `cpi` feature, the puppet-master program gets access to the `puppet::cpi` module. Anchor generates this module automatically and it contains tailor-made instructions builders and cpi helpers for the program.

In the case of the puppet program, the puppet-master uses the `SetData` instruction builder struct provided by the `puppet::cpi::accounts` module to submit the accounts the `SetData` instruction of the puppet program expects. Then, the puppet-master creates a new cpi context and passes it to the `puppet::cpi::set_data` cpi function. This function has the exact same function as the `set_data` function in the puppet program with the exception that it expects a `CpiContext` instead of a `Context`.

We can verify that everything worked as expects by replacing the contents of the `puppet.ts` file with:
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
    await puppetProgram.rpc.initialize({
      accounts: {
        puppet: puppetKeypair.publicKey,
        user: anchor.getProvider().wallet.publicKey,
        systemProgram: web3.SystemProgram.programId
      },
      signers: [puppetKeypair]
    });

    await puppetMasterProgram.rpc.pullStrings(new anchor.BN(42),{
      accounts: {
        puppetProgram: puppetProgram.programId,
        puppet: puppetKeypair.publicKey
      }
    })

    expect((await puppetProgram.account.data
      .fetch(puppetKeypair.publicKey)).data.toNumber()).to.equal(42);
  });
});
```

## Privilege Extension

CPIs extend the privileges of the caller to the callee. The puppet account was passed as a mutable account to the puppet-master but it was still mutable in the puppet as well (otherwise the `expect` in the test would've failed). The same applies to signatures.

If you want to prove this for yourself, add an `authority` field to the `Data` struct in the puppet program.
```rust,ignore
#[account]
pub struct Data {
    pub data: u64,
    pub authority: Pubkey
}
```

and adjust the `initialize` function:
```rust,ignore
pub fn initialize(ctx: Context<Initialize>, authority: Pubkey) -> ProgramResult {
    ctx.accounts.puppet.authority = authority;
    Ok(())
}
```

Add `32` to the `space` constraint of the `puppet` field.
```rust,ignore
#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8 + 32)]
    pub puppet: Account<'info, Data>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

Then, adjust the `SetData` validation struct:
```rust,ignore
#[derive(Accounts)]
pub struct SetData<'info> {
    #[account(mut, has_one = authority)]
    pub puppet: Account<'info, Data>,
    pub authority: Signer<'info>
}
```

The `has_one` constraint checks that `puppet.authority = authority.key()`.

The puppet-master program now also needs adjusting:
```rust,ignore
use anchor_lang::prelude::*;
use puppet::cpi::accounts::SetData;
use puppet::program::Puppet;
use puppet::{self, Data};

declare_id!("HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L");

#[program]
mod puppet_master {
    use super::*;
    pub fn pull_strings(ctx: Context<PullStrings>, data: u64) -> ProgramResult {
        let cpi_program = ctx.accounts.puppet_program.to_account_info();
        let cpi_accounts = SetData {
            puppet: ctx.accounts.puppet.to_account_info(),
            authority: ctx.accounts.authority.to_account_info()
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        puppet::cpi::set_data(cpi_ctx, data)
    }
}

#[derive(Accounts)]
pub struct PullStrings<'info> {
    #[account(mut)]
    pub puppet: Account<'info, Data>,
    pub puppet_program: Program<'info, Puppet>,
    // Even though the puppet program already checks that authority is a signer
    // using the Signer type here is still required because the anchor ts client
    // can not infer signers from programs called via CPIs
    pub authority: Signer<'info>
}
```

Finally, change the test:

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
  const authorityKeypair = web3.Keypair.generate();

  it('Does CPI!', async () => {
    await puppetProgram.rpc.initialize(authorityKeypair.publicKey, {
      accounts: {
        puppet: puppetKeypair.publicKey,
        user: anchor.getProvider().wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      signers: [puppetKeypair]
    });

    await puppetMasterProgram.rpc.pullStrings(new anchor.BN(42),{
      accounts: {
        puppetProgram: puppetProgram.programId,
        puppet: puppetKeypair.publicKey,
        authority: authorityKeypair.publicKey
      },
      signers: [authorityKeypair]
    })

    expect((await puppetProgram.account.data
      .fetch(puppetKeypair.publicKey)).data.toNumber()).to.equal(42);
  });
});
```

The test passes because the signature that was given to the puppet-master by the authority was then extended to the puppet program which used it to check that the authority for the puppet account had signed the transaction.

## Reloading an Account

In the puppet program, the `Account<'info, T>` type is used for the `puppet` account. If a CPI edits an account of that type,
the caller's account does not change during the instruction.

You can easily see this for yourself by adding the following right after the `puppet::cpi::set_data(cpi_ctx, data)` cpi call.
```rust,ignore
puppet::cpi::set_data(cpi_ctx, data)?;
if ctx.accounts.puppet.data != 42 {
    panic!();
}
Ok(())
```
Now your test will fail. But why? After all the test used to pass, so the cpi definitely did change the `data` field to `42`.

The reason the `data` field has not been updated to `42` in the caller is that the `Account<'info, T>` type deserializes the incoming bytes into new struct. This struct is no longer connected to the underlying data in the account. The CPI changes the data in the underlying account but since the struct in the caller has no connection to the underlying account the struct in the caller remains unchanged.

If you need to read the value of an account that has just been changed by a CPI, you can call its `reload` method which will re-deserialize the account. If you put `ctx.accounts.puppet.reload()?;` right after the cpi call, the test will pass again.

```rust,ignore
puppet::cpi::set_data(cpi_ctx, data)?;
ctx.accounts.puppet.reload()?;
if ctx.accounts.puppet.data != 42 {
    panic!();
}
Ok(())
```

## Returning values from a CPI

Since 1.8.12, the `set_return_data` and `get_return_data` syscalls can be used to set and get return data from CPIs. While these can already be used in anchor programs, anchor does not yet provide abstractions on top of them.

The return data can only be max 1024 bytes with these syscalls so it's worth briefly explaining the old workaround for CPI return values which is still relevant for return values bigger than 1024 bytes.

By using a CPI together with `reload` it's possible to simulate return values. One could imagine that instead of just setting the `data` field to `42` the puppet program did some calculation with the `42` and saved the result in `data`. The puppet-master can then call `reload` after the cpi and use the result of the puppet program's calculation.

## Programs as Signers

There's one more thing that can be done with CPIs. But for that, you need to first learn what PDAs are. We'll cover those in the next chapter.