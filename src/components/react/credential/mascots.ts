// Avatar set offered when an attendee does not upload a photo.
//
// These are original abstract shapes in Google's four brand colors, NOT
// programming-language mascots. The Go gopher is CC BY 3.0 and requires
// attribution, other language mascots carry incompatible licences, and
// Google's own marks come with brand guidelines — none of which is worth
// litigating on a credential the community will post publicly.
//
// PLACEHOLDER ART. The geometry is final (512x512, centred, safe inside a
// circular crop) but the illustrations are stand-ins so the flow can be
// built and reviewed. Replacing a file in public/credencial/mascots/ with
// final art of the same dimensions requires no code change.
//
// PNG rather than SVG on purpose: drawImage with an SVG source needs
// intrinsic width/height and behaves inconsistently across browsers,
// while a PNG is consumed identically by the picker's <img> and by the
// canvas. They live in this repo rather than gdg-ica-data because the
// renderer assumes their exact geometry — they are code-coupled assets.

export interface Mascot {
  /** Stored on the credential document; must match the schema's regex. */
  id: string;
  /** Same-origin path. A cross-origin source would taint the canvas. */
  src: string;
  /** Accessible label for the picker. */
  label: string;
}

export const MASCOTS: readonly Mascot[] = [
  {
    id: "gdg-blue-a",
    src: "/credencial/mascots/gdg-blue-a.png",
    label: "Órbita azul",
  },
  {
    id: "gdg-red-a",
    src: "/credencial/mascots/gdg-red-a.png",
    label: "Órbita roja",
  },
  {
    id: "gdg-yellow-a",
    src: "/credencial/mascots/gdg-yellow-a.png",
    label: "Órbita amarilla",
  },
  {
    id: "gdg-green-a",
    src: "/credencial/mascots/gdg-green-a.png",
    label: "Órbita verde",
  },
  {
    id: "gdg-blue-b",
    src: "/credencial/mascots/gdg-blue-b.png",
    label: "Arco azul",
  },
  {
    id: "gdg-red-b",
    src: "/credencial/mascots/gdg-red-b.png",
    label: "Arco rojo",
  },
  {
    id: "gdg-yellow-b",
    src: "/credencial/mascots/gdg-yellow-b.png",
    label: "Arco amarillo",
  },
  {
    id: "gdg-green-b",
    src: "/credencial/mascots/gdg-green-b.png",
    label: "Arco verde",
  },
] as const;

export const MASCOT_IDS: readonly string[] = MASCOTS.map((m) => m.id);

export const DEFAULT_MASCOT_ID = MASCOTS[0].id;

export function findMascot(id: string | null): Mascot | null {
  if (!id) return null;
  return MASCOTS.find((m) => m.id === id) ?? null;
}

/**
 * Picks a mascot from a string, stably.
 *
 * Used when a photo is taken down: the replacement avatar has to be the
 * same every time moderation runs on that record, so re-review cannot
 * shuffle the face the attendee already saw. Mirrors
 * functions/src/services/credentialSequence.ts#mascotForCredentialId, and
 * the two are pinned to agree by a test.
 */
export function mascotForSeed(seed: string): string {
  if (MASCOT_IDS.length === 0) return DEFAULT_MASCOT_ID;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MASCOT_IDS[hash % MASCOT_IDS.length];
}
