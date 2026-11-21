"use client";

import { useEffect, useRef, useState } from "react";
import {
  type BarcodeProductInfo,
  DEMO_BARCODE_PRODUCTS,
  evaluateBarcodePriceShrinkflation,
  isValidBarcode,
  lookupBarcodeProduct,
  normalizeBarcode,
} from "@/lib/providers/barcode-lookup";
import {
  CATEGORIES,
  CATEGORY_MAP,
  DEPARTMENTS,
  STORE_MAP,
  STORES,
  type BaseUnit,
  type StoreId,
} from "@/lib/rules/catalog";
import { formatEuroCents } from "@/lib/rules/optimizer";
import { ShrinkflationAlert } from "./PriceBadges";
import { cn, PRIMARY_BUTTON, SECONDARY_BUTTON, ToggleChip } from "./ui";

export interface BarcodeSavePayload {
  barcode: string;
  productName: string;
  brand: string | null;
  quantityText: string | null;
  packageAmount: number | null;
  packageUnit: BaseUnit | null;
  categoryId: string;
  storeId: StoreId;
  priceCents: number;
  isOffer: boolean;
}

interface BarcodeScannerPanelProps {
  defaultStoreId: StoreId;
  activeZipCode: string;
  onSaveBarcodePrice: (payload: BarcodeSavePayload) => Promise<void> | void;
  feedback: string | null;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => NativeBarcodeDetector;

const parseEuroInputToCents = (raw: string): number | null => {
  const cleaned = raw.trim().replace(/[€\s]/g, "").replace(",", ".");
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value) || value < 0.1 || value > 500) return null;
  return Math.round(value * 100);
};

