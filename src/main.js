/**
 * Guitar Chess - play chess by playing your guitar.
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
import { Fretboard } from "./ui/fretboard.js"
import { Onboarding } from "./ui/onboarding.js"
import { EvalBar, CapturedPieces } from "./ui/game-meta.js"

const STORAGE_KEY = "guitar-chess:settings"

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
const fretboard = new Fretboard($("#fretboard"), mapper)
const evalBar = new EvalBar($("#eval"))
const captured = new CapturedPieces($("#captured-top"), $("#captured-bottom"))
const onboarding = new Onboarding($("#onboarding"), mapper)
const setupFretboard = new Fretboard(onboarding.neck, mapper)

let humanColor = settings.humanColor ?? "w"
let engineThinking = false
let spectrumBytes = null

// ---------------------------------------------------------------- audio flow

audio.addEventListener("frame", (event) => {
    const frame = event.detail
    spectrum.setDetected(frame.frequency)
    detector.push(frame)
    onboarding.pushFrame(frame)
})

detector.addEventListener("frame", (event) => tuner.update(event.detail))

detector.addEventListener("note", (event) => {
    const match = event.detail
    fretboard.flash(match.slot)
    setupFretboard.flash(match.slot)

    if (onboarding.active) {
        onboarding.pushNote(match)
        return
    }
    if (game.isOver) return
    if (engineThinking || game.turn !== humanColor) {
        setStatus("Wait for the engine to move.", "warn")
        return
    }
    builder.feed(match.slot, mapper)
})

// ------------------------------------------------------------- move building

builder.addEventListener("update", (event) => {
    const { origin, pendingFile, step } = event.detail
    renderEntry(event.detail)
    if (step === 0) {
        board.clearHints()
        fretboard.focus(null)
        setStatus(promptFor(0))
    } else if (step === 1 || step === 3) {
        board.highlightFile(pendingFile)
        // Only rank notes can come next, so dim the rest of the neck.
        fretboard.focus(RANKS.map((_, index) => index))
        setStatus(promptFor(step))
    } else if (step === 2) {
        const destinations = game.legalMovesFrom(origin).map((move) => move.to)
        board.highlightOrigin(origin, destinations)
        // Only the files that a legal destination lives on are worth playing.
        fretboard.focus([...new Set(destinations.map((square) => FILES.indexOf(square[0])))])
        setStatus(`${origin} selected — ${promptFor(2)}`)
    }
})

builder.addEventListener("rejected", (event) => {
    setStatus(event.detail.reason, "error")
    if (!event.detail.keepOrigin) {
        board.clearHints()
        fretboard.focus(null)
    }
})

builder.addEventListener("cleared", (event) => {
    if (event.detail.reason === "cancel note") setStatus("Move cleared.", "warn")
    else if (event.detail.reason === "timeout") setStatus("Timed out — move cleared.", "warn")
    board.clearHints()
    fretboard.focus(null)
})

builder.addEventListener("move", async (event) => {
    const { from, to } = event.detail
    const move = game.move(from, to, $("#promotion").value || "q")
    if (!move) {
        setStatus(`${from}${to} was refused by the rules.`, "error")
        return
    }
    afterMove(move)
    if (!game.isOver) await playEngineMove()
})

// --------------------------------------------------------------- engine flow

engine.addEventListener("info", (event) => evalBar.set(event.detail, game.turn))

async function playEngineMove() {
    if (game.isOver || game.turn === humanColor) return
    engineThinking = true
    setStatus("Engine is thinking…", "engine")
    try {
        await engine.init()
        const best = await engine.bestMove(game.fen)
        if (!best) return
        const move = game.move(best.from, best.to, best.promotion ?? "q")
        if (move) afterMove(move)
    } catch (error) {
        setStatus(`Engine unavailable: ${error.message}`, "error")
    } finally {
        engineThinking = false
        if (!game.isOver) setStatus(promptFor(0))
    }
}

/**
 * The board redraw is deliberately NOT awaited. cm-chessboard resolves its
 * position promise from a requestAnimationFrame callback, and browsers pause
 * rAF in a hidden tab - awaiting it would freeze the game the moment you
 * switched away mid-move. cm-chessboard keeps the redraws in order itself.
 */
