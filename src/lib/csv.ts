// Minimal RFC-4180 CSV: quoted fields, embedded quotes doubled, newlines allowed inside
// quotes. Hand-rolled because the KB import/export needs exactly this much and a parser
// dependency is a supply-chain surface the platform doesn't want.

export function toCsv(rows: string[][]): string {
  const escape = (field: string) =>
    /[",\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
  return rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}
