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
            null,
            0
        );

        depositorRedeemable = await createAccount(
            provider.connection,
            payer,
            redeemableMint,
            depositor.publicKey
        );

        let poolNativeAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer,
            nativeMint,
            poolSigner,
            true,
            undefined
        );

        poolNative = poolNativeAccount.address;

        let poolDepositTokenAccount = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            payer,
            depositTokenMint,
            poolSigner,
            true,
            undefined
        );

        poolDepositToken = poolDepositTokenAccount.address;

        nowBn = new anchor.BN(Date.now() / 1000);
        startIdoTs = nowBn.add(new anchor.BN(10));
        endIdoTs = nowBn.add(new anchor.BN(20));
        withDrawDepositTokenTs = nowBn.add(new anchor.BN(30));

        await program.methods
            .initializePool(
                nativeTokenAmount,
                startIdoTs,
                endIdoTs,
                withDrawDepositTokenTs,
                bump
            )
            .accounts({
                pool: pool.publicKey,
                poolSigner: poolSigner,
                redeemableMint: redeemableMint,
                depositTokenMint: depositTokenMint,
                nativeMint: nativeMint,
                poolNative: poolNative,
                poolDepositToken: poolDepositToken,
                authority: project.publicKey,
                creatorNative: projectNativeAccount,
                tokenProgram: TOKEN_PROGRAM_ID,
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
            createdPool.poolDepositToken.toBase58(),
            poolDepositToken.toBase58()
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
            createdPool.withdrawDepositTokenTs.toNumber().toString(),
            withDrawDepositTokenTs.toString()
        );
    });

    let firstDeposit = 5000;

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
});

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
