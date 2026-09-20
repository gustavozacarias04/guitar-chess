/**
 * Stockfish (WASM) as the opponent, driven over UCI in a Web Worker.
 *
 * The single-threaded build is deliberate: threaded Stockfish needs
 * SharedArrayBuffer, which needs COOP/COEP response headers, which GitHub
 * Pages cannot send. This build just works from any static host.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const WASM_WORKER = new URL("../../vendor/stockfish/stockfish.wasm.js", import.meta.url)
const JS_WORKER = new URL("../../vendor/stockfish/stockfish.js", import.meta.url)

/** Skill Level is Stockfish's own handicap knob; 0 blunders a lot, 20 is full strength. */
export const LEVELS = [
    { id: "iniciante", label: "Iniciante", skill: 0, movetime: 150, depth: 1 },
    { id: "facil", label: "Fácil", skill: 3, movetime: 300, depth: 4 },
    { id: "medio", label: "Médio", skill: 8, movetime: 600, depth: 8 },
    { id: "dificil", label: "Difícil", skill: 14, movetime: 1200, depth: 14 },
    { id: "maximo", label: "Máximo", skill: 20, movetime: 2500, depth: 0 }
]

export class StockfishEngine extends EventTarget {
    constructor() {
        super()
        this.worker = null
        this.ready = false
        this.level = LEVELS[2]
        this.pendingResolve = null
        this.lastInfo = null
    }

    async init() {
        if (this.worker) return
        const url = typeof WebAssembly === "object" ? WASM_WORKER : JS_WORKER
        this.worker = new Worker(url)
        this.worker.onmessage = (event) => this.onLine(typeof event.data === "string" ? event.data : event.data?.data)
        this.worker.onerror = (event) => {
            this.dispatchEvent(new CustomEvent("error", { detail: event.message || "worker error" }))
        }

        await this.expect("uci", "uciok")
        this.setLevel(this.level.id)
        await this.expect("isready", "readyok")
        this.ready = true
        this.dispatchEvent(new CustomEvent("ready"))
    }

    setLevel(id) {
        const level = LEVELS.find((l) => l.id === id) || LEVELS[2]
        this.level = level
        this.send(`setoption name Skill Level value ${level.skill}`)
    }

    newGame() {
        this.send("ucinewgame")
        this.send("isready")
    }

    /** @returns {Promise<{from:string,to:string,promotion?:string}|null>} */
    bestMove(fen) {
        return new Promise((resolve) => {
            this.pendingResolve = resolve
            this.send(`position fen ${fen}`)
            const limits = this.level.depth > 0
                ? `go depth ${this.level.depth} movetime ${this.level.movetime}`
                : `go movetime ${this.level.movetime}`
            this.send(limits)
        })
    }

    stop() {
        this.send("stop")
    }

    onLine(line) {
        if (typeof line !== "string") return
        this.dispatchEvent(new CustomEvent("line", { detail: line }))

        if (line.startsWith("info") && line.includes(" score ")) {
            const depth = /depth (\d+)/.exec(line)?.[1]
            const cp = /score cp (-?\d+)/.exec(line)?.[1]
            const mate = /score mate (-?\d+)/.exec(line)?.[1]
            this.lastInfo = { depth, cp: cp ? Number(cp) : null, mate: mate ? Number(mate) : null }
            this.dispatchEvent(new CustomEvent("info", { detail: this.lastInfo }))
        }

        if (line.startsWith("bestmove")) {
            const token = line.split(/\s+/)[1]
            const resolve = this.pendingResolve
            this.pendingResolve = null
            if (!resolve) return
            if (!token || token === "(none)") return resolve(null)
            resolve({
                from: token.slice(0, 2),
                to: token.slice(2, 4),
                promotion: token.length > 4 ? token[4] : undefined
            })
        }

        if (this.waiter && line.startsWith(this.waiter.token)) {
            const done = this.waiter.resolve
            this.waiter = null
            done()
        }
    }

    expect(command, token) {
        return new Promise((resolve) => {
            this.waiter = { token, resolve }
            this.send(command)
        })
    }

    send(command) {
        this.worker?.postMessage(command)
    }

    destroy() {
        if (!this.worker) return
        this.send("quit")
        this.worker.terminate()
        this.worker = null
        this.ready = false
    }
}
