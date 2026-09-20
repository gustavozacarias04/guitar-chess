/**
 * Fretboard Chess - play chess by playing your guitar.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NoteMapper, FILES, RANKS } from "./audio/notes.js"
import { AudioEngine } from "./audio/audio-engine.js"
import { NoteDetector, DEFAULT_DETECTOR_OPTIONS } from "./audio/note-detector.js"
import { Game } from "./game/game.js"
import { MoveBuilder } from "./game/move-builder.js"
import { StockfishEngine, LEVELS } from "./game/engine-stockfish.js"
import { BoardUI } from "./ui/board-ui.js"
import { Tuner } from "./ui/tuner.js"
import { Spectrum } from "./ui/spectrum.js"
import { NoteLegend } from "./ui/note-legend.js"
import { Calibration } from "./ui/calibration.js"

const STORAGE_KEY = "fretboard-chess:settings"

const $ = (selector) => document.querySelector(selector)

const settings = loadSettings()

const mapper = new NoteMapper({
    calibration: settings.calibration ?? {},
    tolerance: settings.tolerance ?? 100,
    a4: settings.a4 ?? 440
})
const game = new Game()
const audio = new AudioEngine()
const detector = new NoteDetector(mapper, {
    rmsGate: settings.rmsGate ?? DEFAULT_DETECTOR_OPTIONS.rmsGate,
    stableFrames: settings.stableFrames ?? DEFAULT_DETECTOR_OPTIONS.stableFrames
})
const builder = new MoveBuilder(game)
const engine = new StockfishEngine()

const board = new BoardUI($("#board"))
const tuner = new Tuner($("#tuner"), mapper)
const spectrum = new Spectrum($("#spectrum"), mapper)
const legend = new NoteLegend($("#legend"), mapper)
const calibration = new Calibration($("#calibration"), mapper)

let humanColor = settings.humanColor ?? "w"
let engineThinking = false
let spectrumBytes = null

// ---------------------------------------------------------------- audio flow

audio.addEventListener("frame", (event) => {
    const frame = event.detail
    spectrum.setDetected(frame.frequency)
    detector.push(frame)
    calibration.pushFrame(frame)
})

detector.addEventListener("frame", (event) => tuner.update(event.detail))

detector.addEventListener("note", (event) => {
    const match = event.detail
    legend.flash(match.slot)
    if (calibration.active) return
    if (game.isOver) return
    if (engineThinking || game.turn !== humanColor) {
        setStatus("Espera pela jogada do motor.", "warn")
        return
    }
    builder.feed(match.slot, mapper)
})

// ------------------------------------------------------------- move building

builder.addEventListener("update", (event) => {
    const { origin, pendingFile, step } = event.detail
    renderPending(event.detail)
    if (step === 0) {
        board.clearHints()
        setStatus(promptFor(0))
    } else if (step === 1 || step === 3) {
        board.highlightFile(pendingFile)
        setStatus(promptFor(step))
    } else if (step === 2) {
        const destinations = game.legalMovesFrom(origin).map((move) => move.to)
        board.highlightOrigin(origin, destinations)
        setStatus(origin + " selecionada — " + promptFor(2))
    }
})

builder.addEventListener("rejected", (event) => {
    setStatus(event.detail.reason, "error")
    if (!event.detail.keepOrigin) board.clearHints()
})

builder.addEventListener("cleared", (event) => {
    if (event.detail.reason === "cancel note") setStatus("Jogada cancelada.", "warn")
    else if (event.detail.reason === "timeout") setStatus("Tempo esgotado — jogada limpa.", "warn")
    board.clearHints()
})

builder.addEventListener("move", async (event) => {
    const { from, to } = event.detail
    const promotion = $("#promotion").value || "q"
    const move = game.move(from, to, promotion)
    if (!move) {
        setStatus(from + to + " foi recusada pelas regras.", "error")
        return
    }
    afterMove(move)
    if (!game.isOver) await playEngineMove()
})

// --------------------------------------------------------------- engine flow

async function playEngineMove() {
    if (game.isOver || game.turn === humanColor) return
    engineThinking = true
    setStatus("O motor está a pensar...", "engine")
    try {
        await engine.init()
        const best = await engine.bestMove(game.fen)
        if (!best) return
        const move = game.move(best.from, best.to, best.promotion ?? "q")
        if (move) afterMove(move)
    } catch (error) {
        setStatus("Motor indisponível: " + error.message, "error")
    } finally {
        engineThinking = false
        if (!game.isOver) setStatus(promptFor(0))
    }
}

/**
 * The board redraw is deliberately NOT awaited. cm-chessboard resolves its
 * position promise from a requestAnimationFrame callback, and browsers pause
 * rAF in a hidden tab - awaiting it would freeze the game the moment you
 * switched away mid-move. The queue inside cm-chessboard keeps the redraws in
 * order on its own.
 */
