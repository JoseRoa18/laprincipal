import { D, sum, type Num } from "@/lib/money";
import type { AbcClass } from "@/modules/inventory/domain/velocity";

/**
 * ABC by cumulative revenue: sorted from highest to lowest revenue, an item
 * is A while the share accumulated *before* it is under `cutA` (80 %), B
 * while under `cutB` (95 %) and C afterwards. Items without revenue are C.
 *
 * Deciding on the share before the item (not after) keeps the top seller in
 * class A even when it alone exceeds the cut, e.g. a single product with all
 * the revenue, or a store with very few products.
 */
export function classifyAbc<T extends { id: string; revenue: Num }>(items: T[], cutA = 0.8, cutB = 0.95): Map<string, AbcClass> {
  const sorted = [...items].sort((a, b) => D(b.revenue).minus(D(a.revenue)).toNumber());
  const total = sum(sorted.map((i) => i.revenue));
  const out = new Map<string, AbcClass>();
  let acc = D(0);
  for (const item of sorted) {
    const revenue = D(item.revenue);
    if (revenue.lte(0) || total.lte(0)) {
      out.set(item.id, "C");
      continue;
    }
    const before = acc.div(total);
    out.set(item.id, before.lt(cutA) ? "A" : before.lt(cutB) ? "B" : "C");
    acc = acc.plus(revenue);
  }
  return out;
}
