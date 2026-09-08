import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { timestamps } from "./_common";
import { backupKindEnum, documentTypeEnum, importStatusEnum, importTypeEnum, userRoleEnum } from "./enums";

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const warehouses = pgTable("warehouses", {
  id: uuid("id").primaryKey().defaultRandom(),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Always stored lower-cased. */
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: userRoleEnum("role").notNull().default("seller"),
    pinHash: text("pin_hash"),
    pinFailedAttempts: integer("pin_failed_attempts").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const documentSeries = pgTable("document_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentType: documentTypeEnum("document_type").notNull().unique(),
  prefix: text("prefix").notNull(),
  nextNumber: integer("next_number").notNull().default(1),
  padding: integer("padding").notNull().default(6),
  ...timestamps(),
});

/** Append-only. A trigger blocks UPDATE and DELETE. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: importTypeEnum("type").notNull(),
  filePath: text("file_path").notNull(),
  status: importStatusEnum("status").notNull().default("validating"),
  totalRows: integer("total_rows").notNull().default(0),
  okRows: integer("ok_rows").notNull().default(0),
  errorRows: integer("error_rows").notNull().default(0),
  errors: jsonb("errors").notNull().default([]),
  /** Ids created by the import so it can be undone. */
  createdIds: jsonb("created_ids").notNull().default([]),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  ...timestamps(),
});

export const backups = pgTable("backups", {
  id: uuid("id").primaryKey().defaultRandom(),
  filePath: text("file_path").notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  kind: backupKindEnum("kind").notNull().default("manual"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
