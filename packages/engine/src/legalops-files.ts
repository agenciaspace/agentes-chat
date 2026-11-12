import { XMLParser } from "fast-xml-parser";
import { unzipSync } from "fflate";
import { ValidationError } from "./errors";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TEXT = 150000;

/** Bounded extraction, no macros, external entities, remote assets or image OCR. Originals stay with the organization. */
export async function extractLegalFile(name: string, base64: string): Promise<string> {
  if (base64.length > Math.ceil(MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))
    throw new ValidationError("Use um arquivo de até 4 MB.");
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (!bytes.length || bytes.length > MAX_BYTES) throw new ValidationError("Use um arquivo de até 4 MB.");
  let text = "";
  try {
    if (/\.(txt|md)$/i.test(name)) {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } else if (/\.docx$/i.test(name)) {
      const files = unzipSync(bytes, {
        filter: (file) => {
          if (file.name !== "word/document.xml") return false;
          if (file.originalSize > MAX_BYTES) throw new Error("expanded_document_too_large");
          return true;
        },
      });
      const xmlBytes = files["word/document.xml"];
      if (!xmlBytes || xmlBytes.length > MAX_BYTES) throw new Error("missing_document");
      const xml = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("external_entities");
      const tree: unknown = new XMLParser({ preserveOrder: true, ignoreAttributes: true, parseTagValue: false }).parse(
        xml,
      );
      const parts: string[] = [];
      const walk = (node: unknown, inText = false) => {
        if (Array.isArray(node)) for (const item of node) walk(item, inText);
        else if (node && typeof node === "object")
          for (const [key, value] of Object.entries(node)) {
            if (key === "#text" && inText) parts.push(String(value));
            else if (key !== "#text") {
              walk(value, inText || key === "w:t");
              if (key === "w:p" || key === "w:br") parts.push("\n");
              if (key === "w:tab") parts.push("\t");
            }
          }
      };
      walk(tree);
      text = parts.join("");
    } else if (/\.pdf$/i.test(name)) {
      // The legacy build works in Bun without a browser window; extraction never renders pages.
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const task = getDocument({ data: bytes, useSystemFonts: false, stopAtErrors: true });
      try {
        const doc = await task.promise;
        if (doc.numPages > 100) throw new Error("too_many_pages");
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          text += `${content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("")}\n`;
          if (text.length > MAX_TEXT) throw new Error("too_much_text");
          page.cleanup();
        }
      } finally {
        await task.destroy();
      }
    } else {
      throw new ValidationError("Use PDF com texto, DOCX, TXT ou Markdown.");
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(
      "Não foi possível extrair o texto. Use um PDF sem senha e com texto selecionável, DOCX ou TXT.",
    );
  }
  text = text.trim();
  if (text.length < 20 || text.length > MAX_TEXT || text.includes("\u0000"))
    throw new ValidationError(
      "O texto deve ter entre 20 e 150.000 caracteres. PDFs digitalizados precisam de OCR antes da importação.",
    );
  return text;
}
