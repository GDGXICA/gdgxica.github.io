import { afterAll, afterEach, beforeAll, describe, it } from "vitest";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { cleanup, clearAll, getTestEnv } from "./setup";

const SLUG = "devfest-2025";
const INSTANCE_ID = "instance-A";

const SAMPLE_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-1",
  templateVersion: 1,
  type: "poll",
  mode: "realtime",
  state: "scheduled",
  title: "Sample poll",
  config: { question: "Q?", options: [] },
  order: 0,
  createdBy: "admin-uid",
  createdAt: 0,
};

describe("firestore.rules — events/{slug}/minigames", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows anyone to read the shadow event doc", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `events/${SLUG}`), {
        slug: SLUG,
        createdAt: 0,
      });
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, `events/${SLUG}`)));
  });

  it("allows anyone to read instance docs", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      );
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(doc(anon, `events/${SLUG}/minigames/${INSTANCE_ID}`))
    );
  });

  it("allows anyone to read aggregates (for live overlays)", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `events/${SLUG}/minigames/${INSTANCE_ID}/aggregates/current`
        ),
        { totalResponses: 0 }
      );
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(
      getDoc(
        doc(anon, `events/${SLUG}/minigames/${INSTANCE_ID}/aggregates/current`)
      )
    );
  });

  it("denies authenticated client writes to the event shadow doc", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(doc(auth, `events/${SLUG}`), { slug: SLUG, createdAt: 0 })
    );
  });

  it("denies authenticated client writes to instance docs", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(auth, `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      )
    );
  });

  it("denies authenticated client writes to subcollections (PR3 baseline)", async () => {
    const env = await getTestEnv();
    const auth = env.authenticatedContext("user-1").firestore();
    const base = `events/${SLUG}/minigames/${INSTANCE_ID}`;
    await assertFails(
      setDoc(doc(auth, `${base}/participants/u1`), { alias: "a" })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/responses/u1_q1`), {
        questionId: "q1",
        optionId: "a",
      })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/words/hello`), { text: "hello", count: 1 })
    );
    await assertFails(
      setDoc(doc(auth, `${base}/aggregates/current`), { totalResponses: 1 })
    );
  });

  it("denies client deletes on instances", async () => {
    const env = await getTestEnv();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(ctx.firestore(), `events/${SLUG}/minigames/${INSTANCE_ID}`),
        SAMPLE_INSTANCE
      );
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      deleteDoc(doc(auth, `events/${SLUG}/minigames/${INSTANCE_ID}`))
    );
  });
});

// ---- PR5 rules: bingo card marking + word submissions -----------------

const BINGO_INSTANCE_ID = "instance-bingo";
const WORDCLOUD_INSTANCE_ID = "instance-wordcloud";

const BINGO_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-bingo",
  templateVersion: 1,
  type: "bingo",
  mode: "global",
  state: "live",
  title: "Sample bingo",
  config: { terms: [], cardSize: 4, freeCenter: false },
  order: 0,
  createdBy: "admin-uid",
  createdAt: 0,
};

const WORDCLOUD_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-wc",
  templateVersion: 1,
  type: "wordcloud",
  mode: "global",
  state: "live",
  title: "Sample wordcloud",
  config: { prompt: "Say a word", maxWordsPerUser: 3, maxLength: 60 },
  order: 1,
  createdBy: "admin-uid",
  createdAt: 0,
};

const SEED_PARTICIPANT_BINGO = {
  uid: "user-1",
  alias: "Ana",
  joinedAt: 0,
  bingoCard: Array.from({ length: 16 }, (_, i) => `term-${i}`),
};

async function seedBingoState(env: Awaited<ReturnType<typeof getTestEnv>>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(
      doc(db, `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}`),
      BINGO_INSTANCE
    );
    await setDoc(
      doc(
        db,
        `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
      ),
      SEED_PARTICIPANT_BINGO
    );
  });
}

