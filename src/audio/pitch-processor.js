/**
 * AudioWorklet pitch tracker.
 *
 * Runs the McLeod Pitch Method (normalised square difference function) in the
 * time domain rather than a plain FFT peak-pick. On a guitar the fundamental
 * of a wound low string is frequently quieter than its 2nd or 3rd harmonic, so
 * "loudest FFT bin" reports the wrong octave constantly; the NSDF looks at
 * periodicity instead, which is what we actually mean by "the note".
 *
 * The FFT is still used for the on-screen spectrum, via an AnalyserNode on the
 * main thread - it is a display, not the detector.
 *
 * This file is loaded as an AudioWorklet module: no imports, no bundler.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MIN_FREQ = 65 // below the lowest slot (E2, 82 Hz) with room for a flat guitar
const MAX_FREQ = 1200
const DECIMATION = 2 // the graph low-passes at ~2 kHz before us, so this is safe
const WINDOW = 1536 // samples *after* decimation, ~70 ms at 44.1 kHz
const HOP = 1024 // samples *before* decimation, ~23 ms between analyses
const CLARITY_PEAK_RATIO = 0.9 // MPM's k: first peak at least this fraction of the best

class PitchProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.decimatedRate = sampleRate / DECIMATION
        this.ring = new Float32Array(WINDOW * DECIMATION)
        this.writePos = 0
        this.filled = 0
        this.sinceAnalysis = 0
        this.window = new Float32Array(WINDOW)
        this.nsdf = new Float32Array(Math.floor(this.decimatedRate / MIN_FREQ) + 2)
        this.minTau = Math.floor(this.decimatedRate / MAX_FREQ)
        this.maxTau = Math.min(Math.floor(this.decimatedRate / MIN_FREQ), Math.floor(WINDOW / 2))
        this.port.onmessage = (event) => {
            if (event.data === "reset") {
                this.filled = 0
                this.writePos = 0
            }
        }
    }

    process(inputs) {
        const channel = inputs[0] && inputs[0][0]
        if (!channel) return true

        for (let i = 0; i < channel.length; i++) {
            this.ring[this.writePos] = channel[i]
            this.writePos = (this.writePos + 1) % this.ring.length
        }
        this.filled = Math.min(this.filled + channel.length, this.ring.length)
        this.sinceAnalysis += channel.length

        if (this.sinceAnalysis >= HOP && this.filled >= this.ring.length) {
            this.sinceAnalysis = 0
            this.analyse()
        }
        return true
    }

    analyse() {
        // Copy the ring into a linear, decimated window (oldest sample first).
        const ringLen = this.ring.length
        let read = this.writePos
        let sumSquares = 0
        for (let i = 0; i < WINDOW; i++) {
            const sample = this.ring[(read + i * DECIMATION) % ringLen]
            this.window[i] = sample
            sumSquares += sample * sample
        }
        const rms = Math.sqrt(sumSquares / WINDOW)

        const result = this.detectPitch(rms)
        this.port.postMessage({ frequency: result.frequency, clarity: result.clarity, rms, time: currentTime })
    }

    detectPitch(rms) {
        if (rms < 0.0015) return { frequency: 0, clarity: 0 }

        const x = this.window
        const nsdf = this.nsdf
        const maxTau = this.maxTau

        // Normalised square difference function (MPM, McLeod & Wyvill 2005).
        for (let tau = 0; tau <= maxTau; tau++) {
            let acf = 0
            let divisor = 0
            const n = WINDOW - tau
            for (let i = 0; i < n; i++) {
                const a = x[i]
                const b = x[i + tau]
                acf += a * b
                divisor += a * a + b * b
            }
            nsdf[tau] = divisor > 0 ? (2 * acf) / divisor : 0
        }

        // Peak picking: the highest maximum after the first positive-going zero
        // crossing, then the FIRST maximum that reaches k * that height. Taking
        // the first (not the highest) is what keeps it on the fundamental
        // instead of drifting an octave up.
        let tau = this.minTau
        while (tau <= maxTau && nsdf[tau] > 0) tau++ // skip the lobe around tau = 0

        let bestValue = -1
        const peaks = []
        while (tau <= maxTau) {
            if (nsdf[tau] > 0) {
                let peakTau = tau
                while (tau <= maxTau && nsdf[tau] > 0) {
                    if (nsdf[tau] > nsdf[peakTau]) peakTau = tau
                    tau++
                }
                peaks.push(peakTau)
                if (nsdf[peakTau] > bestValue) bestValue = nsdf[peakTau]
            } else {
                tau++
            }
        }

        if (!peaks.length || bestValue <= 0) return { frequency: 0, clarity: 0 }

        const threshold = CLARITY_PEAK_RATIO * bestValue
        let chosen = -1
        for (const peak of peaks) {
            if (nsdf[peak] >= threshold) { chosen = peak; break }
        }
        if (chosen < this.minTau) return { frequency: 0, clarity: 0 }

        // Parabolic interpolation around the peak: without it the quantisation
        // of tau alone costs ~30 cents up at D#4.
        const y0 = nsdf[chosen - 1] ?? 0
        const y1 = nsdf[chosen]
        const y2 = nsdf[chosen + 1] ?? 0
        const denominator = 2 * (2 * y1 - y0 - y2)
        const shift = denominator !== 0 ? (y2 - y0) / denominator : 0
        const refinedTau = chosen + shift
        if (refinedTau <= 0) return { frequency: 0, clarity: 0 }

        const frequency = this.decimatedRate / refinedTau
        if (frequency < MIN_FREQ || frequency > MAX_FREQ) return { frequency: 0, clarity: 0 }
        return { frequency, clarity: Math.max(0, Math.min(1, y1)) }
    }
}

registerProcessor("pitch-processor", PitchProcessor)
