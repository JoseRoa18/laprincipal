"use client";

import { FileSpreadsheet } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "@/components/ui/native-select";
import { ACTIVE_FILTER_LABELS, STOCK_FILTER_LABELS, type ProductListFilter } from "../domain/list-filters";
import type { BrandOption, CategoryOption } from "../infrastructure/catalog-options";

/** Category / brand / stock / active selects bound to the URL, plus the Excel export link. */
export function ProductFilters({
  categories,
  brands,
  filter,
  exportHref,
}: {
  categories: CategoryOption[];
  brands: BrandOption[];
  filter: ProductListFilter;
  exportHref: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function set(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const parents = categories.filter((c) => c.depth === 0);
  const selectClass = "[&_select]:h-10 [&_select]:min-w-36";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect aria-label="Categoría" className={selectClass} value={filter.categoryId ?? ""} onChange={(e) => set("category", e.target.value)}>
        <NativeSelectOption value="">Todas las categorías</NativeSelectOption>
        {parents.map((parent) => {
          const children = categories.filter((c) => c.depth > 0 && c.label.startsWith(`${parent.label} > `));
          return (
            <NativeSelectOptGroup key={parent.id} label={parent.name}>
              <NativeSelectOption value={parent.id}>{parent.name} (todas)</NativeSelectOption>
              {children.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.label.slice(parent.label.length + 3)}
                </NativeSelectOption>
              ))}
            </NativeSelectOptGroup>
          );
        })}
      </NativeSelect>
      <NativeSelect aria-label="Marca" className={selectClass} value={filter.brandId ?? ""} onChange={(e) => set("brand", e.target.value)}>
        <NativeSelectOption value="">Todas las marcas</NativeSelectOption>
        {brands.map((b) => (
          <NativeSelectOption key={b.id} value={b.id}>
            {b.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Estado de stock" className={selectClass} value={filter.stock} onChange={(e) => set("stock", e.target.value === "all" ? "" : e.target.value)}>
        {Object.entries(STOCK_FILTER_LABELS).map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Activos o inactivos" className={selectClass} value={filter.active} onChange={(e) => set("active", e.target.value === "1" ? "" : e.target.value)}>
        {Object.entries(ACTIVE_FILTER_LABELS).map(([value, label]) => (
          <NativeSelectOption key={value} value={value}>
            {label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {exportHref ? (
        <Button variant="outline" className="h-10" render={<a href={exportHref} />}>
          <FileSpreadsheet /> Exportar Excel
        </Button>
      ) : null}
    </div>
  );
}
