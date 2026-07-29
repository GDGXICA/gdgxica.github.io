import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2025";
const INSTANCE_ID = "bingo-A";
const UID = "player-1";
const PATH = `events/${SLUG}/minigames/${INSTANCE_ID}/participants/${UID}`;

// A bingo card is 16 cells row-major; the win lines are the 4 rows, 4
// columns and 2 diagonals. These tests defend the property that a win is
// server-verified: bingoWonAt may only be set when bingoMarked genuinely
// contains a completed line, and only with the server's own timestamp.
const marks = (...on: number[]) => {
  const a = Array.from({ length: 16 }, () => false);
  for (const i of on) a[i] = true;
  return a;
};
const ROW0 = marks(0, 1, 2, 3);
const COL0 = marks(0, 4, 8, 12);
const DIAG = marks(0, 5, 10, 15);
const NO_LINE = marks(0, 1, 6, 11); // scattered, no full line
const EMPTY = marks();

const INSTANCE_PATH = `events/${SLUG}/minigames/${INSTANCE_ID}`;

/** Seeds the participant doc exactly as the join Cloud Function leaves it:
 *  identity + card, and NO check-in / win fields. The parent instance doc
 *  is seeded too, because the win rule reads its config to tell classic
 *  mode from conference mode. */
async function seedParticipant(classic = false) {
  const env = await getTestEnv();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), INSTANCE_PATH), {
      type: "bingo",
      state: "live",
      config: { terms: ["a", "b"], classic },
    });
    await setDoc(doc(ctx.firestore(), PATH), {
      uid: UID,
      alias: "Jugador",
      joinedAt: 0,
      bingoCard: Array.from({ length: 16 }, (_, i) => `term-${i}`),
    });
  });
}

let env2: Awaited<ReturnType<typeof getTestEnv>>;
const asPlayer = () => env2.authenticatedContext(UID).firestore();

