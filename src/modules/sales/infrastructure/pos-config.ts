import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { priceLists } from "@/db/schema";
import type { SessionUser } from "@/lib/auth-guards";
import { listPinUsers } from "@/modules/auth/application/pin";
import { getOpenCashSession } from "@/modules/cash/application/session";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { getPolicies } from "@/modules/settings/infrastructure/settings";
import { getActingSeller } from "../application/acting-seller";
import type { CartPayload } from "../application/schemas";
import type { PosConfig } from "../ui/pos/types";
import { listActivePaymentMethods } from "./payment-methods";
import { getQuoteCart } from "./quotes-queries";
import { getHeldSaleCart } from "./sales-queries";

/** Everything the POS client needs, resolved server-side for the page. */
export async function loadPosConfig(opts: { user: SessionUser; mode: "sale" | "quote"; quoteId?: string; heldSaleId?: string }): Promise<PosConfig> {
  const [seller, snapshot, policies, paymentMethods, session, location, pinUsers, lists] = await Promise.all([
    getActingSeller(opts.user),
    getRatesSnapshot(),
    getPolicies(),
    listActivePaymentMethods(),
    getOpenCashSession(),
    getDefaultLocation(),
    listPinUsers(),
    db.select({ id: priceLists.id, code: priceLists.code }).from(priceLists).where(eq(priceLists.isActive, true)),
  ]);
  const acting = seller ?? { id: opts.user.id, name: opts.user.name, role: opts.user.role, isActing: false };

  let initialCart: CartPayload | null = null;
  if (opts.quoteId) initialCart = await getQuoteCart(opts.quoteId, location.warehouseId);
  else if (opts.heldSaleId) initialCart = await getHeldSaleCart(opts.heldSaleId, location.warehouseId);

  return {
    mode: opts.mode,
    user: { id: opts.user.id, name: opts.user.name, role: opts.user.role },
    seller: acting,
    rates: {
      today: snapshot.today,
      rateSet: Object.fromEntries(Object.entries(snapshot.rateSet).map(([k, v]) => [k, String(v)])),
      currencies: snapshot.currencies.map((c) => ({ ...c, cashRounding: String(c.cashRounding) })),
      missing: snapshot.missing,
      stale: snapshot.stale,
    },
    policies: {
      maxDiscountPct: policies.maxDiscountPctByRole[acting.role] ?? 0,
      allowNegativeStock: policies.allowNegativeStock,
      requireRatesToSell: policies.requireRatesToSell,
      requireOpenCashSession: policies.requireOpenCashSession,
      quoteValidityDays: policies.quoteValidityDays,
    },
    paymentMethods,
    cashSessionOpen: Boolean(session),
    pinUsers,
    priceLists: {
      publicId: lists.find((l) => l.code === "PUBLIC")?.id ?? null,
      techId: lists.find((l) => l.code === "TECH")?.id ?? null,
    },
    initialCart,
  };
}
