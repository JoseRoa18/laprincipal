import type { UserRole } from "@/db/schema";
import { businessDate } from "@/lib/format";
import { canOpenSale } from "../domain/sale-access";

/** `canOpenSale` for a sale as loaded by `getSaleDetail`, using today's business date. */
export function userCanOpenSale(
  user: { id: string; role: UserRole },
  sale: { seller: { id: string }; createdBy: { id: string }; saleDate: Date },
): boolean {
  return canOpenSale(user, { sellerId: sale.seller.id, createdById: sale.createdBy.id, day: businessDate(sale.saleDate) }, businessDate());
}
