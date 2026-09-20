/**
 * Turns a stream of pitch frames into discrete note events.
 *
 * Two things make this harder than "frequency changed, fire an event":
 *
 *  1. A single pluck produces ~20 frames. Without debouncing, one note would
 *     enter a whole move.
 *  2. Squares like a1 or e5 need the SAME note twice in a row, so we cannot
 *     simply wait for the pitch to change. We re-arm on an amplitude onset
 *     (a new pluck) as well as on silence.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const DEFAULT_DETECTOR_OPTIONS = {
    clarityThreshold: 0.85, // NSDF peak height; below this the signal is not periodic enough
    rmsGate: 0.012, // noise floor - raise it if the room is loud
    releaseRatio: 0.55, // fraction of the gate that counts as "silence again"
    stableFrames: 3, // ~70 ms of agreement before a note is accepted
    onsetRatio: 1.7, // rms jump that counts as a fresh pluck
    refractoryMs: 120 // minimum spacing between two accepted notes
}

export class NoteDetector extends EventTarget {
    constructor(mapper, options = {}) {
        super()
        this.mapper = mapper
        this.options = { ...DEFAULT_DETECTOR_OPTIONS, ...options }
        this.reset()
    }

    reset() {
        this.armed = true
        this.candidateSlot = null
        this.candidateCount = 0
        this.envelope = 0
        this.lastEmitAt = 0
    }

    setOptions(options) {
        Object.assign(this.options, options)
    }

    /** @param {{frequency:number, clarity:number, rms:number, time:number}} frame */
    push(frame) {
        const { clarityThreshold, rmsGate, releaseRatio, stableFrames, onsetRatio, refractoryMs } = this.options
        const { frequency, clarity, rms } = frame
        const now = performance.now()

        const match = clarity >= clarityThreshold && rms >= rmsGate ? this.mapper.match(frequency) : null

        this.dispatchEvent(new CustomEvent("frame", {
            detail: { ...frame, match, armed: this.armed, gate: rms >= rmsGate }
        }))

        // Re-arm on silence...
        if (rms < rmsGate * releaseRatio) {
            this.armed = true
            this.candidateSlot = null
            this.candidateCount = 0
        }
        // ...or on a new attack, so a repeated note still registers.
        if (rms > this.envelope * onsetRatio && rms >= rmsGate) {
            this.armed = true
            this.candidateSlot = null
            this.candidateCount = 0
        }
        this.envelope = this.envelope * 0.85 + rms * 0.15

        if (!match) {
            this.candidateCount = 0
            this.candidateSlot = null
            return
        }

        if (match.slot === this.candidateSlot) {
            this.candidateCount++
        } else {
            this.candidateSlot = match.slot
            this.candidateCount = 1
        }

        if (this.candidateCount >= stableFrames && this.armed && now - this.lastEmitAt >= refractoryMs) {
            this.armed = false
            this.lastEmitAt = now
            this.candidateCount = 0
            this.dispatchEvent(new CustomEvent("note", { detail: match }))
        }
    }
}
