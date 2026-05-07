import { describe, expect, it } from "vitest";
import { CELL_COUNT, detectBingoWin, emptyMarked, hasBingoWin } from "../bingo";

function withIndices(indices: number[]): boolean[] {
  const m = emptyMarked();
  for (const i of indices) m[i] = true;
  return m;
}

describe("detectBingoWin", () => {
  it("returns empty array for an empty card", () => {
    expect(detectBingoWin(emptyMarked())).toEqual([]);
    expect(hasBingoWin(emptyMarked())).toBe(false);
  });

  it("detects every row", () => {
    for (const row of [0, 1, 2, 3]) {
      const indices = [row * 4, row * 4 + 1, row * 4 + 2, row * 4 + 3];
      const marks = withIndices(indices);
      const wins = detectBingoWin(marks);
      expect(wins).toHaveLength(1);
      expect(wins[0]).toEqual(indices);
    }
  });

  it("detects every column", () => {
    for (const col of [0, 1, 2, 3]) {
      const indices = [col, col + 4, col + 8, col + 12];
      const wins = detectBingoWin(withIndices(indices));
      expect(wins).toHaveLength(1);
      expect(wins[0]).toEqual(indices);
    }
  });

  it("detects the main diagonal", () => {
    const wins = detectBingoWin(withIndices([0, 5, 10, 15]));
    expect(wins).toEqual([[0, 5, 10, 15]]);
  });

  it("detects the anti-diagonal", () => {
    const wins = detectBingoWin(withIndices([3, 6, 9, 12]));
    expect(wins).toEqual([[3, 6, 9, 12]]);
  });

  it("returns multiple lines when the card is fully marked", () => {
    const all = Array.from({ length: CELL_COUNT }, () => true);
    const wins = detectBingoWin(all);
    // 4 rows + 4 cols + 2 diags = 10 lines.
    expect(wins).toHaveLength(10);
  });

  it("does not declare a win for 3-in-a-row", () => {
    expect(detectBingoWin(withIndices([0, 1, 2]))).toEqual([]);
  });

  it("throws if the marked length is wrong", () => {
    expect(() => detectBingoWin([true, false, true])).toThrowError(
      /length 16/i
    );
  });
});
