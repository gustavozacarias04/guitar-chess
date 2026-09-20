/**
 * Calibration: measure the nine notes on the actual instrument.
 *
 * Nylon and steel strings, string age, action and intonation all pull the real
 * pitch away from the equal-tempered table, and plenty of people simply tune
 * by ear a little flat. Storing the measured frequency of each slot means the
 * acceptance window is centred on what you really play, not on theory.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { cents, fretPosition } from "../audio/notes.js"

const SAMPLES_NEEDED = 12
const ACCEPT_CENTS = 250 // generous: we are measuring, not judging

export class Calibration extends EventTarget {
    constructor(root, mapper) {
        super()
        this.root = root
        this.mapper = mapper
        this.active = false
        this.slot = 0
        this.samples = []
        this.results = {}
    }

    start() {
        this.active = true
        this.slot = 0
        this.samples = []
        this.results = {}
        this.root.hidden = false
        this.render()
    }

    cancel() {
        this.active = false
        this.root.hidden = true
        this.dispatchEvent(new CustomEvent("cancelled"))
    }

    skip() {
        if (!this.active) return
        this.nextSlot()
    }

    pushFrame(frame) {
        if (!this.active) return
        const { frequency, clarity, rms } = frame
        if (!frequency || clarity < 0.9 || rms < 0.015) return
        const expected = this.mapper.freqForSlot(this.slot)
        if (Math.abs(cents(frequency, expected)) > ACCEPT_CENTS) {
            this.render(`ouvi ${frequency.toFixed(1)} Hz — demasiado longe, é a nota certa?`)
            return
        }
        this.samples.push(frequency)
        this.render()
        if (this.samples.length >= SAMPLES_NEEDED) {
            const sorted = [...this.samples].sort((a, b) => a - b)
            this.results[this.slot] = sorted[Math.floor(sorted.length / 2)] // median, ignores the attack transient
            this.nextSlot()
        }
    }

    nextSlot() {
        this.samples = []
        this.slot++
        if (this.slot >= this.mapper.slotCount) {
            this.active = false
            this.root.hidden = true
            this.dispatchEvent(new CustomEvent("done", { detail: { calibration: this.results } }))
            return
        }
        this.render()
    }

    render(message = "") {
        if (!this.active) return
        const label = this.mapper.label(this.slot)
        const position = fretPosition(this.mapper.midiForSlot(this.slot))
        const expected = this.mapper.freqForSlot(this.slot)
        const progress = Math.round((this.samples.length / SAMPLES_NEEDED) * 100)
        const measured = this.samples.length
            ? `${this.samples[this.samples.length - 1].toFixed(1)} Hz`
            : "à espera..."
        this.root.innerHTML = `
            <div class="calibration-card">
                <h2>Calibração ${this.slot + 1}/${this.mapper.slotCount}</h2>
                <p class="calibration-target">
                    Toca <b>${label}</b>
                    ${position ? `<span>(corda ${position.string}, traste ${position.fret})</span>` : ""}
                    — ${this.mapper.isCancel(this.slot) ? "nota de cancelamento" : `coluna/linha ${this.mapper.coordinateLabel(this.slot)}`}
                </p>
                <p class="calibration-expected">esperado ${expected.toFixed(1)} Hz · ouvido ${measured}</p>
                <div class="progress"><div style="width:${progress}%"></div></div>
                ${message ? `<p class="calibration-warning">${message}</p>` : "<p class='hint'>Toca a nota algumas vezes, deixando soar.</p>"}
                <div class="calibration-actions">
                    <button type="button" data-action="skip">Saltar esta</button>
                    <button type="button" data-action="cancel">Cancelar</button>
                </div>
            </div>`
        this.root.querySelector('[data-action="skip"]').onclick = () => this.skip()
        this.root.querySelector('[data-action="cancel"]').onclick = () => this.cancel()
    }
}
