import "server-only";
import PDFDocument from "pdfkit";
import { type Block, type GeneratedDoc, runText } from "./templates";

const W = 595.28, H = 841.89, M = 64;
const C = { ink: "#14212E", muted: "#5A6B7D", line: "#D3DAE2", brand: "#1F5FAE" };

// characters outside the PDF's built-in font would print as stray symbols
const clean = (v: string) => v.replace(/\r\n?/g, "\n").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\n\x20-\x7E -ÿ–—•]/g, "");

/** A4 PDF of a generated document. */
export function renderPdf(doc: GeneratedDoc, author: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: "A4", margins: { top: M, bottom: M, left: M, right: M }, info: { Title: doc.title, Author: author } });
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);

    const width = W - 2 * M;
    pdf.font("Helvetica").fontSize(8).fillColor(C.muted).text(clean(`Ref: ${doc.ref}`), M, M - 28, { width, align: "right" });
    pdf.y = M;
    const ensure = (h: number) => {
      if (pdf.y + h > H - M) pdf.addPage();
    };

    for (const b of doc.blocks) block(b);
    pdf.end();

    function block(b: Block) {
      pdf.x = M;
      switch (b.t) {
        case "title":
          ensure(40);
          pdf.moveDown(0.4).font("Helvetica-Bold").fontSize(13).fillColor(C.ink).text(clean(runText(b.runs)), { width, align: "center" }).moveDown(0.6);
          break;
        case "h":
          ensure(40);
          pdf.moveDown(0.5).font("Helvetica-Bold").fontSize(10.5).fillColor(C.ink).text(clean(runText(b.runs)), { width }).moveDown(0.25);
          break;
        case "p":
          pdf.font("Times-Roman").fontSize(10.5).fillColor(C.ink).text(clean(runText(b.runs)), { width, align: "justify", lineGap: 2 }).moveDown(0.5);
          break;
        case "note":
          pdf.font("Helvetica-Oblique").fontSize(8.5).fillColor(C.muted).text(clean(runText(b.runs)), { width }).moveDown(0.5);
          break;
        case "list":
          for (const it of b.items) pdf.font("Times-Roman").fontSize(10.5).fillColor(C.ink).text(clean(`•  ${runText(it)}`), M + 10, undefined, { width: width - 10, lineGap: 2 }).moveDown(0.25);
          pdf.moveDown(0.3);
          break;
        case "table": {
          const n = b.head.length;
          const first = n > 3 ? 0.18 : 0.5;
          const widths = b.head.map((_, i) => (i === 0 ? width * first : (width * (1 - first)) / (n - 1)));
          if (n === 5) widths.splice(0, 5, width * 0.13, width * 0.42, width * 0.13, width * 0.18, width * 0.14);
          const row = (cells: string[], bold = false, rule = false) => {
            const hs = cells.map((c, i) => pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).heightOfString(clean(c), { width: widths[i] - 6 }));
            const h = Math.max(...hs) + 8;
            ensure(h);
            const y = pdf.y;
            let x = M;
            cells.forEach((c, i) => {
              pdf.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(C.ink).text(clean(c), x + 3, y + 4, { width: widths[i] - 6, align: b.align?.[i] === "r" ? "right" : "left" });
              x += widths[i];
            });
            pdf.moveTo(M, y + h).lineTo(M + width, y + h).lineWidth(rule ? 1 : 0.5).strokeColor(rule ? C.ink : C.line).stroke();
            pdf.y = y + h;
          };
          row(b.head, true, true);
          for (const r of b.rows) row(r);
          if (b.total) row(b.total, true, true);
          pdf.x = M;
          pdf.moveDown(0.8);
          break;
        }
        case "sign":
          ensure(70);
          pdf.moveDown(1.2);
          pdf.moveTo(M, pdf.y + 18).lineTo(M + 180, pdf.y + 18).lineWidth(0.5).strokeColor(C.muted).stroke();
          pdf.y += 24;
          b.lines.forEach((l, i) => pdf.font(i === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(9.5).fillColor(i === 0 ? C.ink : C.muted).text(clean(runText(l)), M, undefined, { width }));
          pdf.moveDown(0.6);
          break;
      }
    }
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The same document as HTML, which Word opens and edits as a .doc. */
export function renderWord(doc: GeneratedDoc) {
  const r = (runs: Parameters<typeof runText>[0]) => esc(runText(runs));
  const body = doc.blocks
    .map((b) => {
      switch (b.t) {
        case "title":
          return `<h1>${r(b.runs)}</h1>`;
        case "h":
          return `<h2>${r(b.runs)}</h2>`;
        case "p":
          return `<p>${r(b.runs)}</p>`;
        case "note":
          return `<p class="note">${r(b.runs)}</p>`;
        case "list":
          return `<ul>${b.items.map((i) => `<li>${r(i)}</li>`).join("")}</ul>`;
        case "table":
          return `<table><thead><tr>${b.head.map((h, i) => `<th${b.align?.[i] === "r" ? ' class="r"' : ""}>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows
            .map((row) => `<tr>${row.map((c, i) => `<td${b.align?.[i] === "r" ? ' class="r"' : ""}>${esc(c)}</td>`).join("")}</tr>`)
            .join("")}${b.total ? `<tr class="total">${b.total.map((c, i) => `<td${b.align?.[i] === "r" ? ' class="r"' : ""}>${esc(c)}</td>`).join("")}</tr>` : ""}</tbody></table>`;
        case "sign":
          return `<div class="sign"><p>________________________</p>${b.lines.map((l, i) => `<p${i === 0 ? ' class="b"' : ""}>${r(l)}</p>`).join("")}</div>`;
      }
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>
body{font-family:"Times New Roman",serif;font-size:11pt;color:#14212E;line-height:1.45}
h1{font-family:Arial,sans-serif;font-size:14pt;text-align:center;margin:18pt 0 12pt}
h2{font-family:Arial,sans-serif;font-size:11pt;margin:12pt 0 4pt}
table{border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:9pt;margin:6pt 0 12pt}
th,td{border-bottom:1px solid #D3DAE2;padding:4pt;text-align:left}th{border-bottom:1.5px solid #14212E}
.r{text-align:right}.total td{font-weight:bold;border-top:1.5px solid #14212E}
.note{font-family:Arial,sans-serif;font-size:8.5pt;color:#5A6B7D;font-style:italic}
.sign{margin-top:24pt;font-family:Arial,sans-serif;font-size:10pt}.sign p{margin:0}.b{font-weight:bold}
.ref{font-family:Arial,sans-serif;font-size:8pt;color:#5A6B7D;text-align:right}
</style></head><body><p class="ref">Ref: ${esc(doc.ref)}</p>${body}</body></html>`;
}
