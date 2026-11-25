import { extractRawOffersFromDocument } from "./chain-scrapers";
import type { StoreId } from "@/lib/rules/catalog";

const latin1Decoder = new TextDecoder("latin1");

const inflateBytes = async (compressed: Uint8Array): Promise<Uint8Array | null> => {
  if (typeof DecompressionStream === "undefined") return null;

  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const ds = new DecompressionStream(format);
      const writer = ds.writable.getWriter();
      const copy = new Uint8Array(compressed.byteLength);
      copy.set(compressed);
      void writer.write(copy).then(() => writer.close());

      const reader = ds.readable.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          totalLength += value.byteLength;
        }
      }
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return merged;
    } catch {
      // Nächstes Format probieren
    }
  }
  return null;
};

/**
 * Dekodiert einen PDF-Literal-String `( ... )` inkl. Escape-Sequenzen und WinAnsi-Umlauten.
 */
const decodePdfLiteralString = (raw: string): string => {
  let out = "";
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "n") {
        out += "\n";
        i++;
      } else if (next === "r") {
        out += " ";
        i++;
      } else if (next === "t") {
        out += " ";
        i++;
      } else if (next === "(" || next === ")" || next === "\\") {
        out += next;
        i++;
      } else if (/[0-7]/.test(next)) {
        const octal = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] ?? next;
        const code = Number.parseInt(octal, 8);
        // WinAnsi €-Zeichen liegt auf 0x80 (128)
        out += code === 0x80 ? "€" : String.fromCharCode(code);
        i += octal.length;
      } else {
        i++;
      }
    } else {
      const code = ch.charCodeAt(0);
      out += code === 0x80 ? "€" : ch;
    }
  }
  return out;
};

/**
 * Dekodiert einen PDF-Hex-String `<...>` (UTF-16BE mit BOM `FEFF` oder Latin-1/WinAnsi).
 */
const decodePdfHexString = (hexRaw: string): string => {
  const hex = hexRaw.replace(/\s+/g, "");
  if (hex.length < 2) return "";
  const bytes: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) {
    bytes.push(Number.parseInt(hex.slice(i, i + 2), 16));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  return bytes.map((b) => (b === 0x80 ? "€" : String.fromCharCode(b))).join("");
};

const extractStringsFromContentStream = (content: string): string[] => {
  const lines: string[] = [];
  const textBlocks = content.match(/BT[\s\S]*?ET/g) ?? [content];

  for (const block of textBlocks) {
    let currentLine = "";

    const flushLine = () => {
      const trimmed = currentLine.replace(/\s+/g, " ").trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
      currentLine = "";
    };

    // Tokenisiere String-Literale (...), Hex-Strings <...>, TJ-Arrays [...] und Zeilenumbrüche (Td/TD/T*/Tm)
    let i = 0;
    while (i < block.length) {
      const ch = block[i];
      if (ch === "(") {
        let depth = 1;
        let j = i + 1;
        while (j < block.length && depth > 0) {
          if (block[j] === "\\") {
            j += 2;
            continue;
          }
          if (block[j] === "(") depth++;
          else if (block[j] === ")") depth--;
          j++;
        }
        const literal = block.slice(i + 1, j - 1);
        currentLine += decodePdfLiteralString(literal);
        i = j;
        continue;
      }

      if (ch === "<" && block[i + 1] !== "<") {
        const end = block.indexOf(">", i + 1);
        if (end !== -1) {
          currentLine += decodePdfHexString(block.slice(i + 1, end));
          i = end + 1;
          continue;
        }
      }

      if (
        (block.startsWith("Td", i) ||
          block.startsWith("TD", i) ||
          block.startsWith("T*", i) ||
          block.startsWith("Tm", i)) &&
        (i === 0 || /[\s\d\].)]/.test(block[i - 1]))
      ) {
        flushLine();
        i += 2;
        continue;
      }

      i++;
    }

    flushLine();
  }

  return lines;
};

/**
 * Extrahiert lokal und ohne externe Abhängigkeiten Textzeilen aus einem PDF-Dokument
 * (unterstützt unkomprimierte sowie FlateDecode-komprimierte Content-Streams).
 * Funktioniert identisch im Browser (PWA) und in Node.js (Server/Tests).
 */
