// Carries existing per-user revocations over to the permissions that were
// split out of them, so splitting a permission never widens anyone's access.
//
//   roster:read      -> also credentials:read  (credentials used to ride on roster:read)
//   mural:moderate   -> also mural:manage      (takedown, settings, block)
//   minigames:operate -> also minigames:manage (attach, delete, back to scheduled)
//
// Grants of the old permissions are only REPORTED: adding the matching
// "manage" grant automatically would undo the narrowing on purpose.
//
// Usage (from functions/):
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-split-permissions.cjs
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-split-permissions.cjs --apply
//
// Run it with --apply BEFORE the deploy that splits the permissions, not
// after: from the moment the new rules are live, a user who had roster:read
// revoked can read credentials until credentials:read is revoked too. The
// script writes with the Admin SDK, not through the users API, so the new
// permission names can be stored early; the current code ignores names it
// does not know, so writing them first changes nothing until the deploy.

const admin = require("firebase-admin");
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw new Error(
    "Set GOOGLE_CLOUD_PROJECT explicitly before running the migration"
  );
admin.initializeApp({ projectId });

const SPLITS = {
  "roster:read": "credentials:read",
  "mural:moderate": "mural:manage",
  "minigames:operate": "minigames:manage",
};

async function main() {
  const apply = process.argv.includes("--apply");
  const db = admin.firestore();
  const users = await db.collection("users").get();
  let migrated = 0;
  let grantsToReview = 0;

  for (const doc of users.docs) {
    const data = doc.data();
    const revocations = Array.isArray(data.revocations) ? data.revocations : [];
    const missing = Object.entries(SPLITS)
      .filter(
        ([from, to]) => revocations.includes(from) && !revocations.includes(to)
      )
      .map(([, to]) => to);

    if (missing.length > 0) {
      migrated++;
      console.log(
        `${apply ? "MIGRATE" : "WOULD MIGRATE"} users/${doc.id}: revoke also ${missing.join(", ")}`
      );
      if (apply) {
        await doc.ref.update({
          revocations: admin.firestore.FieldValue.arrayUnion(...missing),
        });
      }
    }

    const grants = Array.isArray(data.grants) ? data.grants : [];
    for (const grant of grants) {
      if (
        grant &&
        Object.prototype.hasOwnProperty.call(SPLITS, grant.permission)
      ) {
        grantsToReview++;
        console.log(
          `REVIEW users/${doc.id}: grant ${grant.permission} (scope ${grant.scope}) no longer includes ${SPLITS[grant.permission]}`
        );
      }
    }
  }

  console.log(
    `Inspected ${users.size} users; ${migrated} need revocations carried over; ${grantsToReview} grants to review by hand.`
  );
  if (!apply && migrated)
    console.log("Run again with --apply BEFORE deploying the split.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