function afterMove(move) {
    board.setPosition(game.fen, true)
    board.showLastMove(move.from, move.to)
    board.showCheck(game.inCheck ? findKing(game.turn) : null)
    captured.update(game.fen, humanColor)
    renderHistory()
    if (game.isOver) {
        setStatus(game.outcome, "over")
        builder.clear()
        fretboard.focus(null)
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

const PIECE_NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }

function promptFor(step) {
    if (game.isOver) return game.outcome
    if (step === 0) return "Play the FILE of the piece you want to move."
    if (step === 1) return "Play the RANK of that piece."
    if (step === 2) {
        const piece = game.pieceAt(builder.origin)
        return piece ? `play the FILE of where the ${PIECE_NAMES[piece.type]} goes.` : "play the FILE of the destination."
    }
    return "Play the RANK of the destination."
}

function renderEntry({ slots }) {
    const cells = $("#pending").querySelectorAll(".slot")
    cells.forEach((cell, index) => {
        const filled = index < slots.length
        cell.querySelector("b").textContent = filled
            ? (index % 2 === 0 ? FILES[slots[index]] : RANKS[slots[index]])
            : "·"
        cell.classList.toggle("filled", filled)
        cell.classList.toggle("is-next", index === slots.length && !game.isOver)
    })
}

function renderHistory() {
    const moves = game.history()
    const rows = []
    for (let i = 0; i < moves.length; i += 2) {
        rows.push(`<li><b>${i / 2 + 1}.</b><span>${moves[i].san}</span><span>${moves[i + 1]?.san ?? ""}</span></li>`)
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

// ------------------------------------------------------------------- audio io

async function startAudio(deviceId) {
    if (!AudioEngine.supported) {
        throw new Error("this browser has no AudioWorklet or getUserMedia")
    }
    await audio.start(deviceId || undefined)
    detector.reset()
    saveSettings({ deviceId: deviceId || null })
    await refreshDevices()
    $("#listen").textContent = "Stop listening"
    $("#listen").classList.add("is-live")
    engine.init().catch(() => {})
    return audio.listInputDevices()
}

async function refreshDevices() {
    const select = $("#device")
    const devices = await audio.listInputDevices()
    select.innerHTML = devices.length
        ? devices.map((d, i) => `<option value="${d.deviceId}">${d.label || `Input ${i + 1}`}</option>`).join("")
        : '<option value="">(allow access to list inputs)</option>'
    if (settings.deviceId && devices.some((d) => d.deviceId === settings.deviceId)) {
        select.value = settings.deviceId
    }
    return devices
}

// ---------------------------------------------------------------- onboarding

onboarding.addEventListener("requestAudio", async (event) => {
    try {
        const devices = await startAudio(event.detail.deviceId)
        onboarding.onAudioStarted(devices)
    } catch (error) {
        onboarding.onAudioFailed(`Could not open the audio input: ${error.message}`)
    }
})

onboarding.addEventListener("gate", (event) => {
    // Measured from the room itself, so nobody has to touch a slider.
    detector.setOptions({ rmsGate: event.detail.gate })
    $("#gate").value = String(event.detail.gate)
    $("#gate-value").textContent = event.detail.gate.toFixed(3)
    saveSettings({ rmsGate: event.detail.gate })
})

onboarding.addEventListener("calibrated", (event) => {
    mapper.calibration = { ...mapper.calibration, ...event.detail.calibration }
    saveSettings({ calibration: mapper.calibration })
    fretboard.refresh()
    setupFretboard.refresh()
})

onboarding.addEventListener("focus", (event) => setupFretboard.focus(event.detail.slots))

onboarding.addEventListener("finished", () => {
    saveSettings({ onboarded: true })
    setStatus(audio.running ? promptFor(0) : "Open Setup when you are ready to play.")
    renderEntry({ slots: [] })
})

// ------------------------------------------------------------------ controls

$("#level").innerHTML = LEVELS.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")
$("#level").value = settings.level ?? "club"
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
$("#gate-value").textContent = Number($("#gate").value).toFixed(3)
$("#gate").addEventListener("input", () => {
    const value = Number($("#gate").value)
    detector.setOptions({ rmsGate: value })
    $("#gate-value").textContent = value.toFixed(3)
    saveSettings({ rmsGate: value })
})

$("#tolerance").value = String(mapper.tolerance)
$("#tolerance-value").textContent = `${mapper.tolerance} ct`
$("#tolerance").addEventListener("input", () => {
    mapper.tolerance = Number($("#tolerance").value)
    $("#tolerance-value").textContent = `${mapper.tolerance} ct`
    saveSettings({ tolerance: mapper.tolerance })
})

$("#device").addEventListener("change", async () => {
    try {
        await startAudio($("#device").value)
    } catch (error) {
        setStatus(`Could not open the audio input: ${error.message}`, "error")
    }
})

$("#listen").addEventListener("click", async () => {
    if (audio.running) {
        await audio.stop()
        $("#listen").textContent = "Start listening"
        $("#listen").classList.remove("is-live")
        setStatus("Microphone stopped.")
        return
    }
    try {
        await startAudio($("#device").value)
        setStatus(promptFor(0))
    } catch (error) {
        setStatus(`Could not open the audio input: ${error.message}`, "error")
    }
})

$("#setup").addEventListener("click", () => onboarding.start(audio.running ? "learn" : "input"))

$("#reset-calibration").addEventListener("click", () => {
    mapper.calibration = {}
    saveSettings({ calibration: {} })
    fretboard.refresh()
    setupFretboard.refresh()
    setStatus("Calibration cleared — back to the theoretical frequencies.", "ok")
})

$("#new-game").addEventListener("click", () => newGame())

$("#undo").addEventListener("click", () => {
    if (engineThinking) return
    game.undo() // the engine reply
    game.undo() // and your move
    builder.clear()
    board.setPosition(game.fen, true)
    board.clearAll()
    captured.update(game.fen, humanColor)
    renderHistory()
    fretboard.focus(null)
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
    evalBar.set(null)
    evalBar.setOrientation(humanColor)
    captured.update(game.fen, humanColor)
    renderHistory()
    fretboard.focus(null)
    setStatus(promptFor(0))
    if (game.turn !== humanColor) await playEngineMove()
}

// ------------------------------------------------------------- stage mode

function setStage(on) {
    document.body.classList.toggle("is-stage", on)
    $("#stage-exit").hidden = !on
    if (on && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {})
    } else if (!on && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
    }
}
$("#stage").addEventListener("click", () => setStage(true))
$("#stage-exit").addEventListener("click", () => setStage(false))
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("is-stage")) setStage(false)
})