function afterMove(move) {
    board.setPosition(game.fen, true)
    board.showLastMove(move.from, move.to)
    board.showCheck(game.inCheck ? findKing(game.turn) : null)
    renderHistory()
    if (game.isOver) {
        setStatus(game.outcome, "over")
        builder.clear()
    }
}

function findKing(color) {
    for (const file of FILES) {
        for (const rank of RANKS) {
            const piece = game.pieceAt(file + rank)
            if (piece && piece.type === "k" && piece.color === color) return file + rank
        }
    }
    return null
}

// ------------------------------------------------------------------------ ui

function promptFor(step) {
    if (game.isOver) return game.outcome
    if (step === 0) return "Toca a nota da COLUNA da peça que queres mover."
    if (step === 1) return "Toca a nota da LINHA da peça que queres mover."
    if (step === 2) return "toca a nota da COLUNA do destino."
    return "Toca a nota da LINHA do destino."
}

function renderPending({ slots }) {
    const cells = $("#pending").children
    for (let i = 0; i < 4; i++) {
        const filled = i < slots.length
        cells[i].textContent = filled ? (i % 2 === 0 ? FILES[slots[i]] : RANKS[slots[i]]) : "·"
        cells[i].classList.toggle("filled", filled)
    }
}

function renderHistory() {
    const moves = game.history()
    const rows = []
    for (let i = 0; i < moves.length; i += 2) {
        const white = moves[i].san
        const black = moves[i + 1] ? moves[i + 1].san : ""
        rows.push("<li><b>" + (i / 2 + 1) + ".</b><span>" + white + "</span><span>" + black + "</span></li>")
    }
    const list = $("#history")
    list.innerHTML = rows.join("")
    list.scrollTop = list.scrollHeight
}

function setStatus(text, kind = "info") {
    const element = $("#status")
    element.textContent = text
    element.dataset.kind = kind
}

function renderSpectrum() {
    if (audio.running && audio.analyser) {
        if (!spectrumBytes || spectrumBytes.length !== audio.analyser.frequencyBinCount) {
            spectrumBytes = new Uint8Array(audio.analyser.frequencyBinCount)
        }
        audio.readSpectrum(spectrumBytes)
        spectrum.draw(spectrumBytes, audio.binHz)
    }
    requestAnimationFrame(renderSpectrum)
}
requestAnimationFrame(renderSpectrum)

// ------------------------------------------------------------------ settings

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
    } catch {
        return {}
    }
}

function saveSettings(patch) {
    const merged = { ...loadSettings(), ...patch }
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    } catch {
        /* private mode - not worth breaking the game over */
    }
}

// ------------------------------------------------------------------ controls

async function refreshDevices() {
    const select = $("#device")
    const devices = await audio.listInputDevices()
    select.innerHTML = devices.length
        ? devices.map((d, i) => '<option value="' + d.deviceId + '">' + (d.label || "Entrada " + (i + 1)) + "</option>").join("")
        : '<option value="">(permite o acesso para ver as entradas)</option>'
    if (settings.deviceId && devices.some((d) => d.deviceId === settings.deviceId)) {
        select.value = settings.deviceId
    }
}

$("#listen").addEventListener("click", async () => {
    const button = $("#listen")
    if (audio.running) {
        await audio.stop()
        button.textContent = "Ouvir"
        button.classList.remove("is-live")
        setStatus("Microfone parado.")
        return
    }
    if (!AudioEngine.supported) {
        setStatus("Este browser não suporta AudioWorklet/getUserMedia.", "error")
        return
    }
    try {
        button.disabled = true
        await audio.start($("#device").value || undefined)
        saveSettings({ deviceId: $("#device").value })
        await refreshDevices()
        detector.reset()
        button.textContent = "Parar"
        button.classList.add("is-live")
        setStatus(promptFor(0))
        engine.init().catch(() => {})
    } catch (error) {
        setStatus("Não consegui abrir a entrada de áudio: " + error.message, "error")
    } finally {
        button.disabled = false
    }
})

