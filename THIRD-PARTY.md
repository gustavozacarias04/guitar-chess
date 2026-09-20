# Third-party components

Every dependency is committed under `vendor/` exactly as published, unmodified. The full text of
each licence sits next to the code it covers.

| Component | Version | Licence | Upstream | Location |
|---|---|---|---|---|
| chess.js | 1.4.0 | BSD-2-Clause | <https://github.com/jhlywa/chess.js> | `vendor/chess.js/` |
| cm-chessboard | 8.14.0 | MIT | <https://github.com/shaack/cm-chessboard> | `vendor/cm-chessboard/` |
| stockfish.js | 10.0.2 | GPL-3.0 | <https://github.com/nmrugg/stockfish.js> | `vendor/stockfish/` |

`stockfish.js` is a WebAssembly build of [Stockfish](https://stockfishchess.org/), copyright
T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other contributors, with multi-variant
support by Daniel Dugovic and contributors.

Because Stockfish is GPL-3.0, the combined work distributed from this repository is licensed
under GPL-3.0-or-later. See `LICENSE`.

## Licence files

- `vendor/chess.js/LICENSE`
- `vendor/cm-chessboard/LICENSE`
- The headers of `vendor/stockfish/stockfish.wasm.js` and `vendor/stockfish/stockfish.js` declare
  GPL-3.0; the full text is in `LICENSE`.

## Updating a dependency

These files came from jsDelivr, from the matching npm packages. To update, replace the files in
`vendor/<package>/` with the new version keeping the same directory structure (the import paths
depend on it), and update the table above.
