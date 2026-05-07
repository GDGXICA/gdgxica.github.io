// Pure win detection for a 4x4 bingo card stored as a length-16
// boolean array (row-major). The participant doc uses
// `bingoMarked: boolean[16]`, so this lives in src/lib so both the
// card UI and any future server-side verifier can share it.

export const CARD_SIZE = 4;
export const CELL_COUNT = CARD_SIZE * CARD_SIZE;

const ROWS: number[][] = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
];
const COLS: number[][] = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
];
const DIAGS: number[][] = [
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

export const ALL_LINES: ReadonlyArray<ReadonlyArray<number>> = [
  ...ROWS,
  ...COLS,
  ...DIAGS,
];

// Returns the list of fully-marked lines (rows / cols / diagonals).
// Empty array means the user has not won yet. The list is included so
// the UI can highlight every winning line, not just the first.
export function detectBingoWin(marked: ReadonlyArray<boolean>): number[][] {
  if (marked.length !== CELL_COUNT) {
    throw new Error(
      `bingoMarked must have length ${CELL_COUNT} (got ${marked.length})`
    );
  }
  const wins: number[][] = [];
  for (const line of ALL_LINES) {
    if (line.every((idx) => marked[idx])) {
      wins.push([...line]);
    }
  }
  return wins;
}

export function hasBingoWin(marked: ReadonlyArray<boolean>): boolean {
  return detectBingoWin(marked).length > 0;
}

export function emptyMarked(): boolean[] {
  return Array.from({ length: CELL_COUNT }, () => false);
}