describe("firestore.rules — bingo win verification", () => {
  beforeAll(async () => {
    env2 = await getTestEnv();
  });
  afterEach(async () => {
    await clearAll();
  });
  afterAll(async () => {
    await cleanup();
  });

  describe("marking without claiming a win", () => {
    it("allows marking any cell (no bingoWonAt in the write)", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertSucceeds(
        setDoc(doc(db, PATH), { bingoMarked: NO_LINE }, { merge: true })
      );
    });

    it("rejects a bingoMarked that is not 16 cells", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: marks(0).slice(0, 8) },
          { merge: true }
        )
      );
    });
  });

  describe("claiming a win — must be a real, server-timed line", () => {
    it("allows a win on a completed row", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertSucceeds(
        setDoc(
          doc(db, PATH),
          { bingoMarked: ROW0, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    it("allows a win on a completed column and on a diagonal", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertSucceeds(
        setDoc(
          doc(db, PATH),
          { bingoMarked: COL0, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
      await assertSucceeds(
        setDoc(
          doc(db, PATH),
          { bingoMarked: DIAG, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    // The core exploit: opening the console and declaring victory.
    it("rejects a win with no completed line", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: NO_LINE, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    it("rejects a win on an entirely empty card", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: EMPTY, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    // Winners are ordered by bingoWonAt, so a backdated client timestamp
    // would jump the queue. The win must carry the server's own time.
    it("rejects a real line with a backdated client timestamp", async () => {
      await seedParticipant();
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: ROW0, bingoWonAt: Timestamp.fromMillis(1000) },
          { merge: true }
        )
      );
    });
  });

  describe("play continues after a legitimate win", () => {
    /** Seeds a participant who has already legitimately won on ROW0. */
    async function seedWinner() {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), PATH), {
          uid: UID,
          alias: "Jugador",
          joinedAt: 0,
          bingoCard: Array.from({ length: 16 }, (_, i) => `term-${i}`),
          bingoMarked: ROW0,
          bingoWonAt: Timestamp.fromMillis(5000),
        });
      });
    }

    it("allows marking more cells (bingoWonAt unchanged)", async () => {
      await seedWinner();
      const db = asPlayer();
      await assertSucceeds(
        setDoc(
          doc(db, PATH),
          { bingoMarked: marks(0, 1, 2, 3, 4) },
          { merge: true }
        )
      );
    });

    it("allows un-marking a cell after winning, keeping the win", async () => {
      await seedWinner();
      const db = asPlayer();
      // Breaks the line, but bingoWonAt is not re-written, so it stands.
      await assertSucceeds(
        setDoc(doc(db, PATH), { bingoMarked: marks(1, 2, 3) }, { merge: true })
      );
    });

    it("rejects overwriting an existing win with a new backdated time", async () => {
      await seedWinner();
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoWonAt: Timestamp.fromMillis(1) },
          { merge: true }
        )
      );
    });
  });

  describe("a player cannot touch another player's card", () => {
    it("rejects writing to a different participant's doc", async () => {
      await seedParticipant();
      const other = env2.authenticatedContext("player-2").firestore();
      await assertFails(
        setDoc(doc(other, PATH), { bingoMarked: ROW0 }, { merge: true })
      );
    });
  });

  // Classic mode has an admin calling balls, so "I completed a line" is
  // only true for balls that were actually called — something rules
  // cannot check, since it means cross-referencing the card against the
  // called list. So the client is shut out of bingoWonAt entirely and
  // /bingo/claim (Admin SDK, bypasses rules) does the verifying.
  describe("classic mode — the client may not declare its own win", () => {
    it("still allows marking cells", async () => {
      await seedParticipant(true);
      const db = asPlayer();
      await assertSucceeds(
        setDoc(doc(db, PATH), { bingoMarked: ROW0 }, { merge: true })
      );
    });

    it("rejects a self-reported win even on a genuine, server-timed line", async () => {
      await seedParticipant(true);
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: ROW0, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    it("rejects a self-reported win on a diagonal too", async () => {
      await seedParticipant(true);
      const db = asPlayer();
      await assertFails(
        setDoc(
          doc(db, PATH),
          { bingoMarked: DIAG, bingoWonAt: serverTimestamp() },
          { merge: true }
        )
      );
    });

    it("lets the player keep marking after the server crowned them", async () => {
      await seedParticipant(true);
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        // What /bingo/claim leaves behind.
        await setDoc(
          doc(ctx.firestore(), PATH),
          {
            bingoMarked: ROW0,
            bingoWonAt: Timestamp.fromMillis(5000),
            bingoRank: 1,
            bingoWinDraw: 12,
          },
          { merge: true }
        );
      });
      const db = asPlayer();
      await assertSucceeds(
        setDoc(
          doc(db, PATH),
          { bingoMarked: marks(0, 1, 2, 3, 7) },
          { merge: true }
        )
      );
    });

    it("rejects a client rewriting the rank the server assigned", async () => {
      await seedParticipant(true);
      const db = asPlayer();
      await assertFails(
        setDoc(doc(db, PATH), { bingoRank: 1 }, { merge: true })
      );
      await assertFails(
        setDoc(doc(db, PATH), { bingoWinDraw: 1 }, { merge: true })
      );
    });
  });

  // The sealed calling sequence and the per-participant ball reservations.
  // Reading either would spoil the game: one reveals every future ball,
  // the other reveals when each person is going to win.
  describe("classic-mode secrets are unreadable", () => {
    const SECRET_PATH = `${INSTANCE_PATH}/secret/draw`;
    const SLOT_PATH = `${INSTANCE_PATH}/slots/${UID}`;

    async function seedSecrets() {
      const env = await getTestEnv();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), SECRET_PATH), {
          order: ["a", "b", "c"],
        });
        await setDoc(doc(ctx.firestore(), SLOT_PATH), {
          uid: UID,
          winIndex: 31,
        });
      });
    }

    it("denies reading the draw order, authenticated or not", async () => {
      await seedParticipant(true);
      await seedSecrets();
      await assertFails(getDoc(doc(asPlayer(), SECRET_PATH)));
      await assertFails(
        getDoc(doc(env2.unauthenticatedContext().firestore(), SECRET_PATH))
      );
    });

    it("denies reading which ball anyone wins on", async () => {
      await seedParticipant(true);
      await seedSecrets();
      await assertFails(getDoc(doc(asPlayer(), SLOT_PATH)));
    });

    it("denies writing to either", async () => {
      await seedParticipant(true);
      const db = asPlayer();
      await assertFails(setDoc(doc(db, SECRET_PATH), { order: ["x"] }));
      await assertFails(setDoc(doc(db, SLOT_PATH), { winIndex: 1 }));
    });
  });
});
