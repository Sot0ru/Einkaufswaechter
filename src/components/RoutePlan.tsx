import { Fragment, type CSSProperties } from "react";
import { DEPARTMENT_MAP, type DepartmentId } from "@/lib/rules/catalog";
import { type DepartmentGroup, formatEuroCents } from "@/lib/rules/optimizer";
import { describeStopItems } from "./format";
import { cn, type RouteVariant, StorePlate } from "./ui";

export interface RoutePlanRow {
  variant: RouteVariant;
  storeName: string;
  caption: string;
  totalCents: number;
  departments: readonly DepartmentGroup[];
}

interface RoutePlanProps {
  rows: readonly RoutePlanRow[];
  footer?: string;
}

const LABEL_COLUMN_PX = 156;
const MIN_STOP_COLUMN_PX = 80;

const LINE_BACKGROUND: Record<RouteVariant, string> = {
  main: "bg-route",
  detour: "bg-detour",
};

const MARKER_BORDER: Record<RouteVariant, string> = {
  main: "border-route",
  detour: "border-detour",
};

/** Alle Abteilungen, in denen mindestens eine Route hält – in Laufroutenreihenfolge */
const collectDepartmentIds = (rows: readonly RoutePlanRow[]): DepartmentId[] => {
  const ids = new Set<DepartmentId>();
  for (const row of rows) {
    for (const department of row.departments) ids.add(department.departmentId);
  }
  return [...ids].sort((a, b) => DEPARTMENT_MAP[a].sortOrder - DEPARTMENT_MAP[b].sortOrder);
};

/**
 * Linienplan: Jede Zeile ist ein Markt, jede Spalte eine Abteilung entlang der Laufroute.
 * Abteilungen ohne Artikel werden „ohne Halt“ durchfahren.
 */
export const RoutePlan = ({ rows, footer }: RoutePlanProps) => {
  const departmentIds = collectDepartmentIds(rows);
  const stopColumns = departmentIds.length + 2; // Eingang + Abteilungen + Kasse
  const gridTemplateColumns = `${LABEL_COLUMN_PX}px repeat(${stopColumns}, minmax(0, 1fr))`;
  const halfColumn = `(100% - ${LABEL_COLUMN_PX}px) / ${stopColumns * 2}`;
  const lineStyle: CSSProperties = {
    left: `calc(${LABEL_COLUMN_PX}px + ${halfColumn})`,
    right: `calc(${halfColumn})`,
  };

  return (
    <section aria-labelledby="route-plan-title" className="overflow-hidden rounded-md border border-line">
      <h2 id="route-plan-title" className="sr-only">
        Linienplan durch {rows.length > 1 ? "beide Märkte" : "den Markt"}
      </h2>
      <div className="overflow-x-auto">
        <div
          className="px-6 pb-6 pt-5"
          style={{ minWidth: LABEL_COLUMN_PX + stopColumns * MIN_STOP_COLUMN_PX + 48 }}
        >
          <div
            aria-hidden="true"
            className="grid border-b border-line pb-3 text-center text-[13px] font-bold leading-tight text-muted"
            style={{ gridTemplateColumns }}
          >
            <span className="sticky left-0 z-20 -ml-3 bg-paper pl-3" />
            <span>Eingang</span>
            {departmentIds.map((id) => (
              <span key={id} className="px-1">
                {DEPARTMENT_MAP[id].shortName}
              </span>
            ))}
            <span>Kasse</span>
          </div>

          {rows.map((row, index) => (
            <Fragment key={`${row.variant}-${row.storeName}`}>
              {index > 0 && <DetourConnector />}
              <RouteLine
                row={row}
                departmentIds={departmentIds}
                gridTemplateColumns={gridTemplateColumns}
                lineStyle={lineStyle}
                isFirst={index === 0}
              />
            </Fragment>
          ))}
        </div>
      </div>
      {footer && <p className="bg-panel px-6 py-3.5 text-[15px]">{footer}</p>}
    </section>
  );
};

interface RouteLineProps {
  row: RoutePlanRow;
  departmentIds: readonly DepartmentId[];
  gridTemplateColumns: string;
  lineStyle: CSSProperties;
  isFirst: boolean;
}

const RouteLine = ({ row, departmentIds, gridTemplateColumns, lineStyle, isFirst }: RouteLineProps) => {
  const stops = new Map(row.departments.map((group) => [group.departmentId, group]));
  const lineBackground = LINE_BACKGROUND[row.variant];

  return (
    <div className={cn("relative grid", isFirst && "mt-5")} style={{ gridTemplateColumns }}>
      <span
        aria-hidden="true"
        className={cn("absolute top-[15px] h-1.5 rounded-full", lineBackground)}
        style={lineStyle}
      />

      <div className="sticky left-0 z-20 -ml-3 flex flex-col items-start gap-0.5 bg-paper pl-3 pr-3">
        <StorePlate variant={row.variant}>{row.storeName}</StorePlate>
        <span className="text-sm text-muted">{row.caption}</span>
        <span className="text-[17px] font-extrabold tabular-nums">{formatEuroCents(row.totalCents)}</span>
      </div>

      <div aria-hidden="true" className="relative flex justify-center">
        <span className={cn("mt-[11px] size-3.5 rounded-full", lineBackground)} />
      </div>

      {departmentIds.map((departmentId) => {
        const stop = stops.get(departmentId);
        if (!stop) {
          return (
            <div key={departmentId} aria-hidden="true" className="pt-9 text-center text-[13px] text-muted">
              ohne Halt
            </div>
          );
        }
        return (
          <div key={departmentId} className="relative flex flex-col items-center gap-2 px-1 text-center">
            <span
              aria-hidden="true"
              className={cn(
                "mt-[3px] flex size-[30px] items-center justify-center rounded-full border-[5px] bg-paper pt-0.5 text-xs font-black",
                MARKER_BORDER[row.variant],
              )}
            >
              {stop.sortOrder}
            </span>
            <span className="w-full text-[13px] leading-snug hyphens-auto [overflow-wrap:anywhere]">
              <span className="sr-only">{stop.departmentName}: </span>
              {describeStopItems(stop.items)}
            </span>
          </div>
        );
      })}

      <div className="relative flex flex-col items-center gap-2 text-center">
        <span aria-hidden="true" className={cn("mt-[3px] size-[30px] rounded-md", lineBackground)} />
        <span className="text-sm font-extrabold tabular-nums">
          <span className="sr-only">Kasse: </span>
          {formatEuroCents(row.totalCents)}
        </span>
      </div>
    </div>
  );
};

const DetourConnector = () => (
  <div aria-hidden="true" className="my-1.5 flex h-11 items-center gap-2.5 pl-[22px]">
    <span className="h-full border-l-4 border-dashed border-detour" />
    <span className="text-sm font-bold text-detour-strong">danach</span>
  </div>
);
