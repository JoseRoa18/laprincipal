import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth-guards";
import { listBrands, listCategoryTree } from "@/modules/catalog/infrastructure/catalog-options";
import { BrandManager } from "@/modules/catalog/ui/brand-manager";
import { CategoryManager } from "@/modules/catalog/ui/category-manager";

export const metadata = { title: "Categorías y marcas" };

export default async function CategoriesPage() {
  await requireRole("admin", "warehouse");
  const [tree, brands] = await Promise.all([listCategoryTree(), listBrands(undefined, { includeInactive: true, withCounts: true })]);
  return (
    <div className="space-y-4">
      <PageHeader title="Categorías y marcas" description="Organiza el catálogo. Lo que ya se usa en productos no se borra: se desactiva." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Categorías</CardTitle>
            <CardDescription>Árbol de dos o tres niveles: Refrigeración → Compresores.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager tree={tree} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Marcas</CardTitle>
            <CardDescription>Marca del repuesto (Embraco, Danfoss, Tecumseh, genérico).</CardDescription>
          </CardHeader>
          <CardContent>
            <BrandManager brands={brands} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
