import type { UserRole } from "@/db/schema/enums";

/** Role texts. Pure module: safe for client components and server code alike. */
export const ROLES: UserRole[] = ["admin", "seller", "warehouse"];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrador",
  seller: "Vendedor",
  warehouse: "Almacén",
};

export const ROLE_HINT: Record<UserRole, string> = {
  admin: "Puede hacer todo, incluida la configuración y los usuarios.",
  seller: "Vende, cotiza, atiende clientes y maneja su caja.",
  warehouse: "Registra entradas, ajustes, conteos, etiquetas y productos.",
};
