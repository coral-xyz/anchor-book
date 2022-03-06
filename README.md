# ⚓ The Anchor Book

Get up and running with [Anchor](https://anchor-lang.com), the framework for building secure, reliable
Solana apps.

## 🤝 Contributing

Feel free to file an issue or submit a pull request.

## Programs

You can find the program examples used in the book in the [programs directory](./programs/).

## 💻 Run The Anchor Book Locally

To run on a Mac, install [Homebrew](https://brew.sh/) if you don't already have
it.

Then, run the following commands:

```sh
brew upgrade
brew install mdbook
```

Next, clone this repo and and serve the book:

```sh
git clone https://github.com/project-serum/anchor-book.git
cd anchor-book
mdbook serve
```
The book will be available at `http://localhost:3000` in your browser.

### Run an older version

If you want to know how something worked in previous versions of anchor, you can check out
a tag e.g. tag `v0.22.0` is the last commit of the book that was compatible with anchor version `0.22.0`.

## License

The Anchor Book is licensed under [Apache 2.0](./LICENSE).

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in Anchor by you, as defined in the Apache-2.0 license, shall be
licensed as above, without any additional terms or conditions.
