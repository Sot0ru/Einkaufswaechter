import type { ReactNode } from "react";

export const cn = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(" ");

export type RouteVariant = "main" | "detour";

export const PRIMARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded px-5 pt-0.5 text-base font-extrabold bg-route text-route-ink transition hover:brightness-110";
export const SECONDARY_BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded border-2 border-line-strong bg-paper px-5 pt-0.5 text-base font-bold text-ink transition hover:border-route";

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
    className="flex gap-0.5 rounded border border-line-strong bg-paper p-[3px]"
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
            "h-10 flex-1 whitespace-nowrap rounded-[3px] px-2 pt-0.5 text-sm transition",
            active ? "bg-choice font-extrabold text-choice-ink" : "font-semibold hover:bg-panel",
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
      "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 pt-0.5 text-sm transition",
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
