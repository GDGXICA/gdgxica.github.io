// Deterministic bingo card generation.
//
// `generateBingoCard` returns 16 unique terms drawn from the input bank
// using a seeded shuffle. Same seed → same card, every time. We use this in
// PR4's join handler so every participant gets a stable, reproducible card
// derived from their UID + the instance ID, with no Firestore round-trips.

const CARD_SIZE = 16;

// 32-bit FNV-1a hash → seed value for the PRNG.
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned 32-bit
  return h >>> 0;
}

// Mulberry32 — small fast deterministic 32-bit PRNG. Returns [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The term bank as the game actually sees it: trimmed, de-duped (admins
// are sloppy) and stripped of blanks, in first-seen order. Both the card
// dealer and the classic-mode draw order run through this, which is what
// guarantees every card term also appears in the draw sequence.
export function normalizeTerms(terms: readonly string[]): string[] {
  return Array.from(new Set(terms.map((t) => t.trim())).values()).filter(
    (t) => t.length > 0
  );
}

// Fisher–Yates with a seeded RNG. Same seed → same permutation.
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function generateBingoCard(
  terms: readonly string[],
  seed: string
): string[] {
  const unique = normalizeTerms(terms);

  if (unique.length < CARD_SIZE) {
    throw new Error(
      `Bingo term bank must have at least ${CARD_SIZE} unique terms (got ${unique.length})`
    );
  }

  return seededShuffle(unique, seed).slice(0, CARD_SIZE);
}
