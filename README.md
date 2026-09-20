# Fretboard Chess

Joga xadrez tocando guitarra. O browser ouve o microfone (ou a entrada de linha / interface
áudio), deteta a frequência de cada nota e traduz cada quatro notas numa jogada.

> *Play chess with your guitar: the browser listens, detects the pitch of each note and turns
> every four notes into a move. Runs entirely client-side, no build step, no server.*

Sem build, sem npm, sem backend — é HTML e módulos ES. Clona e abre.

---

## Como se joga

Uma jogada são **quatro notas**:

| Nota | Significado |
|---|---|
| 1ª | **coluna** da peça que queres mover (a–h) |
| 2ª | **linha** da peça (1–8) |
| 3ª | **coluna** do destino |
| 4ª | **linha** do destino |

Para jogar `e2e4`: **F#3** (e), **G2** (2), **F#3** (e), **C#3** (4).

Oito notas chegam para tudo, porque a mesma nota serve de coluna e de linha conforme a posição
em que aparece:

| Nota | Freq. | Coluna | Linha | Onde tocar (afinação standard) |
|---|---|---|---|---|
| E2  | 82.4 Hz  | a | 1 | 6ª corda, solta |
| G2  | 98.0 Hz  | b | 2 | 6ª corda, traste 3 |
| A#2 | 116.5 Hz | c | 3 | 5ª corda, traste 1 |
| C#3 | 138.6 Hz | d | 4 | 5ª corda, traste 4 |
| F#3 | 185.0 Hz | e | 5 | 4ª corda, traste 4 |
| A3  | 220.0 Hz | f | 6 | 3ª corda, traste 2 |
| C4  | 261.6 Hz | g | 7 | 3ª corda, traste 5 |
| D#4 | 311.1 Hz | h | 8 | 2ª corda, traste 4 |
| **B4** | **493.9 Hz** | *cancelar a jogada* | | 1ª corda, traste 7 |

Tudo nos primeiros sete trastes. A nota de cancelamento limpa a jogada em curso; quatro segundos
de silêncio fazem o mesmo.

O tabuleiro vai mostrando o que foi ouvido: depois da 1ª nota acende-se a coluna inteira, depois
da 2ª acende-se a casa escolhida e todos os destinos legais dessa peça.

### Enganos

- Se as duas primeiras notas derem uma casa vazia, uma peça do adversário ou uma peça sem jogadas
  legais, a jogada é recusada logo ali — não tens de esperar pelas quatro notas.
- Se o destino for ilegal, só o destino é descartado: a peça continua selecionada.
- A nota de cancelamento (B4) limpa tudo.

---

## Correr localmente

```bash
python serve.py
```

Abre <http://localhost:8000>. Qualquer servidor estático serve; o `serve.py` existe só para não
precisares de instalar nada (define o MIME do WebAssembly e desliga a cache).

> Não abras o `index.html` com duplo clique: módulos ES, AudioWorklet e o microfone exigem
> `http://` ou `https://`.

O acesso ao microfone precisa de um contexto seguro — `localhost` conta como tal, e em produção
tem de ser HTTPS (o GitHub Pages já é).

### Publicar

Não há passo de build: `Settings → Pages → Deploy from a branch → main / root` e está feito.

---

## Afinação e calibração

O preset assume afinação standard a 440 Hz. Se tocas ligeiramente baixo, tens cordas de nylon,
ou a intonação não está perfeita, carrega em **Calibrar notas**: tocas as nove notas uma a uma e
a app guarda a frequência *medida* de cada uma (mediana de 12 leituras, o que ignora o transiente
do ataque). Fica guardado no `localStorage` do browser.

Dois controlos ajudam quando o ambiente não coopera:

- **Limiar de ruído** — sobe-o numa sala barulhenta ou se notas fantasma aparecerem sozinhas;
  desce-o se tiveres de tocar com muita força para ser ouvido.
