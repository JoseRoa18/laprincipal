import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  ChartColumn,
  House,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import type { UserRole } from "@/db/schema/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: UserRole[];
  /** Highlight when the pathname starts with any of these prefixes. */
  match?: string[];
}

const ALL: UserRole[] = ["admin", "seller", "warehouse"];

/** Sellers only sell: Vender and product lookup. Their home is /vender. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: House, roles: ["admin", "warehouse"] },
  { href: "/vender", label: "Vender", icon: ShoppingCart, roles: ["admin", "seller"] },
  { href: "/ventas", label: "Ventas", icon: Receipt, roles: ["admin"], match: ["/ventas", "/cotizaciones"] },
  { href: "/productos", label: "Productos", icon: Package, roles: ALL },
  { href: "/inventario", label: "Inventario", icon: Boxes, roles: ["admin", "warehouse"] },
  { href: "/compras", label: "Compras", icon: Truck, roles: ["admin", "warehouse"] },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { href: "/caja", label: "Caja", icon: Wallet, roles: ["admin"] },
  { href: "/reportes", label: "Reportes", icon: ChartColumn, roles: ["admin"] },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

/** Phone bottom bar: each role gets its four most used destinations (in this priority); the rest go to "Más". */
const MOBILE_PRIORITY = ["/vender", "/inicio", "/productos", "/inventario", "/compras", "/ventas", "/caja", "/clientes", "/reportes", "/configuracion"];
const MOBILE_BAR_SIZE = 4;

export function mobileNavForRole(role: UserRole): { bar: NavItem[]; more: NavItem[] } {
  const items = navForRole(role);
  const rank = (item: NavItem) => {
    const i = MOBILE_PRIORITY.indexOf(item.href);
    return i === -1 ? MOBILE_PRIORITY.length : i;
  };
  const picked = new Set([...items].sort((a, b) => rank(a) - rank(b)).slice(0, MOBILE_BAR_SIZE));
  // Shown in the same order as the sidebar so muscle memory carries over.
  return { bar: items.filter((i) => picked.has(i)), more: items.filter((i) => !picked.has(i)) };
}

/** Section the pathname belongs to (any role), for the phone header. */
export function sectionForPath(pathname: string): NavItem | null {
  return NAV_ITEMS.find((item) => isNavActive(item, pathname)) ?? null;
}

/** Where each role lands after signing in or opening "/inicio". */
export function homeForRole(role: UserRole): string {
  return role === "seller" ? "/vender" : "/inicio";
}

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
