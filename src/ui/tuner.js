/**
 * Live pitch readout. Not decoration: when a note fails to register this is
 * the only way to see whether it was too quiet, out of tune, or landing on a
 * pitch that is not in the set at all.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export class Tuner {
    constructor(root, mapper) {
        this.mapper = mapper
        this.root = root
        root.innerHTML = `
            <div class="tuner">
                <div class="tuner-note"><span data-role="note">--</span><small data-role="slot"></small></div>
                <div class="tuner-meter">
                    <div class="tuner-scale"><span></span><span></span><span class="center"></span><span></span><span></span></div>
                    <div class="tuner-needle" data-role="needle"></div>
                </div>
                <div class="tuner-readout">
                    <span data-role="hz">-- Hz</span>
                    <span data-role="cents">-- ct</span>
                    <span data-role="clarity">clareza --</span>
                </div>
                <div class="level-bar"><div data-role="level"></div></div>
            </div>`
        this.els = {
            note: root.querySelector('[data-role="note"]'),
            slot: root.querySelector('[data-role="slot"]'),
            needle: root.querySelector('[data-role="needle"]'),
            hz: root.querySelector('[data-role="hz"]'),
            cents: root.querySelector('[data-role="cents"]'),
            clarity: root.querySelector('[data-role="clarity"]'),
            level: root.querySelector('[data-role="level"]')
        }
    }

    update(frame) {
        const { frequency, clarity, rms, match, gate } = frame
        const level = Math.min(1, Math.sqrt(rms ?? 0) * 3.2)
        this.els.level.style.width = `${(level * 100).toFixed(1)}%`
        this.els.level.classList.toggle("is-gated", !gate)

        const described = frequency > 0 ? this.mapper.describe(frequency) : null
        if (!described || !gate) {
            this.els.note.textContent = "--"
            this.els.slot.textContent = ""
            this.els.hz.textContent = "-- Hz"
            this.els.cents.textContent = "-- ct"
            this.els.clarity.textContent = `clareza ${clarity ? clarity.toFixed(2) : "--"}`
            this.els.needle.style.left = "50%"
            this.root.classList.remove("is-mapped")
            return
        }

        this.els.note.textContent = described.name
        this.els.hz.textContent = `${frequency.toFixed(1)} Hz`
        this.els.cents.textContent = `${described.cents >= 0 ? "+" : ""}${described.cents.toFixed(0)} ct`
        this.els.clarity.textContent = `clareza ${clarity.toFixed(2)}`
        // The needle shows tuning against the nearest chromatic note, clamped to +/-50 ct.
        const position = 50 + Math.max(-50, Math.min(50, described.cents))
        this.els.needle.style.left = `${position}%`

        if (match) {
            this.els.slot.textContent = this.mapper.isCancel(match.slot) ? "cancelar" : this.mapper.coordinateLabel(match.slot)
            this.root.classList.add("is-mapped")
        } else {
            this.els.slot.textContent = "fora do conjunto"
            this.root.classList.remove("is-mapped")
        }
    }
}
