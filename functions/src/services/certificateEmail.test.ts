import { describe, expect, it, vi } from "vitest";

vi.mock("firebase-functions/params", () => ({
  defineSecret: (name: string) => ({ name, value: () => "" }),
}));

import { buildCertificateEmail } from "./certificateEmail";

const base = {
  kind: "attendee" as const,
  to: "ana@mail.com",
  recipientName: "Ana Torres",
  eventName: "DevFest Ica 2026",
  pdf: new Uint8Array([37, 80, 68, 70]),
};

describe("buildCertificateEmail", () => {
  it("names the certificate and the event", () => {
    const mail = buildCertificateEmail(base);
    expect(mail.subject).toBe(
      "Tu certificado de participación — DevFest Ica 2026"
    );
    expect(mail.text).toContain("Hola Ana Torres");
    expect(mail.attachments?.[0]).toMatchObject({
      filename: "certificado-participacion-devfest-ica-2026.pdf",
      contentType: "application/pdf",
    });
  });

  it("uses each kind's own wording and file name", () => {
    const volunteer = buildCertificateEmail({ ...base, kind: "volunteer" });
    expect(volunteer.subject).toContain("de voluntariado");
    expect(volunteer.attachments?.[0].filename).toMatch(
      /^certificado-voluntariado-/
    );
    const speaker = buildCertificateEmail({ ...base, kind: "speaker" });
    expect(speaker.text).toContain("compartir tu conocimiento");
  });

  it("cannot be used to inject headers", () => {
    const mail = buildCertificateEmail({
      ...base,
      eventName: "DevFest\r\nBcc: victim@x.com",
      to: "ana@mail.com\r\nBcc: x@y.com",
    });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.to).not.toMatch(/[\r\n]/);
  });

  it("escapes markup in the HTML body", () => {
    const mail = buildCertificateEmail({
      ...base,
      recipientName: '<a href="https://evil">Ana</a>',
    });
    expect(mail.html).not.toContain("<a href");
    expect(mail.html).toContain("&lt;a href=&quot;https://evil&quot;&gt;");
  });

  it("falls back to a generic file name for a name with no ASCII", () => {
    const mail = buildCertificateEmail({ ...base, eventName: "日本" });
    expect(mail.attachments?.[0].filename).toBe(
      "certificado-participacion-gdg-ica.pdf"
    );
  });
});
