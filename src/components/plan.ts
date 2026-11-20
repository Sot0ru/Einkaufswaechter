import type { StoreId } from "@/lib/rules/catalog";
import type { DepartmentGroup, OptimizationOutput } from "@/lib/rules/optimizer";
import type { RouteVariant } from "./ui";

/** Welcher Plan im Laden abgehakt wird: die Empfehlung, der 2-Läden-Split oder ein einzelner Markt */
export type InStoreMode = "recommended" | "split" | StoreId;

export interface PlanLeg {
  variant: RouteVariant;
  role: "main" | "detour" | "single";
  storeId: StoreId;
  storeName: string;
  totalCents: number;
  itemCount: number;
  departments: readonly DepartmentGroup[];
}

export interface ShoppingPlan {
  kind: "single" | "split";
  totalCents: number;
  legs: readonly PlanLeg[];
}

export const resolvePlan = (
  optimization: OptimizationOutput,
  mode: InStoreMode,
): ShoppingPlan | null => {
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
          departments: split.primaryDepartments,
        },
        {
          variant: "detour",
          role: "detour",
          storeId: split.secondaryStoreId,
          storeName: split.secondaryStoreName,
          totalCents: split.secondaryStoreTotalCents,
          itemCount: split.secondaryItems.length,
          departments: split.secondaryDepartments,
        },
      ],
    };
  }

  const targetStoreId =
    mode !== "recommended" && mode !== "split" ? mode : optimization.bestSingleStore?.storeId;
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
        departments: single.departments,
      },
    ],
  };
};