/**
 * Type a move like "e2e4". Mostly for testing without an instrument, but it
 * also rescues a demo when a string breaks - it goes through the same move
 * builder the notes do.
 */
$("#manual-move").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return
    const text = event.target.value.trim().toLowerCase()
    event.target.value = ""
    if (!/^[a-h][1-8][a-h][1-8]$/.test(text)) {
        setStatus("Type a move like 'e2e4'.", "warn")
        return
    }
    for (const character of text) {
        builder.feed(/[a-h]/.test(character) ? FILES.indexOf(character) : RANKS.indexOf(character), mapper)
    }
})

// Exposed on purpose: with an audio app, being able to poke at the detector
// and the mapper from the browser console is half the debugging story.
window.guitarChess = { game, mapper, detector, builder, audio, engine, board, onboarding, fretboard }

// ------------------------------------------------------------------- startup

board.setOrientation(humanColor)
evalBar.setOrientation(humanColor)
captured.update(game.fen, humanColor)
renderEntry({ slots: [] })
renderHistory()
refreshDevices()
if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices)
}

if (settings.onboarded) {
    setStatus("Press Setup, or start listening from the Advanced panel.")
    $("#listen").textContent = "Start listening"
    // Returning players already granted permission, so this rarely prompts.
    startAudio(settings.deviceId).then(() => setStatus(promptFor(0))).catch(() => {})
} else {
    onboarding.start("input")
}

if (humanColor === "b") newGame()
