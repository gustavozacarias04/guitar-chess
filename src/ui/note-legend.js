/**
 * The legend: which note means which coordinate, and where to play it.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FILES, RANKS, fretPosition } from "../audio/notes.js"

export class NoteLegend {
    constructor(root, mapper) {
        this.root = root
        this.mapper = mapper
        this.render()
    }

    render() {
        const rows = []
        for (let slot = 0; slot < this.mapper.slotCount; slot++) {
            const midi = this.mapper.midiForSlot(slot)
            const position = fretPosition(midi)
            const isCancel = this.mapper.isCancel(slot)
            const calibrated = this.mapper.calibration[slot]
            rows.push(`
                <tr data-slot="${slot}" class="${isCancel ? "is-cancel" : ""}">
                    <td class="legend-note">${this.mapper.label(slot)}</td>
                    <td class="legend-coord">${isCancel ? "cancelar" : `<b>${FILES[slot]}</b> / <b>${RANKS[slot]}</b>`}</td>
                    <td class="legend-hz">${this.mapper.freqForSlot(slot).toFixed(1)}${calibrated ? " *" : ""}</td>
                    <td class="legend-fret">${position ? `${position.string}ª / traste ${position.fret}` : "—"}</td>
                </tr>`)
        }
        this.root.innerHTML = `
            <table class="legend">
                <thead><tr><th>Nota</th><th>Coluna / Linha</th><th>Hz</th><th>Onde tocar</th></tr></thead>
                <tbody>${rows.join("")}</tbody>
            </table>
            <p class="hint">* frequência calibrada na tua guitarra. A 1ª nota de cada par dá a coluna, a 2ª dá a linha.</p>`
    }

    flash(slot) {
        const row = this.root.querySelector(`tr[data-slot="${slot}"]`)
        if (!row) return
        row.classList.remove("flash")
        void row.offsetWidth // restart the animation
        row.classList.add("flash")
    }
}