export const BarcodeScannerPanel = ({
  defaultStoreId,
  activeZipCode,
  onSaveBarcodePrice,
  feedback,
}: BarcodeScannerPanelProps) => {
  const [barcodeInput, setBarcodeInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [product, setProduct] = useState<BarcodeProductInfo | null>(null);

  const [selectedStoreId, setSelectedStoreId] = useState<StoreId>(defaultStoreId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [priceInput, setPriceInput] = useState<string>("");
  const [isOffer, setIsOffer] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Kamera-Scanner Zustand
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const stopCamera = () => {
    if (scanTimerRef.current != null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const performLookup = async (rawCode: string) => {
    const normalized = normalizeBarcode(rawCode);
    setBarcodeInput(normalized);
    if (!isValidBarcode(normalized)) {
      setLookupMessage(
        "Ungültige EAN/GTIN-Prüfziffer. Gib eine gültige 8- bis 14-stellige Barcode-Nummer ein.",
      );
      setProduct(null);
      return;
    }

    setIsSearching(true);
    setLookupMessage(null);

    try {
      // 1. Erst über Server-API (mit DB-Cache + Open Food Facts)
      const response = await fetch(`/api/v1/barcode?code=${encodeURIComponent(normalized)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.product) {
          applyFoundProduct(data.product as BarcodeProductInfo);
          return;
        }
      }
    } catch {
      // Offline / PWA: direkter Client-Lookup (Open Food Facts + Offline-Demo)
    } finally {
      setIsSearching(false);
    }

    const clientFound = await lookupBarcodeProduct(normalized);
    if (clientFound) {
      applyFoundProduct(clientFound);
    } else {
      setProduct({
        barcode: normalized,
        productName: `Unbekanntes Produkt (${normalized})`,
        brand: null,
        quantityText: null,
        packageAmount: null,
        packageUnit: null,
        categoryId: null,
        categoryName: null,
        source: "offline_demo",
        shrinkflationNote: null,
      });
      setSelectedCategoryId("");
      setLookupMessage(
        "Barcode nicht in Open Food Facts gefunden. Du kannst Kategorie und Preis trotzdem manuell zuordnen.",
      );
    }
  };

  const applyFoundProduct = (found: BarcodeProductInfo) => {
    setProduct(found);
    setSelectedCategoryId(found.categoryId ?? "");
    const defaultCents = found.categoryId
      ? CATEGORY_MAP[found.categoryId]?.defaultBasePrices[selectedStoreId]?.priceCents
      : undefined;
    if (defaultCents) {
      setPriceInput((defaultCents / 100).toFixed(2).replace(".", ","));
    }
    const sourceLabel =
      found.source === "open_food_facts"
        ? "Open Food Facts"
        : found.source === "db_cache"
          ? "lokaler Cache"
          : "Offline-Referenz";
    setLookupMessage(`Produkt erkannt über ${sourceLabel}.`);
  };

  const startCameraScan = async () => {
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
      .BarcodeDetector;
    if (!Detector) {
      setCameraStatus(
        "Dieser Browser unterstützt keinen nativen Kamera-Barcode-Scanner. Tippe die EAN-Nummer unten einfach ab oder nutze Chrome/Android.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("Kamera-Zugriff ist in diesem Browser (oder ohne HTTPS) nicht verfügbar.");
      return;
    }

    try {
      setCameraStatus("Kamera wird gestartet…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCameraActive(true);
      setCameraStatus("Halte den Barcode (EAN-13 / EAN-8) ruhig vor die Kamera.");

      // Warte kurz bis <video> gemountet ist
      window.setTimeout(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play();

        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a"] });
        scanTimerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            const rawValue = barcodes[0]?.rawValue;
            if (rawValue && isValidBarcode(rawValue)) {
              stopCamera();
              setCameraStatus(`Barcode ${rawValue} erkannt.`);
              void performLookup(rawValue);
            }
          } catch {
            // Einzelnen Frame ignorieren
          }
        }, 450);
      }, 150);
    } catch {
      stopCamera();
      setCameraStatus("Kamera-Freigabe wurde abgelehnt oder ist nicht verfügbar.");
    }
  };

  const parsedPriceCents = parseEuroInputToCents(priceInput);
  const activeCategory = selectedCategoryId ? CATEGORY_MAP[selectedCategoryId] : undefined;
  const liveShrinkflationWarning =
    product && activeCategory && parsedPriceCents != null
      ? evaluateBarcodePriceShrinkflation({
          categoryId: activeCategory.id,
          packageAmount: product.packageAmount,
          packageUnit: product.packageUnit,
          priceCents: parsedPriceCents,
          referencePriceCents: activeCategory.defaultBasePrices[selectedStoreId].priceCents,
        })
      : null;

  const handleSave = async () => {
    if (!product || !activeCategory || parsedPriceCents == null) {
      setLookupMessage("Wähle eine Kategorie und gib einen gültigen Regalpreis in Euro ein.");
      return;
    }
    setIsSaving(true);
    try {
      await onSaveBarcodePrice({
        barcode: product.barcode,
        productName: product.productName,
        brand: product.brand,
        quantityText: product.quantityText,
        packageAmount: product.packageAmount,
        packageUnit: product.packageUnit,
        categoryId: activeCategory.id,
        storeId: selectedStoreId,
        priceCents: parsedPriceCents,
        isOffer,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section aria-labelledby="barcode-title" className="rounded-md bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="barcode-title" className="text-[26px] leading-tight font-black tracking-tight">
          Barcode-Scanner (Open Food Facts)
        </h2>
        <span className="text-sm text-muted">PLZ {activeZipCode}</span>
      </div>
      <p className="mt-2 max-w-[70ch] text-[15px]">
        Scanne im Supermarkt den EAN-Barcode oder gib die Nummer ein. Produktname, Marke und
        Packungsgröße kommen kostenlos aus <strong>Open Food Facts</strong> (offline über
        Referenzprodukte) – du tippst nur noch den Regalpreis ein.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!cameraActive ? (
          <button type="button" onClick={() => void startCameraScan()} className={SECONDARY_BUTTON}>
            Kamera-Scanner starten
          </button>
        ) : (
          <button type="button" onClick={stopCamera} className={SECONDARY_BUTTON}>
            Kamera stoppen
          </button>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void performLookup(barcodeInput);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            inputMode="numeric"
            value={barcodeInput}
            onChange={(event) => setBarcodeInput(event.target.value)}
            placeholder="EAN-13 (z. B. 4008400404127)"
            aria-label="EAN Barcode eingeben"
            className="h-11 w-56 rounded border border-line-strong bg-paper px-3 font-mono text-[15px] font-bold"
          />
          <button
            type="submit"
            disabled={isSearching}
            className={cn(PRIMARY_BUTTON, "disabled:opacity-60")}
          >
            {isSearching ? "Suche…" : "Produkt prüfen"}
          </button>
        </form>
      </div>

      {cameraStatus && (
        <p role="status" className="mt-2.5 text-sm font-semibold text-muted">
          {cameraStatus}
        </p>
      )}

      {cameraActive && (
        <div className="mt-3 overflow-hidden rounded-md border border-line-strong bg-ink">
          <video ref={videoRef} playsInline muted className="max-h-64 w-full object-cover" />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-muted">Schnelltest:</span>
        {DEMO_BARCODE_PRODUCTS.slice(0, 4).map((demo) => (
          <ToggleChip
            key={demo.barcode}
            active={product?.barcode === demo.barcode}
            onToggle={() => void performLookup(demo.barcode)}
          >
            {demo.brand ?? demo.productName} ({demo.quantityText})
          </ToggleChip>
        ))}
      </div>

      {lookupMessage && (
        <p role="status" className="mt-3 text-sm font-bold">
          {lookupMessage}
        </p>
      )}

      {product && (
        <div className="mt-4 rounded-md border border-line-strong bg-paper p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-lg font-extrabold">{product.productName}</p>
              <p className="text-sm text-muted">
                {[product.brand, product.quantityText, `EAN ${product.barcode}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {activeCategory && (
              <span className="rounded border border-route px-2 pt-0.5 text-xs font-bold text-route">
                Norm: {activeCategory.subtitle}
              </span>
            )}
          </div>

          {product.shrinkflationNote && !liveShrinkflationWarning && (
            <p className="mt-2.5 rounded bg-detour-soft px-2.5 py-1.5 text-sm font-semibold">
              {product.shrinkflationNote}
            </p>
          )}
          {liveShrinkflationWarning && (
            <div className="mt-2.5">
              <ShrinkflationAlert warning={liveShrinkflationWarning} />
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-bold">
              Markt
              <select
                value={selectedStoreId}
                onChange={(event) => setSelectedStoreId(event.target.value as StoreId)}
                className="mt-1 h-11 w-full rounded border border-line-strong bg-paper px-2.5 pt-0.5 font-semibold"
              >
                {STORES.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold">
              Kategorie
              <select
                value={selectedCategoryId}
                onChange={(event) => setSelectedCategoryId(event.target.value)}
                className="mt-1 h-11 w-full rounded border border-line-strong bg-paper px-2.5 pt-0.5 font-semibold"
              >
                <option value="">Kategorie wählen</option>
                {DEPARTMENTS.map((dept) => (
                  <optgroup key={dept.id} label={dept.name}>
                    {CATEGORIES.filter((cat) => cat.department === dept.id).map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.subtitle})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="block text-sm font-bold">
              Regalpreis (€)
              <input
                type="text"
                inputMode="decimal"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                placeholder="z. B. 1,49"
                className="mt-1 h-11 w-full rounded border border-line-strong bg-paper px-3 font-mono text-[15px] font-bold"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <ToggleChip active={!isOffer} onToggle={() => setIsOffer(false)}>
                Regulärer Preis ({STORE_MAP[selectedStoreId].shortName})
              </ToggleChip>
              <ToggleChip active={isOffer} onToggle={() => setIsOffer(true)}>
                Wochenangebot
              </ToggleChip>
            </div>
            <button
              type="button"
              disabled={isSaving || !activeCategory || parsedPriceCents == null}
              onClick={() => void handleSave()}
              className={cn(PRIMARY_BUTTON, "disabled:opacity-60")}
            >
              {isSaving
                ? "Speichere…"
                : parsedPriceCents != null
                  ? `Preis (${formatEuroCents(parsedPriceCents)}) übernehmen`
                  : "Preis übernehmen"}
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <p role="status" className="mt-3 text-[15px] font-bold">
          {feedback}
        </p>
      )}
    </section>
  );
};
