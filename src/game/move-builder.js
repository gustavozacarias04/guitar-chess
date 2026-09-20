/**
 * Four notes -> one move.
 *
 *   note 1 -> file of the origin      (a-h)
 *   note 2 -> rank of the origin      (1-8)
 *   note 3 -> file of the destination
 *   note 4 -> rank of the destination
 *
 * The rules are used as a safety net: an origin that holds no piece of yours
 * is rejected immediately instead of waiting for four notes, and an illegal
 * destination only throws away the destination, so you do not have to re-enter
 * the piece you already selected.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FILES, RANKS } from "../audio/notes.js"

export const IDLE_TIMEOUT_MS = 4000

export class MoveBuilder extends EventTarget {
    constructor(game, options = {}) {
        super()
        this.game = game
        this.timeoutMs = options.timeoutMs ?? IDLE_TIMEOUT_MS
        this.slots = []
        this.timer = null
    }

    get origin() {
        return this.slots.length >= 2 ? FILES[this.slots[0]] + RANKS[this.slots[1]] : null
    }

    get pendingFile() {
        return this.slots.length === 1 ? FILES[this.slots[0]]
            : this.slots.length === 3 ? FILES[this.slots[2]] : null
    }

    clear(reason = "cleared") {
        const had = this.slots.length > 0
        this.slots = []
        this.stopTimer()
        if (had) this.emit("cleared", { reason })
        this.emit("update", this.snapshot())
    }

    /** Feed one detected slot index. Cancel notes are handled here. */
    feed(slot, mapper) {
        if (mapper.isCancel(slot)) {
            this.clear("cancel note")
            return
        }

        this.slots.push(slot)
        this.restartTimer()

        if (this.slots.length === 2) {
            const square = this.origin
            const piece = this.game.pieceAt(square)
            if (!piece) {
                this.reject(`${square} está vazia`)
                return
            }
            if (piece.color !== this.game.turn) {
                this.reject(`${square} não é uma peça tua`)
                return
            }
            if (this.game.legalMovesFrom(square).length === 0) {
                this.reject(`a peça em ${square} não tem jogadas legais`)
                return
            }
        }

        if (this.slots.length === 4) {
            const from = this.origin
            const to = FILES[this.slots[2]] + RANKS[this.slots[3]]
            const legal = this.game.legalMovesFrom(from).some((move) => move.to === to)
            if (!legal) {
                this.slots.length = 2 // keep the origin, ask for a new destination
                this.restartTimer()
                this.emit("rejected", { reason: `${from}${to} não é legal`, keepOrigin: true })
                this.emit("update", this.snapshot())
                return
            }
            this.stopTimer()
            const slots = [...this.slots]
            this.slots = []
            this.emit("update", this.snapshot())
            this.emit("move", { from, to, slots })
            return
        }

        this.emit("update", this.snapshot())
    }

    reject(reason) {
        this.slots = []
        this.stopTimer()
        this.emit("rejected", { reason, keepOrigin: false })
        this.emit("update", this.snapshot())
    }

    snapshot() {
        return {
            slots: [...this.slots],
            origin: this.origin,
            pendingFile: this.pendingFile,
            step: this.slots.length
        }
    }

    restartTimer() {
        this.stopTimer()
        this.timer = setTimeout(() => this.clear("timeout"), this.timeoutMs)
    }

    stopTimer() {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
    }

    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }))
    }
}
