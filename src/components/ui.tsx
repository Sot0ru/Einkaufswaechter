import { useEffect, type ReactNode } from "react";

export const cn = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(" ");

export type RouteVariant = "main" | "detour";

export const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 pt-0.5 text-base font-extrabold bg-route text-route-ink transition hover:brightness-110";
export const SECONDARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-md border-2 border-line-strong bg-paper px-5 pt-0.5 text-base font-bold text-ink transition hover:border-route";

interface SegmentOption<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T> {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export const SegmentedControl = <T extends string | number>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) => (
  <div
    role="group"
    aria-label={label}
    className="flex gap-0.5 rounded-md border border-line-strong bg-panel p-[3px]"
  >
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-10 flex-1 whitespace-nowrap rounded px-1.5 pt-0.5 text-[13px] transition sm:px-2.5 sm:text-sm",
            active
              ? "bg-choice font-extrabold text-choice-ink shadow-xs"
              : "font-semibold text-ink hover:bg-paper/70",
          )}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

interface ToggleChipProps {
  active: boolean;
  onToggle: () => void;
  children: ReactNode;
}

export const ToggleChip = ({ active, onToggle, children }: ToggleChipProps) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onToggle}
    className={cn(
      "inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 pt-0.5 text-sm transition",
      active
        ? "border-choice bg-choice font-bold text-choice-ink"
        : "border-line-strong bg-paper font-semibold hover:border-route",
    )}
  >
    {active && <CheckIcon className="size-3.5" />}
    {children}
  </button>
);

interface StorePlateProps {
  variant: RouteVariant;
  children: ReactNode;
  inverted?: boolean;
}

/** Linienschild mit dem Marktnamen, wie an einer Haltestelle */
export const StorePlate = ({ variant, children, inverted = false }: StorePlateProps) => (
  <span
    className={cn(
      "inline-flex rounded px-2.5 pb-px pt-1 text-lg font-black leading-tight",
      inverted && variant === "main" && "bg-sign-ink text-sign",
      !inverted && variant === "main" && "bg-route text-route-ink",
      variant === "detour" && "bg-detour-plate text-detour-plate-ink",
    )}
  >
    {children}
  </span>
);

interface CollapsibleCardProps {
  title: string;
  summary?: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Ruhige, standardmäßig eingeklappte Karte für nachgelagerte Details */
export const CollapsibleCard = ({
  title,
  summary,
  icon,
  defaultOpen = false,
  children,
}: CollapsibleCardProps) => (
  <details
    open={defaultOpen}
    className="group rounded-lg border border-line bg-paper transition open:border-line-strong"
  >
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-2.5">
        {icon}
        <span className="font-extrabold text-ink">{title}</span>
      </span>
      <span className="flex flex-none items-center gap-2.5 text-sm text-muted">
        {summary && <span className="tabular-nums">{summary}</span>}
        <ChevronIcon className="size-5 text-muted transition-transform duration-150 group-open:rotate-180" />
      </span>
    </summary>
    <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>
  </details>
);

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

/** Seitliche Schublade (Slide-over Drawer) für Einstellungen und sekundäre Werkzeuge */
export const Drawer = ({ open, onClose, title, subtitle, children }: DrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-ink/45 backdrop-blur-[1px]"
      />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line bg-paper px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-xl font-black tracking-tight">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`${title} schließen`}
            className="flex size-11 flex-none items-center justify-center rounded-md text-muted transition hover:bg-panel hover:text-ink"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <footer className="border-t border-line bg-paper px-5 py-3.5">
          <button type="button" onClick={onClose} className={cn(PRIMARY_BUTTON, "w-full")}>
            Fertig
          </button>
        </footer>
      </div>
    </div>
  );
};

interface IconProps {
  className?: string;
}

export const CheckIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const ChevronIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const SlidersIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M4 6h16M4 12h16M4 18h16" />
    <circle cx="9" cy="6" r="2" fill="currentColor" />
    <circle cx="15" cy="12" r="2" fill="currentColor" />
    <circle cx="11" cy="18" r="2" fill="currentColor" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M6 6l12 12M18 6l-12 12" />
  </svg>
);

export const RouteIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="5" cy="6" r="2.5" />
    <circle cx="19" cy="18" r="2.5" />
    <path d="M7.5 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6.5" />
  </svg>
);

export const ListIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" />
    <circle cx="4.5" cy="12" r="1" />
    <circle cx="4.5" cy="18" r="1" />
  </svg>
);

export const CartIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.3a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3" />
    <circle cx="10" cy="20" r="1.3" />
    <circle cx="17.5" cy="20" r="1.3" />
  </svg>
);

export const TagIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
    <circle cx="8" cy="8" r="1.5" />
  </svg>
);

export const StarIcon = ({ className, filled = false }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </svg>
);

export const InfoIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);
