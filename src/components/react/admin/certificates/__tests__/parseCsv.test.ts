import { describe, expect, it } from "vitest";
import { EMAIL_RE, parseCsv } from "../parseCsv";

describe("parseCsv — real fdata.csv shape (email,firstName,LastName)", () => {
  it("joins firstName and LastName into a single name", () => {
    const text = [
      "email,firstName,LastName",
      "bekerantes@gmail.com,Aaron Bequer,Ayquipa Paucar",
      "u23323565@utp.edu.pe,Abel,Champe",
      "adrianchoy04@gmail.com,Adrian,Choy Flores",
    ].join("\n");
    expect(parseCsv(text)).toEqual([
      { name: "Aaron Bequer Ayquipa Paucar", email: "bekerantes@gmail.com" },
      { name: "Abel Champe", email: "u23323565@utp.edu.pe" },
      { name: "Adrian Choy Flores", email: "adrianchoy04@gmail.com" },
    ]);
  });

  it("preserves diacritics in names", () => {
    const text = [
      "email,firstName,LastName",
      "adriseffh@gmail.com,Adrián Yusef,Fajardo Huamaní",
    ].join("\n");
    const [r] = parseCsv(text);
    expect(r.name).toBe("Adrián Yusef Fajardo Huamaní");
    expect(r.email).toBe("adriseffh@gmail.com");
  });

  it("does not duplicate-skip — every distinct row is returned", () => {
    const text = [
      "email,firstName,LastName",
      "a@x.com,Ana,Lopez",
      "b@x.com,Bob,Soto",
      "c@x.com,Cris,Mendez",
    ].join("\n");
    expect(parseCsv(text)).toHaveLength(3);
  });
});

describe("parseCsv — header detection", () => {
  it("detects 'email' header", () => {
    const out = parseCsv("email,name\na@x.com,Ana");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });

  it("detects 'correo' header (Spanish)", () => {
    const out = parseCsv("correo,nombre\na@x.com,Ana");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });

  it("detects 'nombre' header alone", () => {
    const out = parseCsv("nombre,correo\nAna,a@x.com");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });

  it("detects 'firstName' header (contains 'name')", () => {
    const out = parseCsv("firstName,LastName,email\nAna,Lopez,a@x.com");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("treats first row as data when no header keyword present", () => {
    const out = parseCsv("Ana,a@x.com\nBob,b@x.com");
    expect(out).toEqual([
      { name: "Ana", email: "a@x.com" },
      { name: "Bob", email: "b@x.com" },
    ]);
  });
});

describe("parseCsv — column order tolerance", () => {
  it("handles name,email order", () => {
    const out = parseCsv("nombre,email\nAna Lopez,a@x.com");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("handles email,name order", () => {
    const out = parseCsv("email,nombre\na@x.com,Ana Lopez");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("handles email in the middle column", () => {
    const out = parseCsv("first,email,last\nAna,a@x.com,Lopez");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });
});

describe("parseCsv — separators", () => {
  it("parses comma-separated", () => {
    const out = parseCsv("email,name\na@x.com,Ana");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });

  it("parses semicolon-separated (common in Excel ES locale)", () => {
    const out = parseCsv("email;name\na@x.com;Ana Lopez");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("parses tab-separated (TSV)", () => {
    const out = parseCsv("email\tname\na@x.com\tAna Lopez");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });
});

describe("parseCsv — line endings & whitespace", () => {
  it("handles CRLF line endings", () => {
    const out = parseCsv("email,name\r\na@x.com,Ana\r\nb@x.com,Bob");
    expect(out).toEqual([
      { name: "Ana", email: "a@x.com" },
      { name: "Bob", email: "b@x.com" },
    ]);
  });

  it("skips blank lines", () => {
    const out = parseCsv("email,name\n\na@x.com,Ana\n\n\nb@x.com,Bob\n");
    expect(out).toHaveLength(2);
  });

  it("trims whitespace around cells", () => {
    const out = parseCsv("email,name\n  a@x.com  ,  Ana Lopez  ");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("collapses internal multi-spaces when joining name parts", () => {
    const out = parseCsv("email,firstName,LastName\na@x.com,  Ana  ,  Lopez  ");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });
});

describe("parseCsv — edge cases", () => {
  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n\n")).toEqual([]);
  });

  it("returns empty array when only a header is present", () => {
    expect(parseCsv("email,name")).toEqual([]);
  });

  it("skips rows with fewer than 2 columns", () => {
    const out = parseCsv("email,name\na@x.com,Ana\nlonely\n,emptyfirst");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });

  it("accepts emails with plus tags, dots, and subdomains", () => {
    const out = parseCsv(
      [
        "email,name",
        "u+tag@gmail.com,Plus User",
        "name.surname@mail.utp.edu.pe,Dotted User",
        "U23323565@UTP.EDU.PE,Upper Case",
      ].join("\n")
    );
    expect(out).toEqual([
      { name: "Plus User", email: "u+tag@gmail.com" },
      { name: "Dotted User", email: "name.surname@mail.utp.edu.pe" },
      { name: "Upper Case", email: "U23323565@UTP.EDU.PE" },
    ]);
  });

  it("falls back to last column as email when no cell matches the email regex", () => {
    // Both columns lack '@' — parser cannot detect an email, but the caller's
    // validation will flag the row as invalid. We still want the parser to
    // produce a row so the user can see and fix it, not silently drop it.
    const out = parseCsv("nombre,correo\nAna Lopez,not-an-email");
    expect(out).toEqual([{ name: "Ana Lopez", email: "not-an-email" }]);
    expect(EMAIL_RE.test(out[0].email)).toBe(false);
  });

  it("does not skip a row just because the email lives in the first column", () => {
    const out = parseCsv("a@x.com,Ana,Lopez");
    expect(out).toEqual([{ name: "Ana Lopez", email: "a@x.com" }]);
  });

  it("handles 4+ columns by joining all non-email cells as the name", () => {
    const out = parseCsv("email,title,first,last\na@x.com,Ing.,Ana,Lopez");
    expect(out).toEqual([{ name: "Ing. Ana Lopez", email: "a@x.com" }]);
  });

  it("treats rows where every cell is whitespace as empty and skips them", () => {
    const out = parseCsv("email,name\n , \na@x.com,Ana");
    expect(out).toEqual([{ name: "Ana", email: "a@x.com" }]);
  });
});

describe("EMAIL_RE — sanity check", () => {
  it.each([
    ["a@b.co", true],
    ["user+tag@gmail.com", true],
    ["user.name@mail.utp.edu.pe", true],
    ["U@X.CO", true],
    ["plainstring", false],
    ["no-at-sign.com", false],
    ["no-tld@example", false],
    ["spaces in@x.com", false],
    ["@x.com", false],
    ["a@.com", false],
  ])("matches %s -> %s", (input, expected) => {
    expect(EMAIL_RE.test(input)).toBe(expected);
  });
});
