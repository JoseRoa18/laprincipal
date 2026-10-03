import type { UserRole } from "@/db/schema/enums";

/**
 * Who may open a finished sale (receipt screen, ticket, delivery note,
 * WhatsApp): an admin any sale; a seller only the sales they rang up today,
 * to reprint or resend them. Sellers do not browse the sales history.
 */
export function canOpenSale(
  user: { id: string; role: UserRole },
  sale: { sellerId: string; createdById: string; /** yyyy-MM-dd */ day: string },
  today: string,
): boolean {
  if (user.role === "admin") return true;
  if (user.role !== "seller") return false;
  return sale.day === today && (sale.sellerId === user.id || sale.createdById === user.id);
}
