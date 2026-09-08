import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { SALE_STATUS_LABEL } from "../../application/labels";

interface Props {
  values: { from: string; to: string; status: string; sellerId: string; paymentMethodId: string };
  sellers: { id: string; name: string }[];
  methods: { id: string; name: string }[];
}

/** Plain GET form: the list page reads the query string on the server. */
export function SalesFilters({ values, sellers, methods }: Props) {
  return (
    <form method="get" className="grid gap-2 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_1fr_auto] lg:items-end">
      <label className="grid gap-1 text-xs font-medium">
        Desde
        <Input type="date" name="desde" defaultValue={values.from} className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Hasta
        <Input type="date" name="hasta" defaultValue={values.to} className="h-9" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Estado
        <NativeSelect name="estado" defaultValue={values.status} className="w-full [&>select]:h-9">
          <NativeSelectOption value="all">Todos</NativeSelectOption>
          {(["completed", "partially_refunded", "refunded", "voided"] as const).map((s) => (
            <NativeSelectOption key={s} value={s}>
              {SALE_STATUS_LABEL[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Vendedor
        <NativeSelect name="vendedor" defaultValue={values.sellerId} className="w-full [&>select]:h-9">
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {sellers.map((s) => (
            <NativeSelectOption key={s.id} value={s.id}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        Método de pago
        <NativeSelect name="metodo" defaultValue={values.paymentMethodId} className="w-full [&>select]:h-9">
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {methods.map((m) => (
            <NativeSelectOption key={m.id} value={m.id}>
              {m.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" variant="outline" className="h-9">
        <Filter /> Filtrar
      </Button>
    </form>
  );
}
