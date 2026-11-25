import type { StoreId } from "@/lib/rules/catalog";
import type { DepartmentGroup, OptimizationOutput } from "@/lib/rules/optimizer";
import type { RouteVariant } from "./ui";

/** Welcher Plan im Laden abgehakt wird: Empfehlung, bester Einzelmarkt, 2-Läden-Split, eigene Kombi oder konkreter Markt */
export type InStoreMode = "recommended" | "single" | "split" | "custom" | StoreId;

export interface PlanLeg {
  variant: RouteVariant;
  role: "main" | "detour" | "single";
  storeId: StoreId;
  storeName: string;
  totalCents: number;
  itemCount: number;
  detourMinutes: number;
  departments: readonly DepartmentGroup[];
}

export interface ShoppingPlan {
  kind: "single" | "split" | "custom";
  totalCents: number;
  legs: readonly PlanLeg[];
}

export const resolvePlan = (
  optimization: OptimizationOutput,
  mode: InStoreMode,
): ShoppingPlan | null => {
  if (mode === "custom" && optimization.customStoreCombo) {
    const combo = optimization.customStoreCombo;
    return {
      kind: "custom",
      totalCents: combo.totalCheckoutCents,
      legs: combo.legs.map((leg) => ({
        variant: leg.role === "main" ? "main" : "detour",
        role: combo.legs.length === 1 ? "single" : leg.role,
        storeId: leg.storeId,
        storeName: leg.storeName,
        totalCents: leg.totalCheckoutCents,
        itemCount: leg.items.length,
        detourMinutes: leg.detourMinutes,
        departments: leg.departments,
      })),
    };
  }

  const split = optimization.bestTwoStoreSplit;
  const useSplit =
    split != null &&
    (mode === "split" || (mode === "recommended" && optimization.recommendedStrategy === "split"));

  if (useSplit) {
    return {
      kind: "split",
      totalCents: split.totalCheckoutCents,
      legs: [
        {
          variant: "main",
          role: "main",
          storeId: split.primaryStoreId,
          storeName: split.primaryStoreName,
          totalCents: split.primaryStoreTotalCents,
          itemCount: split.primaryItems.length,
          detourMinutes: 0,
          departments: split.primaryDepartments,
        },
        {
          variant: "detour",
          role: "detour",
          storeId: split.secondaryStoreId,
          storeName: split.secondaryStoreName,
          totalCents: split.secondaryStoreTotalCents,
          itemCount: split.secondaryItems.length,
          detourMinutes: split.detourMinutes,
          departments: split.secondaryDepartments,
        },
      ],
    };
  }

  const targetStoreId =
    mode !== "recommended" && mode !== "single" && mode !== "split" && mode !== "custom"
      ? mode
      : optimization.bestSingleStore?.storeId;
  const single =
    optimization.singleStoreRankings.find((ranking) => ranking.storeId === targetStoreId) ??
    optimization.bestSingleStore;
  if (!single) return null;

  return {
    kind: "single",
    totalCents: single.totalCheckoutCents,
    legs: [
      {
        variant: "main",
        role: "single",
        storeId: single.storeId,
        storeName: single.storeName,
        totalCents: single.totalCheckoutCents,
        itemCount: single.items.length,
        detourMinutes: 0,
        departments: single.departments,
      },
    ],
  };
};
