// Firestore side of classic bingo: where the sealed calling sequence and
// the per-participant ball reservations live.
//
// Both collections are deliberately absent from firestore.rules, which
// means the root catch-all denies them. That matters:
//
//   secret/draw — the full sequence. Public would let anyone read every
//     ball before it is called.
//   slots/{uid} — which ball each participant wins on. Participant docs
//     ARE publicly readable, so keeping the reservation out of them is
//     the only way the winning moment stays a surprise.
//
// Cloud Functions reach both through the Admin SDK, which bypasses rules.

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type {
  CollectionReference,
  DocumentReference,
} from "firebase-admin/firestore";
import { buildDrawOrder } from "./bingoClassic";

const SECRET_COL = "secret";
const DRAW_DOC = "draw";
const SLOTS_COL = "slots";

interface SealedDraw {
  order?: string[];
}

export function drawOrderRef(
  instanceRef: DocumentReference
): DocumentReference {
  return instanceRef.collection(SECRET_COL).doc(DRAW_DOC);
}

export function winSlotsCol(
  instanceRef: DocumentReference
): CollectionReference {
  return instanceRef.collection(SLOTS_COL);
}

export async function readDrawOrder(
  instanceRef: DocumentReference
): Promise<string[]> {
  const snap = await drawOrderRef(instanceRef).get();
  return (snap.data() as SealedDraw | undefined)?.order ?? [];
}

// Seals the calling sequence once and returns it forever after.
//
// The seed is a fresh UUID rather than anything derived from the instance
// id or the term list: those are public, and a seeded shuffle over public
// inputs is a sequence any attendee could recompute at home.
export async function ensureDrawOrder(
  instanceRef: DocumentReference,
  terms: readonly string[]
): Promise<string[]> {
  const existing = await readDrawOrder(instanceRef);
  if (existing.length > 0) return existing;

  const ref = drawOrderRef(instanceRef);
  // Transaction so two participants joining in the same instant cannot
  // seal two different sequences — the first one through wins and the
  // other reads it back.
  return instanceRef.firestore.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const sealed = (fresh.data() as SealedDraw | undefined)?.order ?? [];
    if (sealed.length > 0) return sealed;

    const order = buildDrawOrder(terms, randomUUID());
    tx.set(ref, {
      order,
      sealedAt: FieldValue.serverTimestamp(),
    });
    return order;
  });
}
