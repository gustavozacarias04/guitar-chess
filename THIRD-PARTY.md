# Componentes de terceiros

Todas as dependências estão versionadas em `vendor/`, tal como foram publicadas, sem
modificações. O texto integral de cada licença está junto ao respetivo código.

| Componente | Versão | Licença | Origem | Onde |
|---|---|---|---|---|
| chess.js | 1.4.0 | BSD-2-Clause | <https://github.com/jhlywa/chess.js> | `vendor/chess.js/` |
| cm-chessboard | 8.14.0 | MIT | <https://github.com/shaack/cm-chessboard> | `vendor/cm-chessboard/` |
| stockfish.js | 10.0.2 | GPL-3.0 | <https://github.com/nmrugg/stockfish.js> | `vendor/stockfish/` |

`stockfish.js` é uma compilação para WebAssembly do [Stockfish](https://stockfishchess.org/),
copyright T. Romstad, M. Costalba, J. Kiiski, G. Linscott e restantes contribuidores, com o
suporte multi-variante de Daniel Dugovic e contribuidores.

Por o Stockfish ser GPL-3.0, o conjunto distribuído neste repositório é licenciado sob
GPL-3.0-or-later. Ver `LICENSE`.

## Ficheiros de licença

- `vendor/chess.js/LICENSE`
- `vendor/cm-chessboard/LICENSE`
- O cabeçalho de `vendor/stockfish/stockfish.wasm.js` e `vendor/stockfish/stockfish.js` declara a
  GPL-3.0; o texto completo está em `LICENSE`.

## Atualizar uma dependência

Os ficheiros foram obtidos do jsDelivr a partir dos pacotes npm correspondentes. Para atualizar,
substitui os ficheiros em `vendor/<pacote>/` pela nova versão, mantendo a mesma estrutura de
diretórios (os caminhos dos imports dependem dela), e atualiza a tabela acima.
