import { describe, expect, it } from "vitest";
import {
  attendeeCertificateId,
  checkinSource,
  manualCertificateId,
  personCertificateId,
} from "./certificateRecords";

const SAFE_ID = /^[a-zA-Z0-9_-]{1,100}$/;

describe("certificate ids", () => {
  it("are deterministic and fit validateParamId", () => {
    const slug = "a".repeat(100);
    const a = attendeeCertificateId(slug, "t_" + "9".repeat(98));
    expect(a).toBe(attendeeCertificateId(slug, "t_" + "9".repeat(98)));
    expect(a).toMatch(SAFE_ID);
    expect(personCertificateId(slug, "speaker", "x@y.com")).toMatch(SAFE_ID);
    expect(manualCertificateId("uuid", 3)).toMatch(SAFE_ID);
  });

  it("ignore email case and surrounding spaces", () => {
    expect(personCertificateId("devfest", "volunteer", " Ana@Mail.com ")).toBe(
      personCertificateId("devfest", "volunteer", "ana@mail.com")
    );
  });

  it("differ by kind, event and ticket", () => {
    const ids = new Set([
      personCertificateId("devfest", "volunteer", "ana@mail.com"),
      personCertificateId("devfest", "speaker", "ana@mail.com"),
      personCertificateId("io", "speaker", "ana@mail.com"),
      attendeeCertificateId("devfest", "t_1"),
      attendeeCertificateId("devfest", "t_2"),
      manualCertificateId("s1", 0),
      manualCertificateId("s1", 1),
    ]);
    expect(ids.size).toBe(7);
  });
});

describe("checkinSource", () => {
  const ts = { toMillis: () => 1 };

  it.each([
    [{ checkedIn: true, bevyCheckinAt: null }, "panel"],
    [{ checkedIn: false, bevyCheckinAt: ts }, "bevy"],
    [{ bevyCheckinAt: ts }, "bevy"],
    [{ checkedIn: true, bevyCheckinAt: ts }, "both"],
    [{ checkedIn: false, bevyCheckinAt: null }, null],
    [{}, null],
    [{ checkedIn: "true" }, null],
  ])("%j -> %s", (row, expected) => {
    expect(checkinSource(row)).toBe(expected);
  });
});
