import { describe, expect, it } from "vitest";
import {
  buildCardCandidates,
  buildDrawOrder,
  candidateWinIndices,
  classicWinIndex,
  completedLines,
  earliestWinFloor,
  markedFromDrawn,
  pickStaggeredCard,
  NEVER_WINS,
  WIN_LINES,
} from "./bingoClassic";

const bank = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
const BANK_50 = bank(50);

// A card laid out row-major so the assertions below can talk about
// specific lines: cells 0..3 are the top row, 0/4/8/12 the left column.
const CARD = Array.from({ length: 16 }, (_, i) => `c${i}`);

describe("buildDrawOrder", () => {
  it("covers the whole bank, so every card eventually wins", () => {
    const order = buildDrawOrder(BANK_50, "seed");
    expect(order).toHaveLength(50);
    expect(new Set(order)).toEqual(new Set(BANK_50));
  });

  it("is deterministic per seed and differs across seeds", () => {
    expect(buildDrawOrder(BANK_50, "a")).toEqual(buildDrawOrder(BANK_50, "a"));
    expect(buildDrawOrder(BANK_50, "a")).not.toEqual(
      buildDrawOrder(BANK_50, "b")
    );
  });

  it("normalizes the bank the same way cards are dealt", () => {
    const sloppy = [...BANK_50, "  t1  ", "", "   ", "t2"];
    expect(buildDrawOrder(sloppy, "seed")).toHaveLength(50);
  });
});