export const extractTextFromPdfBytes = async (pdfBytes: Uint8Array): Promise<string> => {
  const rawLatin1 = latin1Decoder.decode(pdfBytes);
  const extractedLines: string[] = [];

  // Alle PDF-Streams durchsuchen (stream ... endstream)
  const streamRegex = /<<([\s\S]{0,600}?)>>\s*stream\r?\n([\s\S]*?)endstream/g;
  let foundAnyStream = false;

  for (const match of rawLatin1.matchAll(streamRegex)) {
    foundAnyStream = true;
    const dict = match[1] ?? "";
    const streamBodyStart = match.index + match[0].indexOf("stream") + 6;
    const afterKeyword =
      pdfBytes[streamBodyStart] === 0x0d && pdfBytes[streamBodyStart + 1] === 0x0a
        ? streamBodyStart + 2
        : pdfBytes[streamBodyStart] === 0x0a || pdfBytes[streamBodyStart] === 0x0d
          ? streamBodyStart + 1
          : streamBodyStart;

    const streamEndInMatch = match[0].lastIndexOf("endstream");
    let rawEnd = match.index + streamEndInMatch;
    while (rawEnd > afterKeyword && (pdfBytes[rawEnd - 1] === 0x0a || pdfBytes[rawEnd - 1] === 0x0d)) {
      rawEnd--;
    }

    const slice = pdfBytes.slice(afterKeyword, rawEnd);
    const isFlate = /\/FlateDecode\b/.test(dict);
    let contentText = "";

    if (isFlate) {
      const inflated = await inflateBytes(slice);
      if (inflated) {
        contentText = latin1Decoder.decode(inflated);
      }
    } else {
      contentText = latin1Decoder.decode(slice);
    }

    if (contentText.includes("BT") || contentText.includes("Tj") || contentText.includes("TJ")) {
      extractedLines.push(...extractStringsFromContentStream(contentText));
    }
  }

  if (!foundAnyStream && rawLatin1.includes("BT")) {
    extractedLines.push(...extractStringsFromContentStream(rawLatin1));
  }

  // Aufeinanderfolgende kurze Fragmente sinnvoll bereinigen, aber klare Zeilen behalten
  const cleaned = extractedLines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);

  return cleaned.join("\n");
};

export interface ExtractedBrochureFileResult {
  text: string;
  fileType: "pdf" | "html" | "csv" | "text";
  lineCount: number;
}

/**
 * Verarbeitet hochgeladene Prospekt- und Produktfeed-Dateien (.pdf, .html, .csv, .tsv, .txt)
 * komplett lokal im Browser und liefert direkt für `parseBrochureText` aufbereitete Zeilen zurück.
 */
export const extractBrochureTextFromFile = async (params: {
  fileName: string;
  bytes: Uint8Array;
  storeId: StoreId;
}): Promise<ExtractedBrochureFileResult> => {
  const lower = params.fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    const text = await extractTextFromPdfBytes(params.bytes);
    const lineCount = text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
    return { text, fileType: "pdf", lineCount };
  }

  const decoded = new TextDecoder("utf-8").decode(params.bytes);

  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) {
    const { parseStructuredCsvProductFeed, formatFeedOffersAsBrochureText } = await import(
      "./product-feed-parser"
    );
    const parsed = parseStructuredCsvProductFeed(decoded, {
      fallbackStoreId: params.storeId,
    });
    if (parsed.parsedOffers.length > 0) {
      const text = formatFeedOffersAsBrochureText(parsed.parsedOffers);
      return { text, fileType: "csv", lineCount: parsed.parsedOffers.length };
    }
  }

  if (lower.endsWith(".html") || lower.endsWith(".htm") || decoded.trimStart().startsWith("<")) {
    const { rawOffers } = extractRawOffersFromDocument(decoded, params.storeId);
    if (rawOffers.length > 0) {
      const lines = rawOffers.map((offer) => {
        const priceStr = (offer.priceCents / 100).toFixed(2).replace(".", ",");
        const loyaltyPart =
          offer.loyaltyPriceCents != null
            ? ` (Mit App ${(offer.loyaltyPriceCents / 100).toFixed(2).replace(".", ",")} €)`
            : "";
        const dayPart = offer.validityWindow === "do_sa" ? " ab Donnerstag" : "";
        return `${offer.title} ${offer.description}${dayPart} ${priceStr} €${loyaltyPart}`.replace(
          /\s+/g,
          " ",
        );
      });
      return { text: lines.join("\n"), fileType: "html", lineCount: lines.length };
    }
  }

  const lineCount = decoded.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  return { text: decoded, fileType: "text", lineCount };
};
