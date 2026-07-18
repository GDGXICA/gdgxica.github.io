import { describe, expect, it } from "vitest";
import { buildSearchTokens } from "../../../../../../functions/src/services/nameMatch";
import { normalizeQuery, queryTerms } from "../CheckinPanel";

// The panel and the import handler live on opposite sides of the wire but
// must agree on normalization: the handler builds searchTokens, the panel
// matches against them. These tests pin that contract, because a mismatch
// fails silently — the attendee is simply never found, with no error.

/** Same predicate the panel applies to each attendee. */
function finds(query: string, tokens: string[]): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  return terms.every((t) => tokens.some((tok) => tok.startsWith(t)));
}

const attendee = (over: Partial<Parameters<typeof buildSearchTokens>[0]> = {}) =>
  buildSearchTokens({
    firstName: "Alex Alberto",
    lastName: "Quintanilla Garcia",
    email: "wcandry@gmail.com",
    ticketNumber: "GOOGA263171317",
    ...over,
  });

describe("door search — the ways a volunteer actually types", () => {
  it("finds by first name", () => {
    expect(finds("alex", attendee())).toBe(true);
  });

  it("finds by surname alone", () => {
    expect(finds("quintanilla", attendee())).toBe(true);
  });

  it("finds by partial prefixes across both names", () => {
    expect(finds("qui gar", attendee())).toBe(true);
  });

  it("is order-independent", () => {
    expect(finds("garcia alex", attendee())).toBe(true);
  });

  it("finds by full email", () => {
    expect(finds("wcandry@gmail.com", attendee())).toBe(true);
  });

  it("finds by email local part", () => {
    expect(finds("wcandry", attendee())).toBe(true);
  });

  it("finds by ticket number, case-insensitively", () => {
    expect(finds("googa263171317", attendee())).toBe(true);
    expect(finds("GOOGA263171317", attendee())).toBe(true);
  });

  it("rejects someone who does not match", () => {
    expect(finds("rodriguez", attendee())).toBe(false);
  });
});

describe("door search — accents", () => {
  const maria = attendee({
    firstName: "María",
    lastName: "Ñañez Solís",
    email: "maria@x.com",
  });

  it("finds an accented name typed without accents", () => {
    expect(finds("maria", maria)).toBe(true);
    expect(finds("nanez", maria)).toBe(true);
    expect(finds("solis", maria)).toBe(true);
  });

  it("still finds it when typed with accents", () => {
    expect(finds("Ñañez", maria)).toBe(true);
    expect(finds("Solís", maria)).toBe(true);
  });
});

describe("door search — punctuation must not split the two sides apart", () => {
  const hyphenated = attendee({
    firstName: "Ana",
    lastName: "Quintanilla-Garcia",
    email: "ana@x.com",
  });

  // Regression: normalizeQuery used to keep "-", producing the single term
  // "quintanilla-garcia". buildSearchTokens splits on it, so the stored
  // tokens are ["quintanilla", "garcia"] and neither is prefixed by that
  // term — typing the surname exactly as registered found nobody.
  it("finds a hyphenated surname typed with the hyphen", () => {
    expect(finds("quintanilla-garcia", hyphenated)).toBe(true);
  });

  it("finds the same surname typed with a space", () => {
    expect(finds("quintanilla garcia", hyphenated)).toBe(true);
  });

  it("handles an apostrophe", () => {
    const obrien = attendee({ firstName: "Sean", lastName: "O'Brien" });
    expect(finds("o'brien", obrien)).toBe(true);
    expect(finds("brien", obrien)).toBe(true);
  });
});

describe("door search — particles and initials the server strips", () => {
  const juan = attendee({
    firstName: "Juan",
    lastName: "de la Cruz Rojas",
    email: "juan@x.com",
  });

  // Regression: nameTokens() drops particles when building searchTokens,
  // so no stored token starts with "de" or "la". Since every term has to
  // match, keeping them in the query made the full name find nobody —
  // exactly what a volunteer reading off an ID would type.
  it("finds someone whose full name is typed with its particles", () => {
    expect(finds("juan de la cruz", juan)).toBe(true);
  });

  it("finds them by the significant parts alone", () => {
    expect(finds("cruz rojas", juan)).toBe(true);
  });

  it("ignores a middle initial, which is never tokenized", () => {
    const ana = attendee({ firstName: "Ana M", lastName: "Lopez" });
    expect(finds("ana m lopez", ana)).toBe(true);
  });

  it("treats a query of only particles as no filter at all", () => {
    expect(queryTerms("de la")).toEqual([]);
  });

  it("still rejects a genuine non-match", () => {
    expect(finds("de la cruz mendoza", juan)).toBe(false);
  });
});

describe("normalizeQuery", () => {
  it("collapses whitespace and lowercases", () => {
    expect(normalizeQuery("  ALEX   Alberto ")).toBe("alex alberto");
  });

  it("keeps @ and . so a full email survives", () => {
    expect(normalizeQuery("WCandry@Gmail.com")).toBe("wcandry@gmail.com");
  });

  it("turns other punctuation into separators, matching the server", () => {
    expect(normalizeQuery("Quintanilla-Garcia")).toBe("quintanilla garcia");
  });

  it("returns empty for a blank query", () => {
    expect(normalizeQuery("   ")).toBe("");
  });
});
