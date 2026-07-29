// Payload caps, mirrored from functions/src/schemas/credentials.ts.
//
// Duplicated rather than imported because that module ships in the Cloud
// Function bundle, not the browser one — the same reason the check-in
// tokenizer is duplicated in CheckinPanel.tsx.
//
// These are CHARACTER counts of the data URL, not decoded bytes, because
// that is the unit the server's Zod schema bounds. Measuring differently
// here would let a credential pass local validation and then take a 400
// after the attendee already saw their image.
export const MAX_PHOTO_DATAURL_CHARS = 300_000;
export const MAX_CREDENTIAL_DATAURL_CHARS = 620_000;
