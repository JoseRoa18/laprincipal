import { History } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { can, requireUser } from "@/lib/auth-guards";
import { businessDate, formatDateTime, formatQty } from "@/lib/format";
import { getProductsForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { MOVEMENT_TYPES, MOVEMENT_TYPE_LABEL, referenceHref, referenceLabel } from "@/modules/inventory/infrastructure/labels";
import { isMovementType, listMovementUsers, listMovements } from "@/modules/inventory/infrastructure/movements";
import { UrlDateRange, UrlSelect } from "@/modules/inventory/ui/filters";
import { MovementProductFilter } from "@/modules/inventory/ui/movement-product-filter";
import { cn } from "cn";

export const metadata = { title: "Kardex" };

const PAGE_SIZE = 50;
type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Default period: the last 30 days. */
function defaultRange() {
  const now = new Date();
  return { today: businessDate(now), from: businessDate(new Date(now.getTime() - 30 * 86_400_000)) };
}

export default async function MovementsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  const page = parsePage(params.page);
  const showCosts = can(user.role, "view_costs");

  const { today, from: defaultFrom } = defaultRange();
  const productId = str(params.product);
  const type = isMovementType(params.type) ? params.type : "";
  const userId = str(params.user);
  const from = isDate(str(params.from)) ? str(params.from) : params.from === "" ? "" : defaultFrom;
  const to = isDate(str(params.to)) ? str(params.to) : params.to === "" ? "" : today;

  const { warehouseId } = await getDefaultLocation();
  const [{ rows, total }, users, [product]] = await Promise.all([
    listMovements({ productId: productId || undefined, type, userId: userId || undefined, from: from || undefined, to: to || undefined, page, pageSize: PAGE_SIZE }),
    listMovementUsers(),
    productId ? getProductsForSale([productId], { warehouseId }) : Promise.resolve([] as Array<{ id: string; name: string; sku: string }>),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Kardex" description="Todos los movimientos de inventario con su saldo" />

      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <MovementProductFilter selected={product ? { id: product.id, name: product.name, sku: product.sku } : null} />
        <UrlSelect param="type" placeholder="Todos los tipos" options={MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABEL[t] }))} />
        <UrlSelect param="user" placeholder="Todos los usuarios" options={users.map((u) => ({ value: u.id, label: u.name }))} />
        <UrlDateRange defaultFrom={from} defaultTo={to} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Sin movimientos"
          description="No hay movimientos en el período o con los filtros elegidos. Las entradas por compra, ventas y ajustes aparecerán aquí."
        />
      ) : (
        <>
          {/* Phones: one card per movement */}
          <ul className="space-y-2 md:hidden">
            {rows.map((m) => {
              const qty = Number(m.quantity);
              const href = referenceHref(m.referenceType, m.referenceId);
              const doc = m.referenceType ? referenceLabel(m.referenceType) : "";
              return (
                <li key={m.id} className="bg-card rounded-xl border p-3">
                  {product ? null : (
                    <Link href={`/inventario/movimientos?product=${m.productId}`} className="tap-target flex min-w-0 items-center font-medium">
                      <span className="truncate">{m.productName}</span>
                    </Link>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {formatDateTime(m.createdAt)} ·{" "}
                    {href ? (
                      <Link href={href} className="text-primary underline-offset-4 hover:underline">
                        {MOVEMENT_TYPE_LABEL[m.type]}
                      </Link>
                    ) : (
                      MOVEMENT_TYPE_LABEL[m.type]
                    )}
                    {m.reasonName ? ` · ${m.reasonName}` : ""}
                    {doc && doc !== MOVEMENT_TYPE_LABEL[m.type] ? ` · ${doc}` : ""}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                    <span className={cn("font-semibold tabular-nums", qty > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive")}>
                      {qty > 0 ? "+" : "−"}
                      {formatQty(Math.abs(qty), m.unitDecimals)} {m.unitSymbol}
                    </span>
                    <span className={cn("tabular-nums", Number(m.balanceAfter) < 0 && "text-destructive")}>
                      <span className="text-muted-foreground text-xs">Saldo </span>
                      <span className="font-medium">{formatQty(m.balanceAfter, m.unitDecimals)}</span>
                    </span>
                    {showCosts ? <Money value={m.unitCostUsd} currency="USD" className="text-muted-foreground text-xs" /> : null}
                  </div>
                  {m.userName || m.notes ? (
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {[m.userName, m.notes].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* Wider screens: table */}
          <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              {product ? null : <TableHead>Producto</TableHead>}
              <TableHead>Tipo</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Salida</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              {showCosts ? <TableHead className="text-right">Costo unit.</TableHead> : null}
              <TableHead>Usuario</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((m) => {
              const qty = Number(m.quantity);
              const href = referenceHref(m.referenceType, m.referenceId);
              const doc = m.referenceType ? referenceLabel(m.referenceType) : "";
              return (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
                  {product ? null : (
                    <TableCell className="max-w-[20rem]">
                      <Link href={`/inventario/movimientos?product=${m.productId}`} className="tap-target flex min-w-0 items-center hover:underline">
                        <span className="truncate">{m.productName}</span>
                      </Link>
                      <span className="text-muted-foreground block truncate text-xs">{[m.partNumber, m.productSku].filter(Boolean).join(" · ")}</span>
                    </TableCell>
                  )}
                  <TableCell>
                    {MOVEMENT_TYPE_LABEL[m.type]}
                    {m.reasonName ? <span className="text-muted-foreground block text-xs">{m.reasonName}</span> : null}
                  </TableCell>
                  <TableCell>
                    {href ? (
                      <Link href={href} className="text-primary underline-offset-4 hover:underline">
                        {doc}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{doc || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{qty > 0 ? formatQty(m.quantity, m.unitDecimals) : ""}</TableCell>
                  <TableCell className="text-destructive text-right tabular-nums">{qty < 0 ? formatQty(Math.abs(qty), m.unitDecimals) : ""}</TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", Number(m.balanceAfter) < 0 && "text-destructive")}>
                    {formatQty(m.balanceAfter, m.unitDecimals)} <span className="text-muted-foreground text-xs font-normal">{m.unitSymbol}</span>
                  </TableCell>
                  {showCosts ? (
                    <TableCell className="text-right">
                      <Money value={m.unitCostUsd} currency="USD" />
                    </TableCell>
                  ) : null}
                  <TableCell className="text-muted-foreground">{m.userName ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[16rem] truncate" title={m.notes ?? undefined}>
                    {m.notes ?? ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
          </div>
        </>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/inventario/movimientos" params={params} />
    </div>
  );
}
