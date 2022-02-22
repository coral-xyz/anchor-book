# ⚓ The Anchor Book

Get up and running with [Anchor](https://anchor-lang.com), the framework for building secure, reliable
Solana apps.

## 🤝 Contributing

Feel free to file an issue or submit a pull request.

## 💻 Run The Anchor Book Locally

To run on a Mac, install [Homebrew](https://brew.sh/) if you don't already have
it.

Then, run the following commands:

```sh
brew upgrade
brew install mdbook
```

Next, clone this repo and run `mbdbook` to build the book:

```sh
git clone https://github.com/project-serum/anchor-book.git
cd anchor-book
mdbook build
```

Now, assuming you have [node.js](https://nodejs.org) and
[npm](https://npmjs.com) installed, install `serve`, a static file server.

```sh
npm i -g serve
```

Now, run:

```sh
cd book && serve
```

and then navigate to `http://localhost:3000`
in your browser.

## License

The Anchor Book is licensed under [Apache 2.0](./LICENSE).

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in Anchor by you, as defined in the Apache-2.0 license, shall be
licensed as above, without any additional terms or conditions.
