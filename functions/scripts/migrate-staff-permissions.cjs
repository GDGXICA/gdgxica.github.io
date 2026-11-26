// Writes onto every existing staff assignment the permissions it grants
// today, so each one is explicit and shows its real capabilities.
//
// Staff docs (events/{slug}/staff/{uid}) written before capabilities have
// no `permissions` list. The code and the rules already treat that as the
// frozen LEGACY_STAFF_PERMISSIONS (functions/src/auth/permissions.ts), so
// nothing depends on running this: it only replaces an implicit default
// with the same list, written down. Safe to run before or after the deploy.
//
// Usage (from functions/):
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-staff-permissions.cjs
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-staff-permissions.cjs --apply

const admin = require("firebase-admin");
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw new Error(
    "Set GOOGLE_CLOUD_PROJECT explicitly before running the migration"
  );
admin.initializeApp({ projectId });

// LEGACY_STAFF_PERMISSIONS, sorted as the API stores it.
const TODAY = [
  "checkin:operate",
  "credentials:operate",
  "credentials:read",
  "minigames:operate",
  "roster:read",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = admin.firestore();
  const staff = await db.collectionGroup("staff").get();
  let pinned = 0;

  for (const doc of staff.docs) {
    const data = doc.data();
    if (data.permissions !== undefined && data.permissions !== null) continue;
    pinned++;
    console.log(
      `${apply ? "PIN" : "WOULD PIN"} ${doc.ref.path} (${data.role ?? "?"})`
    );
    if (apply) await doc.ref.update({ permissions: TODAY });
  }

  console.log(
    `Inspected ${staff.size} assignments; ${pinned} had no permission list.`
  );
  if (!apply && pinned) console.log("Run again with --apply to write them.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
