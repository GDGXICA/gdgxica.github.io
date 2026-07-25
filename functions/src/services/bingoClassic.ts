// Classic bingo: an admin calls one term at a time ("balls") and every
// card is scored against that single sealed sequence.
//
// The whole anti-collision design rests on one property: once the draw
// order is sealed, a card's winning moment is already decided. It is the
// smallest number of balls that completes any of the ten lines — no
// player behaviour affects it. So at join time we can look at a candidate
// card, notice it would win on ball 31 exactly like somebody else's, and
// deal a different one before the participant ever sees it.
//
// That is what keeps five people from shouting "¡Bingo!" over each other
// when there are only three prizes: legitimate wins are spread one per
// ball, so they arrive one announcement at a time.

import { generateBingoCard, normalizeTerms, seededShuffle } from "./bingo";

// Row-major indices of the ten winning lines on a 4x4 card: 4 rows,
// 4 columns, 2 diagonals. Duplicated in src/lib/bingo.ts (browser) and
// bingoHasLine() in firestore.rules (write guard) — the three must be
// changed together.
export const WIN_LINES: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
  [0, 5, 10, 15],
  [3, 6, 9, 12],
];

// A card that can never complete a line against the given sequence.
// Unreachable while cards are dealt from the same bank the sequence is
// built from, but callers should not have to assume that.
export const NEVER_WINS = Number.POSITIVE_INFINITY;

// How many cards we deal and score before settling. Each attempt is a
// 16-of-N shuffle plus ten 4-cell scans, so the whole loop is
// microseconds; the ceiling exists because the occupancy lookup that
// consumes these turns into a single Firestore `in` query, and that
// clause takes at most 30 values.
export const MAX_DEAL_ATTEMPTS = 16;

// Nobody should win in the opening seconds — the room has not even
// settled and a prize would be gone. We refuse cards that win before
// this ball, capped low enough that it never eats the whole candidate
// pool on a small bank.
const EARLIEST_WIN_CAP = 6;

export function earliestWinFloor(drawOrderLength: number): number {
  return Math.min(EARLIEST_WIN_CAP, Math.floor(drawOrderLength / 4));
}

// The sealed calling sequence: the entire bank in random order, so every
// card eventually wins if the admin keeps calling. `seed` must be
// unpredictable (a fresh UUID at seal time) — deriving it from public
// data like the instance id would let an attendee recompute the sequence
// and know every ball in advance.
export function buildDrawOrder(
  terms: readonly string[],
  seed: string
): string[] {
  return seededShuffle(normalizeTerms(terms), seed);
}

// The ball number this card wins on: 1-based, so 31 means "after the
// 31st ball is called". Min over the ten lines of the last ball that
// line needs.
export function classicWinIndex(
  card: readonly string[],
  drawOrder: readonly string[]
): number {
  const position = new Map<string, number>();
  for (let i = 0; i < drawOrder.length; i++) {
    if (!position.has(drawOrder[i])) position.set(drawOrder[i], i + 1);
  }

  let best = NEVER_WINS;
  for (const line of WIN_LINES) {
    let lineCost = 0;
    for (const cell of line) {
      const pos = position.get(card[cell]);
      if (pos === undefined) {
        lineCost = NEVER_WINS;
        break;
      }
      if (pos > lineCost) lineCost = pos;
    }
    if (lineCost < best) best = lineCost;
  }
  return best;
}

export interface CardCandidate {
  card: string[];
  // Ball this card would win on (1-based).
  winIndex: number;
  // Which deal produced it. Kept so the audit trail can show how hard
  // the dealer had to work to find a free ball.
  attempt: number;
}

// Attempt 0 reuses the plain seed, so a classic card matches the
// conference-mode card for the same (uid, instance) unless a collision
// forces a re-deal.
function dealSeed(seedBase: string, attempt: number): string {
  return attempt === 0 ? seedBase : `${seedBase}#${attempt}`;
}