describe("classicWinIndex", () => {
  it("returns the ball that completes the earliest line, 1-based", () => {
    // Top row last term lands on ball 4; nothing else can be faster.
    const order = ["c0", "c1", "c2", "c3", ...CARD.slice(4)];
    expect(classicWinIndex(CARD, order)).toBe(4);
  });

  it("counts the LAST ball a line needs, not the first", () => {
    // Left column (0,4,8,12) completes only when c12 is called 9th.
    const order = [
      "c0",
      "c4",
      "zz1",
      "c8",
      "zz2",
      "zz3",
      "zz4",
      "zz5",
      "c12",
      ...CARD,
    ];
    expect(classicWinIndex(CARD, order)).toBe(9);
  });

  it("takes the minimum across all ten lines", () => {
    const order = buildDrawOrder(BANK_50, "cross-check");
    const card = order.slice(0, 16); // arbitrary but valid card
    const perLine = WIN_LINES.map((line) =>
      Math.max(...line.map((cell) => order.indexOf(card[cell]) + 1))
    );
    expect(classicWinIndex(card, order)).toBe(Math.min(...perLine));
  });

  it("reports NEVER_WINS when a card term is missing from the sequence", () => {
    expect(classicWinIndex(CARD, ["c0", "c1", "c2"])).toBe(NEVER_WINS);
  });

  it("never exceeds the sequence length for a card drawn from the bank", () => {
    const order = buildDrawOrder(BANK_50, "bounded");
    for (let i = 0; i < 20; i++) {
      const card = buildCardCandidates(BANK_50, order, `p${i}`, 1)[0];
      expect(card.winIndex).toBeLessThanOrEqual(order.length);
      expect(card.winIndex).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("earliestWinFloor", () => {
  it("keeps a prize from going out in the opening seconds", () => {
    expect(earliestWinFloor(60)).toBe(6);
  });

  it("scales down so a small bank still has candidates", () => {
    expect(earliestWinFloor(16)).toBe(4);
    expect(earliestWinFloor(20)).toBe(5);
  });
});

describe("buildCardCandidates", () => {
  const order = buildDrawOrder(BANK_50, "candidates");

  it("scores several distinct cards for one participant", () => {
    const candidates = buildCardCandidates(BANK_50, order, "uid:inst");
    expect(candidates.length).toBeGreaterThan(1);
    const fingerprints = new Set(candidates.map((c) => c.card.join(" ")));
    expect(fingerprints.size).toBe(candidates.length);
  });

  it("keeps attempt 0 identical to the plain conference-mode deal", () => {
    const [first] = buildCardCandidates(BANK_50, order, "uid:inst", 1);
    expect(first.attempt).toBe(0);
    expect(first.card).toHaveLength(16);
  });

  it("drops cards that would win before the floor", () => {
    const candidates = buildCardCandidates(BANK_50, order, "uid:inst", 16, 25);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) expect(c.winIndex).toBeGreaterThanOrEqual(25);
  });

  it("ignores an unreachable floor rather than dealing nothing", () => {
    // No card can win on ball 999 of a 50-ball sequence.
    const candidates = buildCardCandidates(BANK_50, order, "uid:inst", 16, 999);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("propagates the bank-too-small error from the dealer", () => {
    expect(() => buildCardCandidates(bank(9), order, "uid")).toThrowError(
      /at least 16/i
    );
  });
});

describe("pickStaggeredCard", () => {
  const candidates = [
    { card: ["a"], winIndex: 10, attempt: 0 },
    { card: ["b"], winIndex: 22, attempt: 1 },
    { card: ["c"], winIndex: 31, attempt: 2 },
  ];

  it("takes the first free ball", () => {
    const pick = pickStaggeredCard(candidates, {}, 1);
    expect(pick).toMatchObject({ winIndex: 10, relaxed: false });
  });

  it("skips a ball that already has its winner", () => {
    const pick = pickStaggeredCard(candidates, { 10: 1 }, 1);
    expect(pick).toMatchObject({ winIndex: 22, relaxed: false });
  });

  it("honours a quota above 1", () => {
    const pick = pickStaggeredCard(candidates, { 10: 1 }, 2);
    expect(pick).toMatchObject({ winIndex: 10, relaxed: false });
  });

  it("sends the overflow to the latest ball, not the emptiest", () => {
    // Ball 22 is the least crowded, but seating a duplicate there would
    // create a second winner while prizes are still on the table. Ball 31
    // is late, where a shared win costs nothing.
    const pick = pickStaggeredCard(candidates, { 10: 3, 22: 1, 31: 2 }, 1);
    expect(pick).toMatchObject({ winIndex: 31, relaxed: true });
  });

  it("never seats overflow on an early ball", () => {
    const pick = pickStaggeredCard(candidates, { 10: 1, 22: 5, 31: 5 }, 1);
    expect(pick?.winIndex).not.toBe(10);
    expect(pick?.relaxed).toBe(true);
  });

  it("returns null when there is nothing to deal", () => {
    expect(pickStaggeredCard([], {}, 1)).toBeNull();
  });
});

describe("candidateWinIndices", () => {
  it("de-dupes and stays inside the 30-value `in` filter limit", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      card: [`c${i}`],
      winIndex: i,
      attempt: i,
    }));
    expect(candidateWinIndices(many)).toHaveLength(30);
    expect(
      candidateWinIndices([
        { card: ["a"], winIndex: 7, attempt: 0 },
        { card: ["b"], winIndex: 7, attempt: 1 },
      ])
    ).toEqual([7]);
  });
});

describe("markedFromDrawn / completedLines", () => {
  it("marks only the cells whose term was actually called", () => {
    const marked = markedFromDrawn(CARD, ["c0", "c5", "nope"]);
    expect(marked[0]).toBe(true);
    expect(marked[5]).toBe(true);
    expect(marked[1]).toBe(false);
    expect(marked.filter(Boolean)).toHaveLength(2);
  });

  it("finds no line until one is genuinely complete", () => {
    expect(completedLines(markedFromDrawn(CARD, ["c0", "c1", "c2"]))).toEqual(
      []
    );
    expect(
      completedLines(markedFromDrawn(CARD, ["c0", "c1", "c2", "c3"]))
    ).toEqual([[0, 1, 2, 3]]);
  });

  it("reports every completed line, not just the first", () => {
    const lines = completedLines(
      markedFromDrawn(CARD, ["c0", "c1", "c2", "c3", "c4", "c8", "c12"])
    );
    expect(lines).toHaveLength(2); // top row + left column
  });
});

// The property the whole feature exists for. Deals cards to a room full
// of participants exactly the way the join handler does, then replays the
// game and counts how many people would legitimately shout at once.
function dealRoom(
  bankSize: number,
  participants: number,
  maxWinnersPerDraw = 1
): number[] {
  const terms = bank(bankSize);
  const order = buildDrawOrder(terms, "room-seed");
  const floor = earliestWinFloor(order.length);
  const occupancy: Record<number, number> = {};
  const winBalls: number[] = [];

  for (let i = 0; i < participants; i++) {
    const candidates = buildCardCandidates(
      terms,
      order,
      `player-${i}:inst`,
      undefined,
      floor
    );
    const pick = pickStaggeredCard(candidates, occupancy, maxWinnersPerDraw);
    if (!pick) throw new Error("no card dealt");
    occupancy[pick.winIndex] = (occupancy[pick.winIndex] ?? 0) + 1;
    // The card the participant actually holds must win on the ball we
    // reserved for them — otherwise the reservation is a lie.
    expect(classicWinIndex(pick.card, order)).toBe(pick.winIndex);
    winBalls.push(pick.winIndex);
  }
  return winBalls;
}

function tally(values: number[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

// The ball on which two people first win together, or null if nobody
// ever shares. Everything before it is announced one winner at a time.
function firstSharedBall(balls: number[]): number | null {
  const shared = Object.entries(tally(balls))
    .filter(([, count]) => count > 1)
    .map(([ball]) => Number(ball));
  return shared.length > 0 ? Math.min(...shared) : null;
}

describe("simultaneous-bingo staggering", () => {
  // 12 covers three prizes with a wide margin: even if the organizer
  // hands out a few extra mentions, they are still called one at a time.
  const STAGGERED_PREFIX = 12;

  function assertStaggeredOpening(balls: number[]) {
    const opening = [...balls].sort((a, b) => a - b).slice(0, STAGGERED_PREFIX);
    expect(new Set(opening).size).toBe(opening.length);
  }

  it("announces the first winners one ball at a time (40 players, 50 terms)", () => {
    const balls = dealRoom(50, 40);
    assertStaggeredOpening(balls);
  });

  it("still staggers the opening when the room outgrows the bank", () => {
    // 120 players over a 50-ball sequence cannot all be unique — there
    // are only so many balls. What must not happen is two of them
    // claiming at once while prizes are still on the table.
    const balls = dealRoom(50, 120);
    assertStaggeredOpening(balls);
  });

  it("pushes unavoidable shared wins past the prize positions", () => {
    for (const [bankSize, players] of [
      [50, 120],
      [75, 120],
    ] as const) {
      const balls = dealRoom(bankSize, players);
      const shared = firstSharedBall(balls);
      if (shared === null) continue;
      const sorted = [...balls].sort((a, b) => a - b);
      // Every prize is already handed out by the time anyone doubles up.
      expect(shared).toBeGreaterThan(sorted[STAGGERED_PREFIX - 1]);
    }
  });

  it("lets an organizer relax the quota when they have many prizes", () => {
    const balls = dealRoom(50, 40, 3);
    const opening = [...balls].sort((a, b) => a - b).slice(0, 12);
    // Up to three winners may now share a ball, but not more.
    for (const count of Object.values(tally(opening))) {
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("keeps a tiny bank playable even though cards must overlap", () => {
    // 16 terms means every card holds the entire bank and only the
    // arrangement differs. Wins bunch up — that is physics, not a bug —
    // but the dealer must not crash or hand out a card that never wins.
    const balls = dealRoom(16, 30);
    expect(balls).toHaveLength(30);
    for (const b of balls) expect(b).toBeLessThanOrEqual(16);
  });

  it("is reproducible: the same room deals the same way twice", () => {
    expect(dealRoom(50, 25)).toEqual(dealRoom(50, 25));
  });
});
