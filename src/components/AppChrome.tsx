import type { ComponentType } from "react";
import { CartIcon, cn, ListIcon, RouteIcon, TagIcon } from "./ui";

export type AppTab = "compare" | "list" | "instore" | "offers";

interface TabDefinition {
  id: AppTab;
  label: (listCount: number) => string;
  shortLabel: (listCount: number) => string;
  Icon: ComponentType<{ className?: string }>;
}

const TABS: readonly TabDefinition[] = [
  { id: "compare", label: () => "Vergleich", shortLabel: () => "Vergleich", Icon: RouteIcon },
  {
    id: "list",
    label: (count) => `Liste (${count})`,
    shortLabel: (count) => `Liste (${count})`,
    Icon: ListIcon,
  },
  { id: "instore", label: () => "Im Laden", shortLabel: () => "Im Laden", Icon: CartIcon },
  {
    id: "offers",
    label: () => "Angebote & Preise",
    shortLabel: () => "Angebote",
    Icon: TagIcon,
  },
];

interface TabNavigationProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  listCount: number;
}

interface SiteHeaderProps extends TabNavigationProps {
  activeZipCode: string;
}

export const SiteHeader = ({ activeTab, onTabChange, listCount, activeZipCode }: SiteHeaderProps) => (
  <header className="bg-sign text-sign-ink">
    <div className="mx-auto flex min-h-[60px] max-w-7xl flex-wrap items-center justify-between gap-x-8 px-4 sm:min-h-[68px] sm:px-6 lg:px-10">
      <div className="flex items-center gap-2.5 py-2.5">
        <RouteIcon className="size-7" />
        <span className="text-[21px] font-extrabold tracking-tight">Einkaufswächter</span>
      </div>
      <span className="text-sm font-semibold text-sign-muted tabular-nums sm:hidden">
        PLZ {activeZipCode}
      </span>
      <nav aria-label="Ansichten" className="hidden flex-wrap gap-1 py-2.5 sm:flex">
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "inline-flex min-h-11 items-center rounded px-4 pt-0.5 text-[15px] transition",
                active ? "bg-sign-ink font-extrabold text-sign" : "font-semibold hover:bg-white/10",
              )}
            >
              {tab.label(listCount)}
            </button>
          );
        })}
      </nav>
    </div>
  </header>
);

/** Navigation am unteren Rand für die Bedienung mit einem Daumen im Laden (nur Handy) */
export const BottomNav = ({ activeTab, onTabChange, listCount }: TabNavigationProps) => (
  <nav
    aria-label="Ansichten"
    className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] sm:hidden"
  >
    {TABS.map(({ id, shortLabel, Icon }) => {
      const active = id === activeTab;
      return (
        <button
          key={id}
          type="button"
          aria-current={active ? "page" : undefined}
          onClick={() => onTabChange(id)}
          className={cn(
            "relative flex min-h-16 flex-col items-center justify-center gap-1 pt-1 text-xs",
            active ? "font-extrabold text-route" : "font-semibold text-muted",
          )}
        >
          {active && (
            <span aria-hidden="true" className="absolute inset-x-5 top-0 h-1 rounded-b bg-route" />
          )}
          <Icon className="size-6" />
          {shortLabel(listCount)}
        </button>
      );
    })}
  </nav>
);

export const LegalFooter = () => (
  <footer className="mx-auto max-w-7xl px-4 pb-28 sm:px-6 sm:pb-12 lg:px-10">
    <div className="max-w-[80ch] border-t border-line pt-6 text-sm text-muted">
      <h2 className="font-bold text-ink">Rechtlicher Hinweis und Preistransparenz</h2>
      <p className="mt-1.5">
        Einkaufswächter ist ein unabhängiger Preisvergleich und steht in keiner geschäftlichen
        Verbindung zu Lidl, Aldi Nord, Aldi Süd, Rewe, Edeka, Kaufland, Netto Marken-Discount oder
        Penny. Marken- und Produktnamen dienen nur der Zuordnung (§ 23 MarkenG), Prospektbilder
        werden nicht verwendet. Normalpreise sind Referenzwerte für Eigenmarken; Preise und
        Verfügbarkeit im Markt können abweichen (PAngV). Alle Angaben ohne Gewähr.
      </p>
    </div>
  </footer>
);
