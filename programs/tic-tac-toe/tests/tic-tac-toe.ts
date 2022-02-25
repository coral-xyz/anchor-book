import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TicTacToe } from '../target/types/tic_tac_toe';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
chai.use(chaiAsPromised);

async function play(program, game, player, tile, expectedTurn, expectedGameState, expectedBoard) {
  await program.rpc.play(tile, {
    accounts: {
      player: player.publicKey,
      game
    },
    signers: player instanceof (anchor.Wallet as any) ? [] : [player]
  });

  const gameState = await program.account.game.fetch(game);
  expect(gameState.turn).to.equal(expectedTurn);
  expect(gameState.state).to.eql(expectedGameState);
  expect(gameState.board)
    .to
    .eql(expectedBoard);
}

describe('tic-tac-toe', () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.TicTacToe as Program<TicTacToe>;

  it('setup game!', async() => {
    const gameKeypair = anchor.web3.Keypair.generate();
    const playerOne = program.provider.wallet;
    const playerTwo = anchor.web3.Keypair.generate();
    await program.rpc.setupGame(playerTwo.publicKey, {
      accounts: {
        game: gameKeypair.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers: [gameKeypair]
    });

    let gameState = await program.account.game.fetch(gameKeypair.publicKey);
    expect(gameState.turn).to.equal(1);
    expect(gameState.players)
      .to
      .eql([playerOne.publicKey, playerTwo.publicKey]);
    expect(gameState.state).to.eql({ active: {} });
    expect(gameState.board)
      .to
      .eql([[null,null,null],[null,null,null],[null,null,null]]);
  });

  it('player one wins!', async () => {
    const gameKeypair = anchor.web3.Keypair.generate();
    const playerOne = program.provider.wallet;
    const playerTwo = anchor.web3.Keypair.generate();
    await program.rpc.setupGame(playerTwo.publicKey, {
      accounts: {
        game: gameKeypair.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers: [gameKeypair]
    });

    let gameState = await program.account.game.fetch(gameKeypair.publicKey);
    expect(gameState.turn).to.equal(1);
    expect(gameState.players)
      .to
      .eql([playerOne.publicKey, playerTwo.publicKey]);
    expect(gameState.state).to.eql({ active: {} });
    expect(gameState.board)
      .to
      .eql([[null,null,null],[null,null,null],[null,null,null]]);

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 0, column: 0},
      2,
      { active: {}, },
      [
        [{x:{}},null,null],
        [null,null,null],
        [null,null,null]
      ]
    );


    try {
      await play(
        program,
        gameKeypair.publicKey,
        playerOne, // same player in subsequent turns
        // change sth about the tx because
        // duplicate tx that come in too fast
        // after each other may get dropped
        {row: 1, column: 0},
        2,
        { active: {}, },
        [
          [{x:{}},null,null],
          [null,null,null],
          [null,null,null]
        ]
      );
      chai.assert(false, "should've failed but didn't ");
    } catch (err) {
      expect(err.code).to.equal(6003);
    }

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 1, column: 0},
      3,
      { active: {}, },
      [
        [{x:{}},null,null],
        [{o:{}},null,null],
        [null,null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 0, column: 1},
      4,
      { active: {}, },
      [
        [{x:{}},{x: {}},null],
        [{o:{}},null,null],
        [null,null,null]
      ]
    );

    try {
      await play(
        program,
        gameKeypair.publicKey,
        playerTwo,
        {row: 5, column: 1}, // out of bounds row
        4,
        { active: {}, },
        [
          [{x:{}},{x: {}},null],
          [{o:{}},null,null],
          [null,null,null]
        ]
      );
      chai.assert(false, "should've failed but didn't ");
    } catch (error) {
      expect(error.code).to.equal(6000);
    }

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 1, column: 1},
      5,
      { active: {}, },
      [
        [{x:{}},{x: {}},null],
        [{o:{}},{o:{}},null],
        [null,null,null]
      ]
    );

    try {
      await play(
        program,
        gameKeypair.publicKey,
        playerOne,
        {row: 0, column: 0},
        5,
        { active: {}, },
        [
          [{x:{}},{x: {}},null],
          [{o:{}},{o:{}},null],
          [null,null,null]
        ]
      );
      chai.assert(false, "should've failed but didn't ");
    } catch (error) {
      expect(error.code).to.equal(6001);
    }

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 0, column: 2},
      5,
      { won: { winner: playerOne.publicKey }, },
      [
        [{x:{}},{x: {}},{x: {}}],
        [{o:{}},{o:{}},null],
        [null,null,null]
      ]
    );

    try {
      await play(
        program,
        gameKeypair.publicKey,
        playerOne,
        {row: 0, column: 2},
        5,
        { won: { winner: playerOne.publicKey }, },
        [
          [{x:{}},{x: {}},{x: {}}],
          [{o:{}},{o:{}},null],
          [null,null,null]
        ]
      );
      chai.assert(false, "should've failed but didn't ");
    } catch (error) {
      expect(error.code).to.equal(6002);
    }
  })

  it('tie', async () => {
    const gameKeypair = anchor.web3.Keypair.generate();
    const playerOne = program.provider.wallet;
    const playerTwo = anchor.web3.Keypair.generate();
    await program.rpc.setupGame(playerTwo.publicKey, {
      accounts: {
        game: gameKeypair.publicKey,
        playerOne: playerOne.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      },
      signers: [gameKeypair]
    });

    let gameState = await program.account.game.fetch(gameKeypair.publicKey);
    expect(gameState.turn).to.equal(1);
    expect(gameState.players)
      .to
      .eql([playerOne.publicKey, playerTwo.publicKey]);
    expect(gameState.state).to.eql({ active: {} });
    expect(gameState.board)
      .to
      .eql([[null,null,null],[null,null,null],[null,null,null]]);

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 0, column: 0},
      2,
      { active: {}, },
      [
        [{x:{}},null,null],
        [null,null,null],
        [null,null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 1, column: 1},
      3,
      { active: {}, },
      [
        [{x:{}},null,null],
        [null,{o:{}},null],
        [null,null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 2, column: 0},
      4,
      { active: {}, },
      [
        [{x:{}},null,null],
        [null,{o:{}},null],
        [{x:{}},null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 1, column: 0},
      5,
      { active: {}, },
      [
        [{x:{}},null,null],
        [{o:{}},{o:{}},null],
        [{x:{}},null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 1, column: 2},
      6,
      { active: {}, },
      [
        [{x:{}},null,null],
        [{o:{}},{o:{}},{x:{}}],
        [{x:{}},null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 0, column: 1},
      7,
      { active: {}, },
      [
        [{x:{}},{o:{}},null],
        [{o:{}},{o:{}},{x:{}}],
        [{x:{}},null,null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 2, column: 1},
      8,
      { active: {}, },
      [
        [{x:{}},{o:{}},null],
        [{o:{}},{o:{}},{x:{}}],
        [{x:{}},{x:{}},null]
      ]
    );

    await play(
      program,
      gameKeypair.publicKey,
      playerTwo,
      {row: 2, column: 2},
      9,
      { active: {}, },
      [
        [{x:{}},{o:{}},null],
        [{o:{}},{o:{}},{x:{}}],
        [{x:{}},{x:{}},{o:{}}]
      ]
    );


    await play(
      program,
      gameKeypair.publicKey,
      playerOne,
      {row: 0, column: 2},
      9,
      { tie: {}, },
      [
        [{x:{}},{o:{}},{x:{}}],
        [{o:{}},{o:{}},{x:{}}],
        [{x:{}},{x:{}},{o:{}}]
      ]
    );
  })
});
