// The three certificates GDG ICA issues. Each has its own static template
// (title, seal) and its own certifying paragraph.
//
// Lives apart from certificatePdf.ts so schemas and handlers can name the
// kinds without loading pdf-lib and the fonts.
export const CERTIFICATE_KINDS = ["attendee", "volunteer", "speaker"] as const;
export type CertificateKind = (typeof CERTIFICATE_KINDS)[number];
