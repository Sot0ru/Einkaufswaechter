import { extractTextFromPdfBytes } from "./pdf-brochure-parser";

export interface ReceiptFileExtractionResult {
  text: string;
  source: "pdf" | "text" | "ocr_image";
  confidence: number | null;
}

/**
 * Liest einen Kassenbon direkt im Browser aus einer Bilddatei (lokale Tesseract.js-OCR
 * ohne externe KI-API), einem E-Bon-PDF (z. B. Rewe eBon / Lidl Plus PDF) oder einer
 * Textdatei ein.
 */
export const extractReceiptTextFromFile = async (
  file: File,
  onProgress?: (statusText: string) => void,
): Promise<ReceiptFileExtractionResult> => {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
    onProgress?.("Lese Text aus E-Bon-PDF…");
    const buffer = await file.arrayBuffer();
    const text = await extractTextFromPdfBytes(new Uint8Array(buffer));
    return {
      text,
      source: "pdf",
      confidence: text.trim().length > 0 ? 100 : 0,
    };
  }

  if (lowerName.endsWith(".txt") || file.type === "text/plain") {
    onProgress?.("Lese Textdatei…");
    const text = await file.text();
    return {
      text,
      source: "text",
      confidence: 100,
    };
  }

  // Bilddatei (Foto vom Papier-Kassenbon): lokale WebAssembly-OCR im Browser
  onProgress?.("Starte lokale Texterkennung (Deutsch) im Browser…");
  const tesseract = await import("tesseract.js");
  const result = await tesseract.recognize(file, "deu", {
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        onProgress?.(`Erkenne Kassenbon-Text (${Math.round(message.progress * 100)} %)…`);
      } else if (message.status === "loading language traineddata") {
        onProgress?.("Lade deutsches OCR-Wörterbuch…");
      }
    },
  });

  return {
    text: result.data.text.trim(),
    source: "ocr_image",
    confidence: Math.round(result.data.confidence ?? 0),
  };
};
