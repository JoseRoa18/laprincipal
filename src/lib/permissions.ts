import type { UserRole } from "@/db/schema/enums";

/** Pure permission table (no framework imports) so domain/application code and tests can use it. */
export type Permission =
  | "sell"
  | "quote"
  | "void_sale"
  | "return_sale"
  | "manage_products"
  | "view_costs"
  | "adjust_stock"
  | "count_stock"
  | "purchases"
  | "cash"
  | "reports"
  | "settings"
  | "manage_users";

/** Sellers only sell: POS (with customer pick or quick create and held sales) and product lookup. */
export const PERMISSIONS: Record<Permission, UserRole[]> = {
  sell: ["admin", "seller"],
  quote: ["admin"],
  void_sale: ["admin"],
  return_sale: ["admin"],
  manage_products: ["admin", "warehouse"],
  view_costs: ["admin", "warehouse"],
  adjust_stock: ["admin", "warehouse"],
  count_stock: ["admin", "warehouse"],
  purchases: ["admin", "warehouse"],
  cash: ["admin"],
  reports: ["admin"],
  settings: ["admin"],
  manage_users: ["admin"],
};

export const ALL_ROLES: UserRole[] = ["admin", "seller", "warehouse"];

export function can(role: UserRole, action: Permission): boolean {
  return PERMISSIONS[action].includes(role);
}
