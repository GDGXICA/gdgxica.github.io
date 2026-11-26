import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EMAIL_RE } from "../../../src/lib/email";

// The panel validates emails before sending a batch; the API validates
// them again with zod. If the panel's check is looser, one bad row makes
// the server reject the whole batch. This pins the two together.

const server = z.string().email();

const SAMPLES = [
  "ana@mail.com",
  "ana.torres+gdg@mail.co",
  "o'brien@mail.ie",
  "a_b-c@sub.domain.pe",
  "ANA@MAIL.COM",
  "josé@mail.com",
  "ana@mail.c",
  "ana@mail.com.",
  "<ana@mail.com>",
  '"ana@mail.com"',
  "ana@@mail.com",
  "ana mail@mail.com",
  "ana@-mail.com",
  ".ana@mail.com",
  "ana.@mail.com",
  "ana@mail",
  "",
];

describe("email validation parity", () => {
  it.each(SAMPLES)("client and server agree on %j", (sample) => {
    expect(EMAIL_RE.test(sample)).toBe(server.safeParse(sample).success);
  });
});