$("#device").addEventListener("change", async () => {
    saveSettings({ deviceId: $("#device").value })
    if (audio.running) {
        await audio.start($("#device").value || undefined)
        detector.reset()
    }
})

$("#level").innerHTML = LEVELS.map((l) => '<option value="' + l.id + '">' + l.label + "</option>").join("")
$("#level").value = settings.level ?? "medio"
engine.setLevel($("#level").value)
$("#level").addEventListener("change", () => {
    engine.setLevel($("#level").value)
    saveSettings({ level: $("#level").value })
})

$("#side").value = humanColor
$("#side").addEventListener("change", async () => {
    humanColor = $("#side").value
    saveSettings({ humanColor })
    await newGame()
})

$("#gate").value = String(detector.options.rmsGate)
$("#gate").addEventListener("input", () => {
    const value = Number($("#gate").value)
    detector.setOptions({ rmsGate: value })
    $("#gate-value").textContent = value.toFixed(3)
    saveSettings({ rmsGate: value })
})
$("#gate-value").textContent = Number($("#gate").value).toFixed(3)

$("#tolerance").value = String(mapper.tolerance)
$("#tolerance").addEventListener("input", () => {
    mapper.tolerance = Number($("#tolerance").value)
    $("#tolerance-value").textContent = mapper.tolerance + " ct"
    saveSettings({ tolerance: mapper.tolerance })
})
$("#tolerance-value").textContent = mapper.tolerance + " ct"

$("#calibrate").addEventListener("click", () => {
    if (!audio.running) {
        setStatus("Liga o microfone antes de calibrar.", "warn")
        return
    }
    calibration.start()
})

calibration.addEventListener("done", (event) => {
    mapper.calibration = { ...mapper.calibration, ...event.detail.calibration }
    saveSettings({ calibration: mapper.calibration })
    legend.render()
    setStatus("Calibração guardada.", "ok")
})

calibration.addEventListener("cancelled", () => setStatus("Calibração cancelada.", "warn"))

$("#reset-calibration").addEventListener("click", () => {
    mapper.calibration = {}
    saveSettings({ calibration: {} })
    legend.render()
    setStatus("Calibração apagada — a usar as frequências teóricas.", "ok")
})

$("#new-game").addEventListener("click", () => newGame())

$("#undo").addEventListener("click", async () => {
    if (engineThinking) return
    game.undo() // the engine reply
    game.undo() // and your move
    builder.clear()
    board.setPosition(game.fen, true)
    board.clearAll()
    renderHistory()
    setStatus(promptFor(0))
})

$("#clear-move").addEventListener("click", () => builder.clear("manual"))

async function newGame() {
    game.reset()
    builder.clear()
    engine.newGame()
    board.setPosition(game.fen, false)
    board.setOrientation(humanColor)
    board.clearAll()
    renderHistory()
    setStatus(promptFor(0))
    if (game.turn !== humanColor) await playEngineMove()
}

// Keyboard fallback: type a move like "e2e4". Useful for testing the board and
// the engine without an instrument plugged in, and it goes through exactly the
// same move builder as the notes do.
$("#manual-move").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return
    const text = event.target.value.trim().toLowerCase()
    event.target.value = ""
    if (!/^[a-h][1-8][a-h][1-8]$/.test(text)) {
        setStatus("Escreve a jogada como 'e2e4'.", "warn")
        return
    }
    for (const character of text) {
        const slot = /[a-h]/.test(character) ? FILES.indexOf(character) : RANKS.indexOf(character)
        builder.feed(slot, mapper)
    }
})

// Exposed on purpose: with an audio app, being able to poke at the detector
// and the mapper from the browser console is half the debugging story.
window.fretboardChess = { game, mapper, detector, builder, audio, engine, board, calibration }

board.setOrientation(humanColor)
renderPending({ slots: [] })
setStatus("Carrega em Ouvir e toca a primeira nota.")
refreshDevices()
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices)
}
if (humanColor === "b") newGame()
