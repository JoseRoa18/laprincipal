import type { UserRole } from "@/db/schema/enums";
import type { CurrencyInfo } from "@/modules/currency/domain/conversion";
import type { CartPayload } from "../../application/schemas";
import type { PosPaymentMethod } from "../../infrastructure/payment-methods";

export interface PosRates {
  today: string;
  /** Units per 1 USD, as strings. USD is always "1". */
  rateSet: Record<string, string>;
  currencies: CurrencyInfo[];
  missing: string[];
  stale: string[];
}

export interface PosPolicies {
  /** Max discount for the acting seller's role. */
  maxDiscountPct: number;
  allowNegativeStock: boolean;
  requireRatesToSell: boolean;
  requireOpenCashSession: boolean;
  quoteValidityDays: number;
}

export interface PosUser {
  id: string;
  name: string;
  role: UserRole;
}

export interface PosSeller extends PosUser {
  isActing: boolean;
}

/** Everything the POS client needs, resolved by the server page. */
export interface PosConfig {
  mode: "sale" | "quote";
  user: PosUser;
  seller: PosSeller;
  rates: PosRates;
  policies: PosPolicies;
  paymentMethods: PosPaymentMethod[];
  cashSessionOpen: boolean;
  pinUsers: { id: string; name: string; role: UserRole }[];
  priceLists: { publicId: string | null; techId: string | null };
  /** A quote or held sale to load into the cart on mount. */
  initialCart: CartPayload | null;
}
