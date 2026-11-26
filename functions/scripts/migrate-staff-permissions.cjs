// Pins every existing staff assignment to exactly the access it has today.
//
// Staff docs (events/{slug}/staff/{uid}) written before capabilities have
// no `permissions` list, and "no list" means "the whole per-event bundle of
// the role". The release that introduces capabilities also adds
// mural:moderate to the volunteer bundle, so without this every existing
// volunteer would start moderating the mural of their events without anyone
// choosing it. This writes today's bundle, mural excluded, onto each doc.
//
// Usage (from functions/):
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-staff-permissions.cjs
//   GOOGLE_CLOUD_PROJECT=appgdgica node scripts/migrate-staff-permissions.cjs --apply
//
// Run --apply BEFORE merging the capabilities release (the current code
// ignores the field) and once more right after its deploy: until then, the
// current assign endpoint overwrites the whole doc and drops the list.

const admin = require("firebase-admin");
const projectId = process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId)
  throw new Error(
    "Set GOOGLE_CLOUD_PROJECT explicitly before running the migration"
  );
admin.initializeApp({ projectId });

// The volunteer's per-event bundle before capabilities, sorted as the API
// stores it.
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
  if (!apply && pinned)
    console.log("Run again with --apply before merging, and after deploying.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
