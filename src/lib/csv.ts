// CSV reading shared by the panel's importers.

/**
 * Splits CSV text into rows of raw cells, per RFC 4180: double-quoted
 * fields, "" as an escaped quote, and delimiters/newlines inside quotes.
 */
export function tokenizeCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Excel and some Bevy exports prepend a UTF-8 BOM, which would
  // otherwise become part of the first header name and break lookup.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        // Note: a \r or \n here is real content, not a row break.
        field += c;
        i++;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
      i++;
    } else if (c === "\n") {
      endRow();
      i++;
    } else if (c === "\r") {
      // Break the row here and swallow a following \n, so CRLF, LF and a
      // lone CR all behave. Treating \r as filler collapsed a CR-only file
      // (some Excel export paths still emit them) into a single row, and
      // the organizer got "faltan columnas obligatorias" — a message
      // pointing at entirely the wrong cause.
      endRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else {
      field += c;
      i++;
    }
  }

  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * The delimiter of a CSV, guessed from its first line: Excel set to
 * Spanish saves with ";", some tools export tabs. Counts only outside
 * quotes, so "Torres, Ana" in a quoted cell does not vote for ",".
 */
export function detectDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (c === "\n" || c === "\r")) break;
    else if (!inQuotes && c in counts) counts[c as keyof typeof counts]++;
  }
  const [best] = (
    Object.entries(counts) as [keyof typeof counts, number][]
  ).sort((a, b) => b[1] - a[1]);
  return best[1] > 0 ? best[0] : ",";
}
