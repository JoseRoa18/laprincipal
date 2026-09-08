import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "seller", "warehouse"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const documentTypeEnum = pgEnum("document_type", [
  "sale",
  "quote",
  "return",
  "purchase_receipt",
  "adjustment",
  "count",
  "cash_session",
]);

export const rateSourceEnum = pgEnum("rate_source", ["manual", "bcv_api"]);

export const barcodeTypeEnum = pgEnum("barcode_type", ["EAN13", "UPC", "CODE128", "INTERNAL"]);

export const imageStatusEnum = pgEnum("image_status", [
  "pending",
  "processed",
  "original_only",
  "failed",
]);

export const stockModeEnum = pgEnum("stock_mode", ["manual", "auto"]);

export const reasonKindEnum = pgEnum("reason_kind", ["increase", "decrease", "both"]);

export const movementTypeEnum = pgEnum("movement_type", [
  "initial",
  "purchase_in",
  "purchase_void_out",
  "manual_in",
  "manual_out",
  "sale_out",
  "sale_void_in",
  "return_in",
  "adjust_in",
  "adjust_out",
  "count_adjust",
]);
export type MovementType = (typeof movementTypeEnum.enumValues)[number];

export const adjustmentStatusEnum = pgEnum("adjustment_status", ["draft", "applied", "cancelled"]);
export const countStatusEnum = pgEnum("count_status", ["open", "applied", "cancelled"]);
export const statsStatusEnum = pgEnum("stats_status", ["buy_now", "soon", "ok", "excess", "no_data"]);
export const receiptStatusEnum = pgEnum("receipt_status", ["draft", "applied", "voided"]);

export const customerKindEnum = pgEnum("customer_kind", ["person", "company"]);
export const docTypeEnum = pgEnum("doc_type", ["V", "E", "J", "G", "P", "NONE"]);
export const customerTypeEnum = pgEnum("customer_type", ["public", "technician"]);

export const quoteStatusEnum = pgEnum("quote_status", [
  "open",
  "accepted",
  "converted",
  "expired",
  "cancelled",
]);
export const saleStatusEnum = pgEnum("sale_status", [
  "held",
  "completed",
  "voided",
  "refunded",
  "partially_refunded",
]);
export const discountTypeEnum = pgEnum("discount_type", ["pct", "amount"]);
export const returnStatusEnum = pgEnum("return_status", ["completed", "voided"]);

export const paymentKindEnum = pgEnum("payment_kind", [
  "cash",
  "mobile_payment",
  "card_terminal",
  "transfer",
  "crypto",
]);
export const cashSessionStatusEnum = pgEnum("cash_session_status", ["open", "closed"]);
export const cashMovementTypeEnum = pgEnum("cash_movement_type", ["in", "out"]);

export const importTypeEnum = pgEnum("import_type", [
  "products",
  "customers",
  "suppliers",
  "initial_stock",
  "prices",
]);
export const importStatusEnum = pgEnum("import_status", [
  "validating",
  "ready",
  "applied",
  "failed",
  "undone",
]);
export const backupKindEnum = pgEnum("backup_kind", ["manual", "scheduled"]);
