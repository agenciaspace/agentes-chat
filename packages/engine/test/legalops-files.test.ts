import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { extractLegalFile } from "../src/legalops-files";

const sentence = "O contrato dura doze meses e exige revisao humana.";
const encoded = (bytes: string | Uint8Array) => Buffer.from(bytes).toString("base64");

test("legal documents: TXT and DOCX retain paragraph text and decode XML safely", async () => {
  expect(await extractLegalFile("minuta.txt", encoded(sentence))).toBe(sentence);
  const docx = zipSync({
    "word/document.xml": strToU8(
      `<w:document><w:body><w:p><w:r><w:t>${sentence}</w:t></w:r></w:p><w:p><w:r><w:t>Clausula &amp; modelo.</w:t></w:r></w:p></w:body></w:document>`,
    ),
    "word/unused.xml": strToU8("not read"),
  });
  expect(await extractLegalFile("minuta.docx", encoded(docx))).toBe(`${sentence}\nClausula & modelo.`);
});

test("legal documents: rejects unsupported formats, empty extraction, oversized input and entities", async () => {
  await expect(extractLegalFile("macro.docm", encoded(sentence))).rejects.toThrow();
  await expect(extractLegalFile("empty.txt", encoded("tiny"))).rejects.toThrow();
  await expect(extractLegalFile("huge.txt", "A".repeat(5592412))).rejects.toThrow();
  const docx = zipSync({
    "word/document.xml": strToU8('<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]><w:t>&ext;</w:t>'),
  });
  await expect(extractLegalFile("unsafe.docx", encoded(docx))).rejects.toThrow();
  const bomb = zipSync({ "word/document.xml": new Uint8Array(5 * 1024 * 1024) });
  await expect(extractLegalFile("expanded.docx", encoded(bomb))).rejects.toThrow();
});

test("legal documents: extracts selectable text from a real PDF", async () => {
  const stream = `BT /F1 12 Tf 40 700 Td (${sentence}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [i, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  expect(await extractLegalFile("minuta.pdf", encoded(pdf))).toContain(sentence);
});
