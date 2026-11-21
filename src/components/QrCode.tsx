import qrcode from "qrcode-generator";
import { useMemo } from "react";

interface QrCodeProps {
  value: string;
  /** Beschreibung für Screenreader */
  label: string;
}

const QUIET_ZONE = 4;

/** QR-Code als SVG; bewusst dunkel auf weiß, damit Kameras ihn auch im Dunkelmodus lesen */
export const QrCode = ({ value, label }: QrCodeProps) => {
  const { size, path } = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const moduleCount = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) {
        if (qr.isDark(row, col)) d += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
      }
    }
    return { size: moduleCount + QUIET_ZONE * 2, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-44 flex-none rounded"
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#10233a" />
    </svg>
  );
};
