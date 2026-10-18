const admin = require("firebase-admin");
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw new Error(
    "Set GOOGLE_CLOUD_PROJECT explicitly before running the migration"
  );
admin.initializeApp({ projectId });

async function main() {
  const apply = process.argv.includes("--apply");
  const db = admin.firestore();
  let inspected = 0;
  let migrated = 0;
  for (const eventRef of await db.collection("events").listDocuments()) {
    const instances = await eventRef.collection("minigames").get();
    for (const instance of instances.docs) {
      inspected++;
      const data = instance.data();
      if (data.type !== "quiz" || !Array.isArray(data.config?.questions))
        continue;
      const answers = Object.fromEntries(
        data.config.questions
          .filter((q) => q.correctOptionId)
          .map((q) => [q.id, q.correctOptionId])
      );
      if (Object.keys(answers).length === 0) continue;
      const publicQuestions = data.config.questions.map(
        ({ correctOptionId: _secret, ...question }) => question
      );
      console.log(
        `${apply ? "MIGRATE" : "WOULD MIGRATE"} ${instance.ref.path}`
      );
      if (apply) {
        const batch = db.batch();
        batch.set(instance.ref.collection("secret").doc("quiz"), { answers });
        batch.update(instance.ref, {
          config: { ...data.config, questions: publicQuestions },
        });
        await batch.commit();
      }
      migrated++;
    }
  }
  console.log(
    `Inspected ${inspected} instances; ${migrated} require migration.`
  );
  if (!apply && migrated)
    console.log("Run again with --apply after reviewing the paths.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
