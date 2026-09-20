/**
 * The board, plus the visual feedback that tells you what the app has heard
 * so far: the file lights up after one note, the square after two, and the
 * legal destinations of that piece right after.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Chessboard, BORDER_TYPE, COLOR, FEN } from "../../vendor/cm-chessboard/src/Chessboard.js"
import { Markers, MARKER_TYPE } from "../../vendor/cm-chessboard/src/extensions/markers/Markers.js"
import { RANKS } from "../audio/notes.js"

export class BoardUI {
    constructor(element) {
        this.board = new Chessboard(element, {
            position: FEN.start,
            assetsUrl: new URL("../../vendor/cm-chessboard/assets/", import.meta.url).href,
            style: {
                cssClass: "default",
                borderType: BORDER_TYPE.frame,
                showCoordinates: true,
                animationDuration: 260
            },
            extensions: [{ class: Markers, props: { autoMarkers: null } }]
        })
        this.markers = this.board.getExtension(Markers)
    }

    /**
     * Every addMarker/removeMarker redraws the whole marker layer, so lighting
     * up a file one square at a time means eight full redraws. Group them.
     */
    batch(work) {
        this.markers.batchUpdate = true
        try {
            work()
        } finally {
            this.markers.batchUpdate = false
            this.markers.onRedrawBoard()
        }
    }

    /**
     * Animations are driven by requestAnimationFrame, which browsers pause in
     * a hidden tab - awaiting one there would hang the game until you came
     * back. Switch to an instant update instead.
     */
    setPosition(fen, animated = true) {
        return this.board.setPosition(fen, animated && !document.hidden)
    }

    setOrientation(color) {
        return this.board.setOrientation(color === "b" ? COLOR.black : COLOR.white)
    }

    clearHints() {
        this.batch(() => {
            this.board.removeMarkers(MARKER_TYPE.square)
            this.board.removeMarkers(MARKER_TYPE.framePrimary)
            this.board.removeMarkers(MARKER_TYPE.dot)
        })
    }

    clearAll() {
        this.batch(() => {
            this.board.removeMarkers()
        })
    }

    /** After the first note of a pair: the whole file is still in play. */
    highlightFile(file) {
        this.batch(() => {
            this.board.removeMarkers(MARKER_TYPE.square)
            this.board.removeMarkers(MARKER_TYPE.framePrimary)
            this.board.removeMarkers(MARKER_TYPE.dot)
            if (!file) return
            for (const rank of RANKS) this.board.addMarker(MARKER_TYPE.square, file + rank)
        })
    }

    /** After the second note: the origin square and everything it can reach. */
    highlightOrigin(square, destinations = []) {
        this.batch(() => {
            this.board.removeMarkers(MARKER_TYPE.square)
            this.board.removeMarkers(MARKER_TYPE.framePrimary)
            this.board.removeMarkers(MARKER_TYPE.dot)
            if (!square) return
            this.board.addMarker(MARKER_TYPE.framePrimary, square)
            for (const to of destinations) this.board.addMarker(MARKER_TYPE.dot, to)
        })
    }

    showLastMove(from, to) {
        this.batch(() => {
            this.board.removeMarkers(MARKER_TYPE.frame)
            if (!from) return
            this.board.addMarker(MARKER_TYPE.frame, from)
            this.board.addMarker(MARKER_TYPE.frame, to)
        })
    }

    showCheck(square) {
        this.batch(() => {
            this.board.removeMarkers(MARKER_TYPE.frameDanger)
            if (square) this.board.addMarker(MARKER_TYPE.frameDanger, square)
        })
    }
}
