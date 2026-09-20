/**
 * The furniture a chess player expects around a board: an evaluation bar and
 * the captured pieces with a material count.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
const PIECE_GLYPHS = {
    w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" },
    b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" }
}
const STARTING_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }

export class EvalBar {
    constructor(root) {
        this.root = root
        this.root.innerHTML = `
            <div class="eval-bar" role="img" aria-label="engine evaluation">
                <div class="eval-black"></div>
                <div class="eval-white" data-role="white"></div>
                <span class="eval-score" data-role="score">0.0</span>
            </div>`
        this.white = root.querySelector('[data-role="white"]')
        this.score = root.querySelector('[data-role="score"]')
        this.set(null)
    }

    /**
     * Stockfish reports the score from the side to move, so it has to be
     * flipped on black's turn before it means anything on a fixed bar.
     */
    set(info, sideToMove = "w") {
        if (!info) {
            this.white.style.height = "50%"
            this.score.textContent = "0.0"
            this.score.classList.remove("is-mate")
            return
        }
        const sign = sideToMove === "w" ? 1 : -1
        if (info.mate !== null && info.mate !== undefined) {
            const mate = info.mate * sign
            this.white.style.height = mate > 0 ? "100%" : "0%"
            this.score.textContent = `M${Math.abs(info.mate)}`
            this.score.classList.add("is-mate")
            return
        }
        if (info.cp === null || info.cp === undefined) return
        const pawns = (info.cp * sign) / 100
        // A logistic squash: the bar should move a lot around equality and
        // barely at all once someone is up a rook.
        const share = 1 / (1 + Math.pow(10, -pawns / 4))
        this.white.style.height = `${(share * 100).toFixed(1)}%`
        this.score.textContent = `${pawns >= 0 ? "+" : ""}${pawns.toFixed(1)}`
        this.score.classList.remove("is-mate")
    }

    setOrientation(humanColor) {
        this.root.classList.toggle("is-flipped", humanColor === "b")
    }
}

export class CapturedPieces {
    constructor(topRoot, bottomRoot) {
        this.topRoot = topRoot
        this.bottomRoot = bottomRoot
    }

    /** Derived from the position, so it survives undo without extra bookkeeping. */
    update(fen, humanColor = "w") {
        const board = fen.split(" ")[0]
        const present = { w: {}, b: {} }
        for (const character of board) {
            if (!/[a-zA-Z]/.test(character)) continue
            const color = character === character.toUpperCase() ? "w" : "b"
            const type = character.toLowerCase()
            present[color][type] = (present[color][type] || 0) + 1
        }

        const lost = {}
        let balance = 0
        for (const color of ["w", "b"]) {
            lost[color] = []
            for (const [type, count] of Object.entries(STARTING_COUNTS)) {
                const missing = count - (present[color][type] || 0)
                for (let i = 0; i < missing; i++) lost[color].push(type)
                balance += (color === "w" ? -1 : 1) * missing * PIECE_VALUES[type]
            }
        }

        // The player's own captures sit on their side of the board, and the
        // pieces shown there are the opponent's, whichever colour that is.
        const opponent = humanColor === "w" ? "b" : "w"
        const humanAdvantage = humanColor === "w" ? balance : -balance
        this.render(this.bottomRoot, lost[opponent], humanAdvantage, opponent)
        this.render(this.topRoot, lost[humanColor], -humanAdvantage, humanColor)
    }

    render(root, types, advantage, color) {
        if (!root) return
        const order = ["q", "r", "b", "n", "p"]
        const sorted = [...types].sort((a, b) => order.indexOf(a) - order.indexOf(b))
        const glyphs = sorted.map((type) => `<span>${PIECE_GLYPHS[color][type]}</span>`).join("")
        root.innerHTML = glyphs + (advantage > 0 ? `<b>+${advantage}</b>` : "")
    }
}