async function seedWordCloudState(
  env: Awaited<ReturnType<typeof getTestEnv>>,
  options: { state?: string; type?: string; participantUid?: string } = {}
) {
  const state = options.state ?? "live";
  const type = options.type ?? "wordcloud";
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}`), {
      ...WORDCLOUD_INSTANCE,
      state,
      type,
    });
    if (options.participantUid) {
      await setDoc(
        doc(
          db,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/participants/${options.participantUid}`
        ),
        { uid: options.participantUid, alias: "tester", joinedAt: 0 }
      );
    }
  });
}

describe("firestore.rules — PR5 bingo marking", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows the owner to update only bingoMarked", async () => {
    const env = await getTestEnv();
    await seedBingoState(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
        ),
        { bingoMarked: Array.from({ length: 16 }, () => false) },
        { merge: true }
      )
    );
  });

  it("rejects bingoMarked of wrong length", async () => {
    const env = await getTestEnv();
    await seedBingoState(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
        ),
        { bingoMarked: [true, false, true] },
        { merge: true }
      )
    );
  });

  it("rejects updates that change the alias", async () => {
    const env = await getTestEnv();
    await seedBingoState(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
        ),
        { alias: "Hacked" },
        { merge: true }
      )
    );
  });

  it("rejects another user updating someone else's participant", async () => {
    const env = await getTestEnv();
    await seedBingoState(env);
    const stranger = env.authenticatedContext("user-2").firestore();
    await assertFails(
      setDoc(
        doc(
          stranger,
          `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
        ),
        { bingoMarked: Array.from({ length: 16 }, () => true) },
        { merge: true }
      )
    );
  });

  it("allows setting bingoWonAt alongside bingoMarked", async () => {
    const env = await getTestEnv();
    await seedBingoState(env);
    const auth = env.authenticatedContext("user-1").firestore();
    const win = Array.from({ length: 16 }, (_, i) => i < 4);
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${BINGO_INSTANCE_ID}/participants/user-1`
        ),
        { bingoMarked: win, bingoWonAt: new Date() },
        { merge: true }
      )
    );
  });
});

