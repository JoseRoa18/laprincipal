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

export const NAV_ITEMS: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: House, roles: ALL },
  { href: "/vender", label: "Vender", icon: ShoppingCart, roles: ["admin", "seller"] },
  { href: "/ventas", label: "Ventas", icon: Receipt, roles: ["admin", "seller"], match: ["/ventas", "/cotizaciones"] },
  { href: "/productos", label: "Productos", icon: Package, roles: ALL },
  { href: "/inventario", label: "Inventario", icon: Boxes, roles: ALL },
  { href: "/compras", label: "Compras", icon: Truck, roles: ["admin", "warehouse"] },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin", "seller"] },
  { href: "/caja", label: "Caja", icon: Wallet, roles: ["admin", "seller"] },
  { href: "/reportes", label: "Reportes", icon: ChartColumn, roles: ["admin"] },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

/** Bottom bar on phones: the four most used destinations, plus "Más". */
export const MOBILE_NAV_HREFS = ["/inicio", "/vender", "/productos", "/inventario"];

export function navForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = item.match ?? [item.href];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