- **Tolerância** — largura da janela de aceitação em cents. As notas estão a 300 cents umas das
  outras, por isso 100 cents é folgado e seguro.

---

## Porquê assim (as decisões que interessam)

**Autocorrelação em vez de FFT.** Numa guitarra, a fundamental de uma corda grave entrelaçada é
muitas vezes *mais fraca* que o 2º ou o 3º harmónico. Um detetor que escolha o pico mais alto do
espectro reporta a oitava errada com frequência. O detetor aqui é o
[MPM](http://www.cs.otago.ac.nz/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf) (NSDF, McLeod &
Wyvill), que mede periodicidade em vez de energia — que é o que "a nota" realmente significa. A
FFT continua lá, mas só para o espectro no ecrã.

**As oito notas não têm oitavas entre si.** Nenhum par do conjunto está separado por 12, 19 ou 24
semitons. Isto é deliberado: se houvesse uma oitava no conjunto, um erro de deteção produziria
uma casa *diferente mas válida* — o pior tipo de bug, porque ninguém dá por ele. Como está, um
salto de oitava cai fora de todas as janelas e é simplesmente ignorado.

**Rearme por ataque, não só por silêncio.** Casas como `a1` ou `e5` precisam da mesma nota duas
vezes seguidas, por isso não basta esperar que o pitch mude. O detetor rearma quando a amplitude
sobe de repente (uma palhetada nova) ou quando cai abaixo do limiar.

**Decimação por 2 antes da análise.** O sinal é filtrado a 2 kHz e decimado, o que corta o custo
da NSDF para cerca de meio milhão de multiplicações por análise (~23 ms) — corre folgado dentro
do AudioWorklet, sem tocar no thread do UI.

**Stockfish single-thread.** A versão com threads precisa de `SharedArrayBuffer`, que precisa de
cabeçalhos COOP/COEP, que o GitHub Pages não envia. Esta versão funciona em qualquer host
estático.

---

## Estrutura

```
index.html              layout e controlos
css/app.css
src/audio/
  pitch-processor.js    AudioWorklet: NSDF/MPM (sem imports, carregado como módulo de worklet)
  audio-engine.js       getUserMedia, filtros, grafo de áudio, AnalyserNode
  note-detector.js      frames -> eventos de nota (debounce, rearme, período refratário)
  notes.js              teoria musical, conjunto de notas, mapeamento nota -> coordenada
src/game/
  game.js               wrapper sobre chess.js
  move-builder.js       quatro notas -> uma jogada, com validação pelas regras
  engine-stockfish.js   UCI sobre Web Worker
src/ui/                 tabuleiro, afinador, espectro, legenda, calibração
test/pitch-test.html    testes do detetor com sinais sintéticos
vendor/                 dependências, versionadas no repo de propósito
```

`window.fretboardChess` expõe `game`, `mapper`, `detector`, `audio` e `engine` na consola — é
metade da história quando se depura áudio.

---

## Testes

Abre <http://localhost:8000/test/pitch-test.html>.

Gera sinais de corda dedilhada sintéticos para as nove notas, incluindo o caso difícil da
fundamental mais fraca que os harmónicos, e verifica que a frequência detetada cai bem dentro da
janela de aceitação (na prática, dentro de 0.1 cents) e que ruído de fundo não produz notas.

---

## Dependências

Estão em `vendor/`, versionadas de propósito: sem npm, sem CDN, funciona offline e não parte se
uma versão for despublicada. Versões e licenças em [THIRD-PARTY.md](THIRD-PARTY.md).

- [chess.js](https://github.com/jhlywa/chess.js) — regras (BSD-2-Clause)
- [cm-chessboard](https://github.com/shaack/cm-chessboard) — tabuleiro (MIT)
- [stockfish.js](https://github.com/nmrugg/stockfish.js) — motor (GPL-3.0)

## Licença

GPL-3.0-or-later — ver [LICENSE](LICENSE). O projeto distribui o Stockfish, que é GPL, por isso
o conjunto tem de o ser também.
