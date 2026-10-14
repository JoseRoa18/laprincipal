import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Pagination, parsePage } from "@/components/app/pagination";
import { SearchInput } from "@/components/app/search-input";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth-guards";
import { D } from "@/lib/money";
import { countProductsWithoutCost, countProductsWithoutPrice, listProducts, parseListFilter } from "@/modules/catalog/infrastructure/products-list";
import { PriceEntryList } from "@/modules/catalog/ui/price-entry-list";
import { getDefaultLocation } from "@/modules/core/application/context";
import { getSetting } from "@/modules/settings/infrastructure/settings";
import { cn } from "cn";

export const metadata = { title: "Poner precios y costos" };

const PAGE_SIZE = 40;

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Products registered without a selling price ("Falta precio") or without a
 * cost ("Falta costo"), to complete them one after another.
 */
export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("admin", "warehouse");
  const params = await searchParams;
  const page = parsePage(params.page);
  const missing = params.falta === "costo" ? "cost" : "price";
  const base = { ...parseListFilter(params), active: "all" as const };
  const filter = missing === "cost" ? { ...base, cost: "missing" as const, price: "all" as const } : { ...base, price: "missing" as const, cost: "all" as const };
  const location = await getDefaultLocation();
  const [{ rows, total }, policies, withoutPrice, withoutCost] = await Promise.all([
    listProducts(filter, { warehouseId: location.warehouseId, page, pageSize: PAGE_SIZE }),
    getSetting("policies"),
    countProductsWithoutPrice(),
    countProductsWithoutCost(),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    sku: r.sku,
    brandName: r.brandName,
    costUsd: D(r.costAvgUsd).gt(0) ? r.costAvgUsd : null,
    publicPriceUsd: r.publicPriceUsd && D(r.publicPriceUsd).gt(0) ? r.publicPriceUsd : null,
  }));

  const tabs = [
    { key: "price", label: "Falta precio", count: withoutPrice, href: "/productos/precios" },
    { key: "cost", label: "Falta costo", count: withoutCost, href: "/productos/precios?falta=costo" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ href: "/productos", label: "Volver a productos" }}
        title="Poner precios y costos"
        description={
          missing === "price"
            ? `Sin precio público no se pueden vender. El técnico se calcula solo (${policies.techPriceMarkdownPct} % menos) si lo dejas vacío; con costo, se sugiere el público (${policies.defaultMarginPct} % de margen).`
            : "Sin costo, el margen y el valor del inventario no son reales. Escribe el costo unitario en dólares; Enter guarda y pasa al siguiente."
        }
      />
      <nav aria-label="Pendientes" className="flex gap-2">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={missing === t.key ? "page" : undefined}
            className={cn(
              "tap-target inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              missing === t.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t.label}
            <Badge variant={missing === t.key ? "secondary" : "outline"} className="tabular-nums">
              {t.count}
            </Badge>
          </Link>
        ))}
      </nav>
      <SearchInput placeholder="Buscar por nombre, número de parte o código" autoFocus={false} />
      {total === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title={missing === "price" ? "Todos los productos tienen precio" : "Todos los productos tienen costo"}
          description={missing === "price" ? "Los que se registren sin precio aparecerán aquí." : "Los que se registren sin costo aparecerán aquí."}
        />
      ) : (
        <>
          <PriceEntryList key={missing} mode={missing} items={items} marginPct={policies.defaultMarginPct} techMarkdownPct={policies.techPriceMarkdownPct} />
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/productos/precios" params={params} />
        </>
      )}
    </div>
  );
}
