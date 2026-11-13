/** Parses CSV text (quoted fields, "" escapes, CRLF) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((x) => x.trim()));
}

/** "1,234", "(1,234)", "-1234.50" → whole units; credits in brackets come back negative. */
export function parseAmount(v: string | undefined): bigint {
  const t = (v ?? "").trim();
  if (!t || t === "-") return 0n;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const digits = t.replace(/[^0-9.]/g, "");
  if (!digits) return 0n;
  const n = BigInt(Math.round(Number(digits)));
  return neg ? -n : n;
}
