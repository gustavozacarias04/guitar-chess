/**
 * Thin wrapper over chess.js so the rest of the app never touches its API
 * directly (and so swapping the rules engine stays a one-file job).
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Chess } from "../../vendor/chess.js/dist/esm/chess.js"

export class Game extends EventTarget {
    constructor() {
        super()
        this.chess = new Chess()
    }

    reset() {
        this.chess.reset()
        this.emit("changed", { reason: "reset" })
    }

    get fen() {
        return this.chess.fen()
    }

    /** "w" or "b" */
    get turn() {
        return this.chess.turn()
    }

    pieceAt(square) {
        return this.chess.get(square) || null
    }

    legalMovesFrom(square) {
        try {
            return this.chess.moves({ square, verbose: true })
        } catch {
            return []
        }
    }

    /** Is this a pawn arriving on the last rank? */
    isPromotion(from, to) {
        return this.legalMovesFrom(from).some((move) => move.to === to && move.promotion)
    }

    move(from, to, promotion = "q") {
        try {
            const result = this.chess.move({ from, to, promotion })
            if (result) this.emit("changed", { reason: "move", move: result })
            return result
        } catch {
            return null
        }
    }

    undo() {
        const undone = this.chess.undo()
        if (undone) this.emit("changed", { reason: "undo", move: undone })
        return undone
    }

    history(verbose = true) {
        return this.chess.history({ verbose })
    }

    get isOver() {
        return this.chess.isGameOver()
    }

    /** Human readable end-of-game reason, or null. */
    get outcome() {
        if (!this.chess.isGameOver()) return null
        if (this.chess.isCheckmate()) return this.chess.turn() === "w" ? "Xeque-mate — as pretas ganham" : "Xeque-mate — as brancas ganham"
        if (this.chess.isStalemate()) return "Empate por afogamento"
        if (this.chess.isThreefoldRepetition()) return "Empate por repetição"
        if (this.chess.isInsufficientMaterial()) return "Empate por material insuficiente"
        if (this.chess.isDraw()) return "Empate (regra dos 50 lances)"
        return "Fim de jogo"
    }

    get inCheck() {
        return this.chess.inCheck()
    }

    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }))
    }
}