describe("firestore.rules — PR5 word submissions", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows a joined participant to write a word while live", async () => {
    const env = await getTestEnv();
    await seedWordCloudState(env, { participantUid: "user-1" });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/words/hola`
        ),
        { text: "hola", normalized: "hola", count: 1 },
        { merge: true }
      )
    );
  });

  it("rejects writes when the participant doc is missing", async () => {
    const env = await getTestEnv();
    await seedWordCloudState(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/words/hola`
        ),
        { text: "hola", normalized: "hola", count: 1 },
        { merge: true }
      )
    );
  });

  it("rejects writes when the instance is not live", async () => {
    const env = await getTestEnv();
    await seedWordCloudState(env, {
      state: "closed",
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/words/hola`
        ),
        { text: "hola", normalized: "hola", count: 1 },
        { merge: true }
      )
    );
  });

  it("rejects writes when the instance is not a wordcloud", async () => {
    const env = await getTestEnv();
    await seedWordCloudState(env, { type: "poll", participantUid: "user-1" });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/words/hola`
        ),
        { text: "hola", normalized: "hola", count: 1 },
        { merge: true }
      )
    );
  });

  it("rejects writes whose doc id does not match the normalized field", async () => {
    const env = await getTestEnv();
    await seedWordCloudState(env, { participantUid: "user-1" });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${WORDCLOUD_INSTANCE_ID}/words/hola`
        ),
        { text: "hola", normalized: "MISMATCH", count: 1 },
        { merge: true }
      )
    );
  });
});

// ---- PR6 rules: response writes for poll/quiz + quiz score self-update ----

const POLL_INSTANCE_ID = "instance-poll";
const QUIZ_INSTANCE_ID = "instance-quiz";

const POLL_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-poll",
  templateVersion: 1,
  type: "poll",
  mode: "realtime",
  state: "live",
  title: "Sample poll",
  config: { question: "Q?", options: [] },
  order: 2,
  createdBy: "admin-uid",
  createdAt: 0,
};

const QUIZ_INSTANCE = {
  eventSlug: SLUG,
  templateId: "tpl-quiz",
  templateVersion: 1,
  type: "quiz",
  mode: "realtime",
  state: "live",
  title: "Sample quiz",
  config: { questions: [] },
  order: 3,
  createdBy: "admin-uid",
  createdAt: 0,
};

async function seedRealtimeState(
  env: Awaited<ReturnType<typeof getTestEnv>>,
  options: {
    instanceId: string;
    instance: Record<string, unknown>;
    participantUid?: string;
  }
) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(
      doc(db, `events/${SLUG}/minigames/${options.instanceId}`),
      options.instance
    );
    if (options.participantUid) {
      await setDoc(
        doc(
          db,
          `events/${SLUG}/minigames/${options.instanceId}/participants/${options.participantUid}`
        ),
        {
          uid: options.participantUid,
          alias: "tester",
          joinedAt: 0,
        }
      );
    }
  });
}

describe("firestore.rules — PR6 response writes", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  it("allows a joined participant to vote on a live poll", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: POLL_INSTANCE,
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      )
    );
  });

  it("allows a joined participant to vote on a live quiz question", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: QUIZ_INSTANCE_ID,
      instance: QUIZ_INSTANCE,
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}/responses/user-1_q1`
        ),
        {
          uid: "user-1",
          questionId: "q1",
          optionId: "a",
          isCorrect: true,
          pointsEarned: 100,
        }
      )
    );
  });

  it("rejects responses with a uid different from auth", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: POLL_INSTANCE,
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-2_main`
        ),
        { uid: "user-2", questionId: "main", optionId: "a" }
      )
    );
  });

  it("rejects responses whose doc id does not follow ${uid}_${questionId}", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: POLL_INSTANCE,
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_DIFFERENT`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      )
    );
  });

  it("rejects responses on closed instances", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: { ...POLL_INSTANCE, state: "closed" },
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      )
    );
  });

  it("rejects responses on non-poll/quiz instances", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: { ...POLL_INSTANCE, type: "wordcloud" },
      participantUid: "user-1",
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      )
    );
  });

  it("rejects responses when participant doc is missing", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: POLL_INSTANCE,
    });
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      )
    );
  });

  it("rejects updates and deletes on existing responses", async () => {
    const env = await getTestEnv();
    await seedRealtimeState(env, {
      instanceId: POLL_INSTANCE_ID,
      instance: POLL_INSTANCE,
      participantUid: "user-1",
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(
        doc(
          ctx.firestore(),
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "a" }
      );
    });
    const auth = env.authenticatedContext("user-1").firestore();
    // Update.
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${POLL_INSTANCE_ID}/responses/user-1_main`
        ),
        { uid: "user-1", questionId: "main", optionId: "b" }
      )
    );
  });
});

describe("firestore.rules — PR6 quiz score self-update", () => {
  beforeAll(async () => {
    await getTestEnv();
  });

  afterEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await cleanup();
  });

  async function seedParticipant(
    env: Awaited<ReturnType<typeof getTestEnv>>,
    uid = "user-1"
  ) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}`), {
        ...QUIZ_INSTANCE,
      });
      await setDoc(
        doc(
          db,
          `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}/participants/${uid}`
        ),
        { uid, alias: "Ana", joinedAt: 0 }
      );
    });
  }

  it("allows the owner to merge quizScore + quizAnsweredQuestions", async () => {
    const env = await getTestEnv();
    await seedParticipant(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertSucceeds(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}/participants/user-1`
        ),
        { quizScore: 100, quizAnsweredQuestions: ["q1"] },
        { merge: true }
      )
    );
  });

  it("rejects another user updating quizScore for a stranger", async () => {
    const env = await getTestEnv();
    await seedParticipant(env);
    const stranger = env.authenticatedContext("user-2").firestore();
    await assertFails(
      setDoc(
        doc(
          stranger,
          `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}/participants/user-1`
        ),
        { quizScore: 9999 },
        { merge: true }
      )
    );
  });

  it("rejects updates that try to overwrite alias alongside quizScore", async () => {
    const env = await getTestEnv();
    await seedParticipant(env);
    const auth = env.authenticatedContext("user-1").firestore();
    await assertFails(
      setDoc(
        doc(
          auth,
          `events/${SLUG}/minigames/${QUIZ_INSTANCE_ID}/participants/user-1`
        ),
        { alias: "Hacked", quizScore: 9999 },
        { merge: true }
      )
    );
  });
});
