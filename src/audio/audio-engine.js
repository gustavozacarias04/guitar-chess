/**
 * Microphone / line-in capture and the audio graph.
 *
 * A USB interface, a guitar-to-jack cable or a plain laptop mic are all just
 * input devices to getUserMedia - same code path for all three. The browser's
 * "voice" processing is switched off explicitly, because echo cancellation and
 * noise suppression are actively hostile to pitch detection.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const WORKLET_URL = new URL("./pitch-processor.js", import.meta.url)

export class AudioEngine extends EventTarget {
    constructor() {
        super()
        this.context = null
        this.stream = null
        this.worklet = null
        this.analyser = null
        this.running = false
        this.inputGain = 1
    }

    static get supported() {
        return !!(navigator.mediaDevices?.getUserMedia && window.AudioContext && window.AudioWorkletNode)
    }

    /**
     * Device labels are blank until permission has been granted at least once,
     * so this is worth calling again after start().
     */
    async listInputDevices() {
        if (!navigator.mediaDevices?.enumerateDevices) return []
        const devices = await navigator.mediaDevices.enumerateDevices()
        return devices.filter((d) => d.kind === "audioinput")
    }

    async start(deviceId) {
        await this.stop()

        this.stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                channelCount: 1
            },
            video: false
        })

        this.context = new AudioContext({ latencyHint: "interactive" })
        await this.context.audioWorklet.addModule(WORKLET_URL)
        if (this.context.state === "suspended") await this.context.resume()

        const source = this.context.createMediaStreamSource(this.stream)

        // Rumble, handling noise and mains hum live below the lowest note (82 Hz).
        const highpass = this.context.createBiquadFilter()
        highpass.type = "highpass"
        highpass.frequency.value = 60
        highpass.Q.value = 0.707

        // Anti-aliasing for the 2x decimation in the worklet, and it happens to
        // clean up pick attack and fret noise that confuse the NSDF.
        const lowpass = this.context.createBiquadFilter()
        lowpass.type = "lowpass"
        lowpass.frequency.value = 2000
        lowpass.Q.value = 0.707
        const lowpass2 = this.context.createBiquadFilter()
        lowpass2.type = "lowpass"
        lowpass2.frequency.value = 2000
        lowpass2.Q.value = 0.707

        this.gain = this.context.createGain()
        this.gain.gain.value = this.inputGain

        this.analyser = this.context.createAnalyser()
        this.analyser.fftSize = 4096
        this.analyser.smoothingTimeConstant = 0.6
        this.analyser.minDecibels = -100
        this.analyser.maxDecibels = -20

        this.worklet = new AudioWorkletNode(this.context, "pitch-processor", {
            numberOfInputs: 1,
            numberOfOutputs: 0
        })
        this.worklet.port.onmessage = (event) => {
            this.dispatchEvent(new CustomEvent("frame", { detail: event.data }))
        }

        source.connect(highpass)
        highpass.connect(this.gain)
        this.gain.connect(lowpass)
        lowpass.connect(lowpass2)
        lowpass2.connect(this.worklet)
        this.gain.connect(this.analyser) // spectrum shows the unfiltered-ish signal

        // A node with no outputs is a sink, but some browsers only pull a graph
        // that reaches the destination. A muted tap guarantees it runs, and
        // being muted it cannot feed back into the microphone.
        const silent = this.context.createGain()
        silent.gain.value = 0
        this.analyser.connect(silent)
        silent.connect(this.context.destination)

        this.running = true
        this.dispatchEvent(new CustomEvent("started", { detail: { sampleRate: this.context.sampleRate } }))
        return this.context.sampleRate
    }

    setInputGain(value) {
        this.inputGain = value
        if (this.gain) this.gain.gain.value = value
    }

    /** Copy of the current magnitude spectrum, for the visualiser. */
    readSpectrum(target) {
        if (!this.analyser) return null
        this.analyser.getByteFrequencyData(target)
        return target
    }

    get binHz() {
        return this.context ? this.context.sampleRate / this.analyser.fftSize : 0
    }

    async stop() {
        this.running = false
        if (this.worklet) {
            this.worklet.port.onmessage = null
            this.worklet.disconnect()
            this.worklet = null
        }
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop())
            this.stream = null
        }
        if (this.context) {
            await this.context.close().catch(() => {})
            this.context = null
        }
        this.analyser = null
        this.dispatchEvent(new CustomEvent("stopped"))
    }
}