// Deals up to `attempts` cards and scores each one. Cards that win
// before `minWinIndex` are dropped — unless that would leave nothing to
// choose from, in which case an early card beats no card at all.
export function buildCardCandidates(
  terms: readonly string[],
  drawOrder: readonly string[],
  seedBase: string,
  attempts: number = MAX_DEAL_ATTEMPTS,
  minWinIndex = 0
): CardCandidate[] {
  const dealt: CardCandidate[] = [];
  const seen = new Set<string>();
  for (let attempt = 0; attempt < attempts; attempt++) {
    const card = generateBingoCard(terms, dealSeed(seedBase, attempt));
    const winIndex = classicWinIndex(card, drawOrder);
    if (winIndex === NEVER_WINS) continue;
    // Two seeds can land on the same 16 terms in the same order when the
    // bank is barely bigger than a card; scoring it twice would waste an
    // attempt without widening the choice. Newline is the separator
    // because terms come from a textarea split on newlines and so can
    // never contain one — a space could let ["a b", "c"] and ["a", "b c"]
    // collide.
    const fingerprint = card.join("\n");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    dealt.push({ card, winIndex, attempt });
  }

  const lateEnough = dealt.filter((c) => c.winIndex >= minWinIndex);
  return lateEnough.length > 0 ? lateEnough : dealt;
}

export interface StaggerPick extends CardCandidate {
  // True when every candidate collided and the participant had to be
  // seated on an already-taken ball anyway. Worth logging: it means the
  // bank is too small for the crowd, and simultaneous bingos become
  // possible again.
  relaxed: boolean;
}

// Picks the first candidate whose winning ball still has room.
//
// When the bank is too small for the crowd, every candidate ball is
// already taken and somebody has to double up. The overflow goes to the
// LATEST ball, never the emptiest: by then the prizes have been handed
// out and a shared win costs nothing, whereas a second winner on an
// early ball is precisely the pile-up this function exists to prevent.
// (Choosing the emptiest ball instead looks fairer and is measurably
// worse — it seats the overflow on the rare early balls, which are empty
// exactly because they are early.)
export function pickStaggeredCard(
  candidates: readonly CardCandidate[],
  occupancy: Readonly<Record<number, number>>,
  maxWinnersPerDraw: number
): StaggerPick | null {
  if (candidates.length === 0) return null;

  let fallback = candidates[0];
  let fallbackLoad = occupancy[fallback.winIndex] ?? 0;

  for (const candidate of candidates) {
    const load = occupancy[candidate.winIndex] ?? 0;
    if (load < maxWinnersPerDraw) {
      return { ...candidate, relaxed: false };
    }
    // Latest ball wins; on a tie take the emptier of the two so we don't
    // stack needlessly when two deals share the same winning ball.
    if (
      candidate.winIndex > fallback.winIndex ||
      (candidate.winIndex === fallback.winIndex && load < fallbackLoad)
    ) {
      fallback = candidate;
      fallbackLoad = load;
    }
  }

  return { ...fallback, relaxed: true };
}

// Distinct winning balls across the candidates, in first-seen order.
// This is what the occupancy query asks Firestore about, so it is capped
// at the 30-value ceiling of an `in` filter.
export function candidateWinIndices(
  candidates: readonly CardCandidate[]
): number[] {
  return Array.from(new Set(candidates.map((c) => c.winIndex))).slice(0, 30);
}

// Which cells of `card` are covered by the balls called so far. The
// server derives this itself when verifying a claim, so a participant
// cannot win by marking cells that were never called.
export function markedFromDrawn(
  card: readonly string[],
  drawnTerms: readonly string[]
): boolean[] {
  const called = new Set(drawnTerms);
  return card.map((term) => called.has(term));
}

// Completed lines for a marked card. Empty means no bingo yet.
export function completedLines(marked: readonly boolean[]): number[][] {
  const lines: number[][] = [];
  for (const line of WIN_LINES) {
    if (line.every((cell) => marked[cell] === true)) lines.push([...line]);
  }
  return lines;
}
