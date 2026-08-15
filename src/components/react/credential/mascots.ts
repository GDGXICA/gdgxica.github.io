// Avatar set offered when an attendee does not upload a photo.
//
// Four community mascots plus four abstract shapes in Google's brand
// colours. Every mascot here is used under a licence that explicitly
// permits reuse and modification, and each one carries an attribution
// obligation that is discharged on /creditos — which is a legal
// requirement, not a courtesy, so that page must stay reachable.
//
// What is NOT here is as deliberate as what is. Flutter's Dash and other
// Google marks were excluded: their terms forbid use as a profile image
// and on merchandise, which is exactly what a credential the attendee
// downloads and posts is. Same reasoning ruled out the PostgreSQL and
// Kubernetes marks. CC BY-SA art (Konqi, Wilber) was ruled out for a
// different reason — compositing onto a brand disc makes an adaptation,
// and ShareAlike would then attach to the JPEG the attendee shares.
//
// The art is composited onto a full-bleed brand-colour disc rather than
// left transparent. renderCredential.ts clips the avatar to a circle over
// a white card and draws a four-colour ring outside it, so transparent
// art reads as a ring around nothing.
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
  /** Brand colour of the disc behind the art. */
  brandColor: "blue" | "red" | "yellow" | "green";
}

// Mascots first: they are the reason anyone opens the picker. The default
// below is deliberately NOT the first entry — see DEFAULT_MASCOT_ID.
export const MASCOTS: readonly Mascot[] = [
  {
    id: "gopher",
    src: "/credencial/mascots/gopher.png",
    label: "Gopher, la mascota de Go",
    brandColor: "green",
  },
  {
    id: "ferris",
    src: "/credencial/mascots/ferris.png",
    label: "Ferris, la mascota de Rust",
    brandColor: "blue",
  },
  {
    id: "tux",
    src: "/credencial/mascots/tux.png",
    label: "Tux, la mascota de Linux",
    brandColor: "yellow",
  },
  {
    id: "android",
    src: "/credencial/mascots/android.png",
    label: "El robot de Android",
    brandColor: "red",
  },
  {
    id: "gdg-blue-a",
    src: "/credencial/mascots/gdg-blue-a.png",
    label: "Órbita azul",
    brandColor: "blue",
  },
  {
    id: "gdg-red-a",
    src: "/credencial/mascots/gdg-red-a.png",
    label: "Órbita roja",
    brandColor: "red",
  },
  {
    id: "gdg-yellow-a",
    src: "/credencial/mascots/gdg-yellow-a.png",
    label: "Órbita amarilla",
    brandColor: "yellow",
  },
  {
    id: "gdg-green-a",
    src: "/credencial/mascots/gdg-green-a.png",
    label: "Órbita verde",
    brandColor: "green",
  },
] as const;

export const MASCOT_IDS: readonly string[] = MASCOTS.map((m) => m.id);

/**
 * The pre-selected avatar.
 *
 * An explicit id rather than MASCOTS[0], so the picker can lead with the
 * mascots without one of them becoming the silent default. Someone who
 * never touches the picker should not ship a card flying a language's flag
 * they may have no connection to; a neutral shape is the honest default.
 * A test pins this to a real entry.
 */
export const DEFAULT_MASCOT_ID = "gdg-blue-a";

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
 * the two are pinned to agree — list, order and hash — by the mirror test
 * in credentialSequence.test.ts.
 */
export function mascotForSeed(seed: string): string {
  if (MASCOT_IDS.length === 0) return DEFAULT_MASCOT_ID;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return MASCOT_IDS[hash % MASCOT_IDS.length];
}
