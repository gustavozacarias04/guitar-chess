/**
 * FFT spectrum, drawn from an AnalyserNode.
 *
 * This is the debugging view, not the detector: the vertical guides show where
 * the nine target notes sit, so you can see at a glance whether the pitch you
 * are playing actually has energy where the app expects it - and whether the
 * harmonics are louder than the fundamental, which is the usual reason a low E
 * gets misheard.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MAX_DISPLAY_HZ = 1400

export class Spectrum {
    constructor(canvas, mapper) {
        this.canvas = canvas
        this.ctx = canvas.getContext("2d")
        this.mapper = mapper
        this.data = null
        this.detected = 0
        this.resize()
        window.addEventListener("resize", () => this.resize())
    }

    resize() {
        const ratio = window.devicePixelRatio || 1
        const rect = this.canvas.getBoundingClientRect()
        if (!rect.width) return
        this.canvas.width = Math.round(rect.width * ratio)
        this.canvas.height = Math.round(rect.height * ratio)
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
        this.width = rect.width
        this.height = rect.height
    }

    /** log scale: the low strings would be squeezed into 3 pixels otherwise */
    xFor(hz) {
        const min = Math.log2(60)
        const max = Math.log2(MAX_DISPLAY_HZ)
        return ((Math.log2(Math.max(hz, 60)) - min) / (max - min)) * this.width
    }

    setDetected(frequency) {
        this.detected = frequency
    }

    draw(bytes, binHz) {
        if (!this.width) this.resize()
        if (!this.width) return
        const ctx = this.ctx
        ctx.clearRect(0, 0, this.width, this.height)

        // Target guides
        for (let slot = 0; slot < this.mapper.slotCount; slot++) {
            const x = this.xFor(this.mapper.freqForSlot(slot))
            const isCancel = this.mapper.isCancel(slot)
            ctx.strokeStyle = isCancel ? "rgba(255,110,110,0.35)" : "rgba(120,190,255,0.28)"
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, this.height)
            ctx.stroke()
            ctx.fillStyle = isCancel ? "rgba(255,150,150,0.75)" : "rgba(150,205,255,0.7)"
            ctx.font = "9px ui-monospace, monospace"
            ctx.fillText(isCancel ? "x" : this.mapper.coordinateLabel(slot).slice(0, 1), x + 2, 9)
        }

        if (bytes && binHz) {
            ctx.beginPath()
            let started = false
            for (let i = 1; i < bytes.length; i++) {
                const hz = i * binHz
                if (hz > MAX_DISPLAY_HZ) break
                const x = this.xFor(hz)
                const y = this.height - (bytes[i] / 255) * this.height
                if (!started) { ctx.moveTo(x, y); started = true } else { ctx.lineTo(x, y) }
            }
            ctx.strokeStyle = "rgba(124,224,168,0.9)"
            ctx.lineWidth = 1.5
            ctx.stroke()
            ctx.lineTo(this.width, this.height)
            ctx.lineTo(0, this.height)
            ctx.closePath()
            ctx.fillStyle = "rgba(124,224,168,0.12)"
            ctx.fill()
        }

        if (this.detected > 0) {
            const x = this.xFor(this.detected)
            ctx.strokeStyle = "rgba(255,214,102,0.95)"
            ctx.lineWidth = 2
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, this.height)
            ctx.stroke()
        }
    }
}
