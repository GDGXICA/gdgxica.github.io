---
version: 1
slug: "functions-scripts-certificates"
primary_target: "functions/scripts/certificates"
related_targets:
  ["functions/src/services/certificatePdf.ts", "functions/assets/certificates"]
---

# Certificados GDG ICA (PDF)

Scope: the three certificate PDFs emailed after an event (asistente, voluntariado, speaker). A print/PDF artifact, A4 landscape, read on screen and sometimes printed. Not part of the admin panel's atlas world; DESIGN.md does not govern it.

Audience and job: the recipient keeps and shares it (LinkedIn, portfolio); it must read instantly as GDG ICA and as an honour, and say who, what event, when.

Pinned by the user (2026-11-25): black and gold, the colibrí, Google logos, three variants.

Unresolved: speaker talk title is not on the certificate (needs a per-recipient field); signatory is fixed to Eduardo Ormeño.

## Direction contract

THESIS: the certificate is an aerial survey plate of the Nazca pampa at night: the chapter's own colibrí (COLIBRI_POINTS in src/lib/colibri.ts, traced from the owner's reference drawing, the same figure as the home hero and the credential) as one continuous gold line across the whole page, fading under the text. Refuses the stock diploma (guilloché border, ribbon, laurel) and the generic dark tech template.

OWN-WORLD: warm black ground #0D0C0A, solid gold #D2AE6D, ivory #F1EADB / dim ivory #B9B1A1. Map neatline frame with alternating gold graticule band. Bodoni Moda (Didone, engraved-diploma voice) for title and name; Geist (gdgica.com's face) for everything else. GDG mark in its own four colours, the only colour besides gold.

STORY: recipient sees their name in gold italic first, then the event and date in the paragraph, then the signature and the role seal.

FIRST VIEWPORT: whole page. The colibrí is the background: ~560pt tall, centred right of middle (650, 300), clipped by the inner frame, its 4.2pt gold line fading right to left (opacity 0.05 → 0.11 → 0.4 across its width), so it is strong where the page is empty and recedes under the text; no caption. Text column x 64–620pt over it: GDG lockup; title on one line, "Certificado" roman + role phrase italic, 34pt ivory; "Se otorga a" in 15pt Bodoni italic dim ivory, bound to the name; name up to 58pt gold italic (two lines at up to 36pt) on a gold rule with end ticks (survey scale bar); paragraph 12.5pt over 520pt with only event, date and hours emphasised (Geist Medium, ivory), times and date never broken; signature bottom-left, role seal at the column's right edge on its own ground disc.

FORM: the user pinned the world (black and gold, colibrí, Google logos), so the concept roll was skipped on purpose, not for lack of a seed; there is no seed reference. Revisions after finish review: name leads (48pt, title 38pt), role word moved to the seal's top arc. The first, self-drawn symmetric colibrí was rejected by the user (2026-11-25) and replaced by the chapter's traced one; never redraw it. Second user pass (2026-11-25): coordinates line removed; title block reworked so the name clearly leads (one-line title, italic "Se otorga a", calmer paragraph). Third pass: "Colibrí de Nazca" caption and the faint Nazca lines removed; the colibrí became the large fading background and the text column widened from 436 to 556pt.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
