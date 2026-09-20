/**
 * Music theory helpers + the note -> board coordinate mapping.
 *
 * Guitar Chess - Copyright (C) 2026
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

/** Concert pitch. Exposed so a guitar tuned to 432 Hz (or just flat) still works. */
export const DEFAULT_A4 = 440

export function midiToFreq(midi, a4 = DEFAULT_A4) {
    return a4 * Math.pow(2, (midi - 69) / 12)
}

export function freqToMidi(freq, a4 = DEFAULT_A4) {
    return 69 + 12 * Math.log2(freq / a4)
}

export function midiToName(midi) {
    const m = Math.round(midi)
    return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
}

/** Signed distance in cents from `freq` to `reference`. */
export function cents(freq, reference) {
    return 1200 * Math.log2(freq / reference)
}

/**
 * Standard tuning, low to high. Used only to render the fretboard hints.
 */
export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40] // e B G D A E (string 1 -> 6)

/**
 * Where to play a midi note, as low on the neck as possible.
 * Returns {string: 1..6, fret: 0..n} or null.
 */
export function fretPosition(midi) {
    let best = null
    for (let i = 0; i < STANDARD_TUNING.length; i++) {
        const fret = midi - STANDARD_TUNING[i]
        if (fret < 0 || fret > 12) continue
        if (!best || fret < best.fret) best = { string: i + 1, fret }
    }
    return best
}

/**
 * The default note set.
 *
 * Eight notes, one per coordinate. The first note of a pair gives the file
 * (a-h), the second gives the rank (1-8), so a move is four notes:
 * file, rank, file, rank.
 *
 * The set is chosen so that NO two notes are 12, 19 or 24 semitones apart.
 * That matters: the classic failure of any pitch detector on a guitar is the
 * octave error (the fundamental of a wound low string is often weaker than its
 * harmonics). If the set contained an octave pair, a detection slip would
 * silently produce a *different but valid* square - the worst kind of bug.
 * With this set, an octave slip lands on no note at all and is simply ignored.
 *
 * All nine notes sit within the first five frets.
 */
export const DEFAULT_NOTE_SET = [40, 43, 46, 49, 54, 57, 60, 63] // E2 G2 A#2 C#3 F#3 A3 C4 D#4

/** Played to abort the move being entered. B4, string 1 fret 7. */
export const DEFAULT_CANCEL_NOTE = 71

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"]
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"]

/**
 * Maps a detected frequency onto one of the nine slots.
 *
 * Holds the *measured* frequency of each slot, not the theoretical one, so
 * calibration against a real instrument (nylon vs steel, action, intonation)
 * just replaces these numbers.
 */
export class NoteMapper {
    constructor(options = {}) {
        this.a4 = options.a4 ?? DEFAULT_A4
        this.noteSet = options.noteSet ?? [...DEFAULT_NOTE_SET]
        this.cancelNote = options.cancelNote ?? DEFAULT_CANCEL_NOTE
        /** Half-width of the acceptance window. Slots are >= 300 cents apart. */
        this.tolerance = options.tolerance ?? 100
        /** slot index (0..7, or 8 for cancel) -> measured Hz. */
        this.calibration = options.calibration ?? {}
    }

    get slotCount() {
        return this.noteSet.length + 1
    }

    /** Midi note for a slot index; slot 8 is the cancel note. */
    midiForSlot(slot) {
        return slot < this.noteSet.length ? this.noteSet[slot] : this.cancelNote
    }

    /** The frequency we actually listen for: calibrated if available. */
    freqForSlot(slot) {
        const measured = this.calibration[slot]
        return measured && measured > 0 ? measured : midiToFreq(this.midiForSlot(slot), this.a4)
    }

    label(slot) {
        return midiToName(this.midiForSlot(slot))
    }

    /** "file a" / "rank 3" / "cancel" - what the slot means on the board. */
    coordinateLabel(slot) {
        if (slot >= this.noteSet.length) return "\u2716"
        return `${FILES[slot]} / ${RANKS[slot]}`
    }

    isCancel(slot) {
        return slot >= this.noteSet.length
    }

    /**
     * Nearest slot to `freq`, or null when it falls outside every window.
     * @returns {{slot:number, cents:number, freq:number}|null}
     */
    match(freq) {
        if (!freq || freq <= 0) return null
        let best = null
        for (let slot = 0; slot < this.slotCount; slot++) {
            const delta = cents(freq, this.freqForSlot(slot))
            if (Math.abs(delta) <= this.tolerance && (!best || Math.abs(delta) < Math.abs(best.cents))) {
                best = { slot, cents: delta, freq }
            }
        }
        return best
    }

    /** Nearest chromatic note, for the tuner readout (independent of the set). */
    describe(freq) {
        if (!freq || freq <= 0) return null
        const midi = freqToMidi(freq, this.a4)
        const nearest = Math.round(midi)
        return { name: midiToName(nearest), cents: (midi - nearest) * 100, freq, midi: nearest }
    }

    toJSON() {
        return { a4: this.a4, noteSet: this.noteSet, cancelNote: this.cancelNote, tolerance: this.tolerance, calibration: this.calibration }
    }
}
