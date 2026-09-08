import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth-guards";
import { businessDate } from "@/lib/format";
import { getProductsForSale } from "@/modules/catalog/infrastructure/product-lookup";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getRatesSnapshot } from "@/modules/currency/infrastructure/rates";
import { listActiveSuppliers } from "@/modules/purchasing/infrastructure/suppliers";
import { ReceiptForm, type ReceiptLineState } from "@/modules/purchasing/ui/receipt-form";

export const metadata = { title: "Nueva entrada" };

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

/** Parse `?items=[{"p":"<productId>","q":<qty>}]` coming from "Qué comprar". */
function parseItems(raw: string): Array<{ productId: string; quantity: number }> {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => (x && typeof x === "object" ? { productId: String((x as { p?: unknown }).p ?? ""), quantity: Number((x as { q?: unknown }).q ?? 0) } : null))
      .filter((x): x is { productId: string; quantity: number } => Boolean(x && x.productId && Number.isFinite(x.quantity) && x.quantity > 0))
      .slice(0, 200);
  } catch {
    return [];
  }
}

export default async function NewReceiptPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const supplierId = str(params.supplier);
  const items = parseItems(str(params.items));

  const [suppliers, rates, { warehouseId }] = await Promise.all([listActiveSuppliers(), getRatesSnapshot(), getDefaultLocation()]);
  let lines: ReceiptLineState[] = [];
  if (items.length > 0) {
    const products = await getProductsForSale(
      items.map((i) => i.productId),
      { warehouseId },
    );
    lines = products.map((p) => {
      const qty = items.find((i) => i.productId === p.id)?.quantity ?? 0;
      return {
        key: p.id,
        productId: p.id,
        name: p.name,
        sku: p.sku,
        partNumber: p.partNumber,
        unitSymbol: p.unitSymbol,
        unitDecimals: p.unitDecimals,
        currentStock: p.stockPhysical,
        costAvgUsd: p.costAvgUsd,
        quantity: String(qty),
        unitCostAmount: "",
      };
    });
  }

  if (suppliers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nueva entrada" />
        <EmptyState
          title="Primero registra un proveedor"
          description="Toda entrada por compra se registra a nombre de un proveedor, con su moneda y su documento."
          action={<Button render={<Link href="/compras/proveedores/nuevo" />}>Nuevo proveedor</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Nueva entrada por compra" description="Registra lo recibido con el documento del proveedor. Al aplicar, el stock y el costo promedio se actualizan." />
      <ReceiptForm
        suppliers={suppliers}
        currencies={rates.currencies.map((c) => c.code)}
        today={businessDate()}
        rates={rates.rateSet}
        prefill={{ supplierId: supplierId || undefined, lines }}
      />
    </div>
  );
}
