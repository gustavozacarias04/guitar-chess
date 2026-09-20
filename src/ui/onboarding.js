/**
 * Guided setup: microphone, then the eight notes, then a short drill.
 *
 * A chess player who opens this has no reason to know what a noise gate is, so
 * nothing technical is asked of them. The three steps also happen to do the
 * three things the app needs: pick an input, measure the room and the
 * instrument, and confirm that notes actually land before a real game depends
 * on it.
 *
 * Step 2 doubles as calibration - the frequency measured here is the one the
 * detector listens for afterwards, which is what makes nylon strings, old
 * strings and a guitar tuned slightly flat all just work.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FILES, RANKS, cents, midiToName } from "../audio/notes.js"
import { positionText } from "./fretboard.js"

const SAMPLES_PER_NOTE = 12
const ACCEPT_CENTS = 250 // measuring, not judging
const NOISE_SECONDS = 2
const DRILL_ROUNDS = 2

export class Onboarding extends EventTarget {
    constructor(root, mapper) {
        super()
        this.root = root
        this.mapper = mapper
        this.active = false
        this.step = "input"
        this.audioReady = false
        // The card is re-rendered on every frame; the neck below it is not, so
        // it lives outside and keeps its own Fretboard instance.
        this.root.innerHTML = `
            <div class="setup-shell">
                <div class="setup-card" data-role="card"></div>
                <div class="setup-neck" data-role="neck"></div>
            </div>`
        this.card = this.root.querySelector('[data-role="card"]')
        this.neck = this.root.querySelector('[data-role="neck"]')
    }

    start(step = "input") {
        this.active = true
        this.step = step
        this.slot = 0
        this.samples = []
        this.measured = {}
        this.noiseSamples = []
        this.noiseDone = false
        this.heardSomething = false
        this.drillRound = 0
        this.drillTarget = null
        this.drillEntered = []
        this.message = ""
        this.root.hidden = false
        document.body.classList.add("is-onboarding")
        if (step !== "input") this.audioReady = true
        this.render()
    }

    finish() {
        this.active = false
        this.root.hidden = true
        document.body.classList.remove("is-onboarding")
        this.emit("finished")
    }

    skip() {
        this.active = false
        this.root.hidden = true
        document.body.classList.remove("is-onboarding")
        this.emit("finished", { skipped: true })
    }

    /** Called by the app once getUserMedia has actually succeeded. */
    onAudioStarted(devices) {
        this.audioReady = true
        this.devices = devices
        this.noiseSamples = []
        this.noiseDone = false
        this.heardSomething = false
        this.render()
    }

    onAudioFailed(message) {
        this.audioReady = false
        this.message = message
        this.render()
    }

    // ------------------------------------------------------------- listening

    /** Raw frames: used for the noise floor and for measuring each note. */
    pushFrame(frame) {
        if (!this.active) return
        if (this.step === "input") return this.handleInputFrame(frame)
        if (this.step === "learn") return this.handleLearnFrame(frame)
    }

    /** Accepted notes: used by the drill, which wants the same path a game uses. */
    pushNote(match) {
        if (!this.active || this.step !== "drill") return
        if (this.mapper.isCancel(match.slot)) {
            this.drillEntered = []
            this.render()
            return
        }
        this.drillEntered.push(match.slot)
        if (this.drillEntered.length === 2) {
            const square = FILES[this.drillEntered[0]] + RANKS[this.drillEntered[1]]
            if (square === this.drillTarget) {
                this.drillRound++
                this.drillEntered = []
                if (this.drillRound >= DRILL_ROUNDS) {
                    this.step = "done"
                    this.render()
                    return
                }
                this.nextDrillTarget()
            } else {
                this.message = `That was ${square}. Try again.`
                this.drillEntered = []
            }
        }
        this.render()
    }

    handleInputFrame(frame) {
        if (!this.audioReady) return
        if (!this.noiseDone) {
            this.noiseSamples.push(frame.rms)
            // Frames arrive about every 23 ms.
            if (this.noiseSamples.length >= (NOISE_SECONDS * 1000) / 23) {
                const sorted = [...this.noiseSamples].sort((a, b) => a - b)
                const floor = sorted[Math.floor(sorted.length * 0.9)]
                // Four times the room's own noise, clamped to something sane.
                const gate = Math.min(0.05, Math.max(0.006, floor * 4))
                this.noiseDone = true
                this.emit("gate", { gate, floor })
            }
            this.render()
            return
        }
        if (!this.heardSomething && frame.frequency > 0 && frame.clarity > 0.9 && frame.rms > 0.02) {
            this.heardSomething = true
            this.render()
        }
    }

    handleLearnFrame(frame) {
        const { frequency, clarity, rms } = frame
        if (!frequency || clarity < 0.9 || rms < 0.015) return
        const expected = this.mapper.freqForSlot(this.slot)
        if (Math.abs(cents(frequency, expected)) > ACCEPT_CENTS) {
            this.message = `Heard ${frequency.toFixed(0)} Hz (${midiToName(this.mapper.describe(frequency).midi)}) — that is not the note.`
            this.render()
            return
        }
        this.message = ""
        this.samples.push(frequency)
        if (this.samples.length >= SAMPLES_PER_NOTE) {
            const sorted = [...this.samples].sort((a, b) => a - b)
            this.measured[this.slot] = sorted[Math.floor(sorted.length / 2)] // median: ignores the attack
            this.nextSlot()
            return
        }
        this.render()
    }

    nextSlot() {
        this.samples = []
        this.slot++
        if (this.slot >= this.mapper.slotCount) {
            this.emit("calibrated", { calibration: this.measured })
            this.step = "drill"
            this.nextDrillTarget()
        }
        this.render()
    }

    skipNote() {
        this.samples = []
        this.message = ""
        this.nextSlot()
    }

    nextDrillTarget() {
        let square
        do {
            square = FILES[Math.floor(Math.random() * 8)] + RANKS[Math.floor(Math.random() * 8)]
        } while (square === this.drillTarget)
        this.drillTarget = square
        this.drillEntered = []
        this.message = ""
    }

    // ---------------------------------------------------------------- render

    render() {
        if (!this.active) return
        const body =
            this.step === "input" ? this.renderInput()
                : this.step === "learn" ? this.renderLearn()
                    : this.step === "drill" ? this.renderDrill()
                        : this.renderDone()

        const stepIndex = { input: 1, learn: 2, drill: 3, done: 3 }[this.step]
        this.card.innerHTML = `
            <div class="setup-steps">
                ${[1, 2, 3].map((n) => `<span class="${n === stepIndex ? "is-current" : n < stepIndex ? "is-done" : ""}"></span>`).join("")}
            </div>
            ${body}`
        this.neck.hidden = this.step === "input"
        this.bind()

        // Point the neck diagram at whatever is being asked for right now.
        if (this.step === "learn") {
            this.emit("focus", { slots: [this.slot] })
        } else if (this.step === "drill" && this.drillTarget) {
            this.emit("focus", {
                slots: [FILES.indexOf(this.drillTarget[0]), RANKS.indexOf(this.drillTarget[1])]
            })
        } else {
            this.emit("focus", { slots: null })
        }
    }

    renderInput() {
        const options = (this.devices || [])
            .map((d, i) => `<option value="${d.deviceId}">${d.label || `Input ${i + 1}`}</option>`)
            .join("")

        if (!this.audioReady) {
            return `
                <h2>Play chess with your guitar</h2>
                <p class="setup-lead">
                    Every move is four notes: the <b>file</b> and <b>rank</b> of the piece you want to
                    move, then the <b>file</b> and <b>rank</b> of where it goes.
                </p>
                <p class="setup-note">
                    Works with a microphone, an audio interface or a guitar plugged straight into the
                    line input — the browser treats all three the same.
                </p>
                ${this.message ? `<p class="setup-error">${this.message}</p>` : ""}
                <button type="button" class="primary big" data-action="allow">Allow microphone</button>
                <button type="button" class="ghost" data-action="skip">Skip setup</button>`
        }

        if (!this.noiseDone) {
            const progress = Math.min(100, (this.noiseSamples.length / ((NOISE_SECONDS * 1000) / 23)) * 100)
            return `
                <h2>Listening to the room</h2>
                <p class="setup-lead">Stay quiet for a moment — measuring the background noise so the
                    app knows how loud a real note has to be.</p>
                <div class="progress"><div style="width:${progress.toFixed(0)}%"></div></div>`
        }

        return `
            <h2>Check your input</h2>
            <p class="setup-lead">Play any note on the guitar.</p>
            <div class="setup-check ${this.heardSomething ? "is-ok" : ""}">
                ${this.heardSomething ? "Heard you loud and clear." : "Waiting for a note…"}
            </div>
            ${options ? `<label class="setup-device">Input device<select data-action="device">${options}</select></label>` : ""}
            <button type="button" class="primary big" data-action="next" ${this.heardSomething ? "" : "disabled"}>Continue</button>
            <button type="button" class="ghost" data-action="skip">Skip setup</button>`
    }

    renderLearn() {
        const label = midiToName(this.mapper.midiForSlot(this.slot))
        const isCancel = this.mapper.isCancel(this.slot)
        const meaning = isCancel
            ? "cancels the move you are entering"
            : `file <b>${FILES[this.slot]}</b> and rank <b>${RANKS[this.slot]}</b>`
        const progress = (this.samples.length / SAMPLES_PER_NOTE) * 100
        return `
            <h2>Learning your guitar <small>${this.slot + 1} of ${this.mapper.slotCount}</small></h2>
            <p class="setup-lead">
                Play <b class="setup-note-name">${label}</b>
                <span class="setup-where">${positionText(this.mapper, this.slot)}</span>
            </p>
            <p class="setup-meaning">This note means ${meaning}.</p>
            <div class="progress"><div style="width:${progress.toFixed(0)}%"></div></div>
            <p class="setup-note">Let it ring, a few times. The app records the pitch your guitar
                actually produces, so tuning and string type stop mattering.</p>
            ${this.message ? `<p class="setup-error">${this.message}</p>` : ""}
            <button type="button" class="ghost" data-action="skip-note">Skip this note</button>
            <button type="button" class="ghost" data-action="skip">Skip setup</button>`
    }

    renderDrill() {
        const entered = this.drillEntered
            .map((slot, index) => (index === 0 ? FILES[slot] : RANKS[slot]))
            .join("")
        return `
            <h2>One quick try <small>${this.drillRound + 1} of ${DRILL_ROUNDS}</small></h2>
            <p class="setup-lead">Play the square <b class="setup-square">${this.drillTarget}</b></p>
            <p class="setup-meaning">
                Two notes: the file <b>${this.drillTarget[0]}</b>, then the rank <b>${this.drillTarget[1]}</b>.
                They are marked on the neck below.
            </p>
            <div class="setup-entry">
                <span class="${entered.length > 0 ? "filled" : ""}">${entered[0] ?? "·"}</span>
                <span class="${entered.length > 1 ? "filled" : ""}">${entered[1] ?? "·"}</span>
            </div>
            ${this.message ? `<p class="setup-error">${this.message}</p>` : ""}
            <button type="button" class="ghost" data-action="skip">Skip setup</button>`
    }

    renderDone() {
        return `
            <h2>Ready</h2>
            <p class="setup-lead">Four notes make a move: <b>from</b> file, <b>from</b> rank,
                <b>to</b> file, <b>to</b> rank.</p>
            <p class="setup-meaning">Played a wrong note? Play <b>${midiToName(this.mapper.cancelNote)}</b>
                — the top string, fret 7 — to clear the move. Four seconds of silence does the same.</p>
            <button type="button" class="primary big" data-action="play">Start playing</button>`
    }

    bind() {
        const on = (action, handler) => {
            const element = this.card.querySelector(`[data-action="${action}"]`)
            if (element) element.onclick = handler
        }
        on("allow", () => this.emit("requestAudio", { deviceId: null }))
        on("next", () => { this.step = "learn"; this.slot = 0; this.samples = []; this.render() })
        on("skip-note", () => this.skipNote())
        on("skip", () => this.skip())
        on("play", () => this.finish())
        const device = this.card.querySelector('[data-action="device"]')
        if (device) device.onchange = () => this.emit("requestAudio", { deviceId: device.value })
    }

    emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, { detail }))
    }
}
