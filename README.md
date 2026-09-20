# Guitar Chess

**Play chess by playing your guitar.** The browser listens to your microphone, audio interface
or line input, works out which note you played, and turns every four notes into a move.

**[Play it here](https://gustavozacarias04.github.io/guitar-chess/)** — nothing to install.

No build step, no npm, no backend. It is HTML and ES modules: clone it and open it.

---

## How to play

A move is **four notes**:

| Note | Meaning |
|---|---|
| 1st | **file** of the piece you want to move (a–h) |
| 2nd | **rank** of that piece (1–8) |
| 3rd | **file** of the destination |
| 4th | **rank** of the destination |

To play `e2e4`: **F#3** (e), **G2** (2), **F#3** (e), **C#3** (4).

Eight notes cover the whole board, because the same note means a file or a rank depending on
where it lands in the sequence:

| Note | Freq. | File | Rank | Where to play it (standard tuning) |
|---|---|---|---|---|
| E2  | 82.4 Hz  | a | 1 | 6th string, open |
| G2  | 98.0 Hz  | b | 2 | 6th string, fret 3 |
| A#2 | 116.5 Hz | c | 3 | 5th string, fret 1 |
| C#3 | 138.6 Hz | d | 4 | 5th string, fret 4 |
| F#3 | 185.0 Hz | e | 5 | 4th string, fret 4 |
| A3  | 220.0 Hz | f | 6 | 3rd string, fret 2 |
| C4  | 261.6 Hz | g | 7 | 3rd string, fret 5 |
| D#4 | 311.1 Hz | h | 8 | 2nd string, fret 4 |
| **B4** | **493.9 Hz** | *cancel the move* | | 1st string, fret 7 |

Everything sits in the first seven frets. You never have to remember the table: the neck diagram
is on screen the whole time, and the app dims every note that cannot come next.

**First run** walks you through it in three steps — pick an input, play the eight notes once
(which is also how it learns your guitar), then a two-square drill to prove it works. It takes
about a minute and never appears again.

### When you play a wrong note

- If the first two notes land on an empty square, an opponent piece, or a piece with no legal
  moves, the move is rejected immediately — you do not have to finish all four notes.
- If the destination is illegal, only the destination is dropped; the piece stays selected.
- Play **B4** to clear the move. Four seconds of silence does the same.

### Stage mode

A button in the top bar hides everything except the board, the neck and the current move, and
goes fullscreen. Made for recording and for showing it on a projector.

---

## Run it locally

```bash
python serve.py
```

Then open <http://localhost:8000>. Any static server works; `serve.py` exists so a fresh clone
needs nothing installed (it sets the WebAssembly MIME type and disables caching).

> Do not open `index.html` by double-clicking it. ES modules, AudioWorklet and microphone access
> all require `http://` or `https://`.

Microphone access needs a secure context — `localhost` counts, and in production it has to be
HTTPS (GitHub Pages already is).

### Deploying

There is no build: `Settings → Pages → Deploy from a branch → main / root` and it is live.

---

## Tuning and calibration

The defaults assume standard tuning at 440 Hz. The guided setup measures what your guitar
actually produces (the median of twelve readings per note, which ignores the attack transient)
and listens for that instead, so nylon strings, old strings and a guitar tuned slightly flat all
just work. It is stored in `localStorage`; **Setup** re-runs it at any time.

The **Advanced** panel has the knobs if you want them:

- **Noise gate** — set automatically from two seconds of room noise during setup. Raise it in a
  loud room; lower it if you have to dig in hard to be heard.
- **Pitch tolerance** — the acceptance window in cents. The notes are 300 cents apart, so the
  default 100 is generous and still unambiguous.
- **Type a move instead** — enter `e2e4` by keyboard. Useful for testing, and for rescuing a demo
  when a string breaks.

---

## Why it is built this way

**Autocorrelation, not an FFT peak.** On a guitar the fundamental of a wound low string is often
*weaker* than its second or third harmonic. A detector that picks the tallest bin in the spectrum
reports the wrong octave constantly. This uses
[MPM](http://www.cs.otago.ac.nz/tartini/papers/A_Smarter_Way_to_Find_Pitch.pdf) (the NSDF, McLeod
& Wyvill), which measures periodicity instead of energy — which is what "the note" actually
means. The FFT is still there, but only to draw the spectrum.

**No octaves inside the note set.** No two notes in the set are 12, 19 or 24 semitones apart.
This is deliberate: with an octave pair in the set, a detection slip would produce a *different
but perfectly valid* square — the worst kind of bug, because nobody notices it. As it is, an
octave slip falls outside every acceptance window and is simply ignored.

**Re-arm on attack, not only on silence.** Squares like `a1` and `e5` need the same note twice in
a row, so waiting for the pitch to change is not enough. The detector re-arms when the amplitude
jumps (a fresh pluck) as well as when it falls below the gate.

**Decimate by 2 before analysing.** The signal is low-passed at 2 kHz and decimated, which brings
the NSDF down to about half a million multiplies per analysis (every 23 ms) — comfortable inside
an AudioWorklet, and it never touches the UI thread.

**Single-threaded Stockfish.** The threaded build needs `SharedArrayBuffer`, which needs
COOP/COEP headers, which GitHub Pages does not send. This build runs on any static host.

---

## Layout

```
index.html              markup and controls
css/app.css
src/audio/
  pitch-processor.js    AudioWorklet: NSDF/MPM (no imports - loaded as a worklet module)
  audio-engine.js       getUserMedia, filter chain, AnalyserNode
  note-detector.js      frames -> note events (debounce, re-arm, refractory period)
  notes.js              music theory, the note set, note -> coordinate mapping
src/game/
  game.js               chess.js wrapper
  move-builder.js       four notes -> one move, validated against the rules
  engine-stockfish.js   UCI over a Web Worker
src/ui/
  board-ui.js           board and move hints
  fretboard.js          the neck diagram
  onboarding.js         guided setup: input, note learning, drill
  game-meta.js          evaluation bar and captured pieces
  tuner.js, spectrum.js
test/pitch-test.html    detector tests against synthetic signals
vendor/                 dependencies, committed on purpose
```

`window.guitarChess` exposes `game`, `mapper`, `detector`, `audio` and `engine` in the console —
with an audio app that is half the debugging story.

---

## Tests

Open <http://localhost:8000/test/pitch-test.html>.

It synthesises plucked-string signals for all nine notes, including the hard case where the
fundamental is quieter than the harmonics, and checks that the detected pitch lands well inside
the acceptance window (in practice within 0.1 cents) and that background noise produces no notes.

---

## Dependencies

Committed under `vendor/` on purpose: no npm, no CDN, works offline, and cannot break because a
version was unpublished. Versions and licences in [THIRD-PARTY.md](THIRD-PARTY.md).

- [chess.js](https://github.com/jhlywa/chess.js) — rules (BSD-2-Clause)
- [cm-chessboard](https://github.com/shaack/cm-chessboard) — board (MIT)
- [stockfish.js](https://github.com/nmrugg/stockfish.js) — engine (GPL-3.0)

## Licence

GPL-3.0-or-later — see [LICENSE](LICENSE). The project ships Stockfish, which is GPL, so the
whole thing has to be.
