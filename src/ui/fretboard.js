/**
 * The fretboard diagram.
 *
 * This is the single most important thing on the screen for a newcomer: it is
 * what turns "play a note" into "put your finger here". A table of frequencies
 * asks the reader to already know the answer; a picture of a neck does not.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FILES, RANKS, fretPosition, STANDARD_TUNING, midiToName } from "../audio/notes.js"

const FRETS = 7
const STRING_LABELS = ["e", "B", "G", "D", "A", "E"] // string 1 (thin) to 6 (thick)
const INLAY_FRETS = [3, 5, 7]

export class Fretboard {
    constructor(root, mapper) {
        this.root = root
        this.mapper = mapper
        this.render()
    }

    /** Every slot, with its place on the neck. */
    positions() {
        const list = []
        for (let slot = 0; slot < this.mapper.slotCount; slot++) {
            const midi = this.mapper.midiForSlot(slot)
            const position = fretPosition(midi)
            if (position) list.push({ slot, midi, ...position })
        }
        return list
    }

    render() {
        const padLeft = 56
        const padRight = 16
        const padTop = 22
        const padBottom = 26
        const fretWidth = 52
        const stringGap = 26
        const width = padLeft + FRETS * fretWidth + padRight
        const height = padTop + 5 * stringGap + padBottom

        const stringY = (stringNumber) => padTop + (stringNumber - 1) * stringGap
        // Fret 0 (open) sits on the nut; fretted notes sit between the wires.
        const fretX = (fret) => (fret === 0 ? padLeft - 22 : padLeft + (fret - 0.5) * fretWidth)

        const parts = []

        // Neck
        parts.push(`<rect x="${padLeft}" y="${padTop - 9}" width="${FRETS * fretWidth}" height="${5 * stringGap + 18}" rx="3" class="fb-neck"/>`)
        parts.push(`<rect x="${padLeft - 5}" y="${padTop - 9}" width="5" height="${5 * stringGap + 18}" class="fb-nut"/>`)

        for (let fret = 1; fret <= FRETS; fret++) {
            const x = padLeft + fret * fretWidth
            parts.push(`<line x1="${x}" y1="${padTop - 9}" x2="${x}" y2="${padTop + 5 * stringGap + 9}" class="fb-fret"/>`)
            parts.push(`<text x="${x - fretWidth / 2}" y="${height - 8}" class="fb-fret-number">${fret}</text>`)
        }
        parts.push(`<text x="${fretX(0)}" y="${height - 8}" class="fb-fret-number">0</text>`)

        for (const fret of INLAY_FRETS) {
            parts.push(`<circle cx="${padLeft + (fret - 0.5) * fretWidth}" cy="${padTop + 2.5 * stringGap}" r="4" class="fb-inlay"/>`)
        }

        for (let stringNumber = 1; stringNumber <= 6; stringNumber++) {
            const y = stringY(stringNumber)
            parts.push(`<line x1="${padLeft - 5}" y1="${y}" x2="${padLeft + FRETS * fretWidth}" y2="${y}" class="fb-string" style="stroke-width:${0.8 + stringNumber * 0.32}"/>`)
            parts.push(`<text x="${padLeft - 46}" y="${y + 4}" class="fb-string-label">${STRING_LABELS[stringNumber - 1]}</text>`)
        }

        for (const position of this.positions()) {
            const x = fretX(position.fret)
            const y = stringY(position.string)
            const isCancel = this.mapper.isCancel(position.slot)
            const coordinate = isCancel ? "✕" : `${FILES[position.slot]}${RANKS[position.slot]}`
            parts.push(`
                <g class="fb-dot ${isCancel ? "is-cancel" : ""}" data-slot="${position.slot}">
                    <circle cx="${x}" cy="${y}" r="11.5" class="fb-dot-bg"/>
                    <text x="${x}" y="${y + 4.5}" class="fb-dot-label">${coordinate}</text>
                    <text x="${x}" y="${y - 15}" class="fb-dot-note">${midiToName(position.midi)}</text>
                </g>`)
        }

        this.root.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" class="fretboard" role="img"
                 aria-label="Guitar neck showing which note maps to which file and rank">
                ${parts.join("")}
            </svg>`
        this.dots = new Map()
        for (const element of this.root.querySelectorAll(".fb-dot")) {
            this.dots.set(Number(element.dataset.slot), element)
        }
    }

    /** Light a note up as it is heard. */
    flash(slot) {
        const dot = this.dots.get(slot)
        if (!dot) return
        dot.classList.remove("is-hit")
        void dot.getBoundingClientRect()
        dot.classList.add("is-hit")
        clearTimeout(this.flashTimers?.[slot])
        this.flashTimers = this.flashTimers || {}
        this.flashTimers[slot] = setTimeout(() => dot.classList.remove("is-hit"), 420)
    }

    /**
     * Dim everything except these slots. Used by the guided setup to point at
     * exactly one note, and while entering a move to show which half of the
     * mapping (file or rank) is being asked for.
     */
    focus(slots = null) {
        const focused = slots === null ? null : new Set(slots)
        for (const [slot, dot] of this.dots) {
            dot.classList.toggle("is-dimmed", focused !== null && !focused.has(slot))
            dot.classList.toggle("is-focused", focused !== null && focused.has(slot))
        }
    }

    /** Re-read the mapper (after calibration changed the frequencies). */
    refresh() {
        this.render()
    }
}

/** Where a slot lives on the neck, as plain words: "6th string, fret 3". */
export function positionText(mapper, slot) {
    const position = fretPosition(mapper.midiForSlot(slot))
    if (!position) return ""
    const ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th"][position.string - 1]
    const open = position.fret === 0
    return open ? `${ordinal} string, open` : `${ordinal} string, fret ${position.fret}`
}

export { STANDARD_TUNING }
