import { PackageMinus } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/empty-state";
import { Money } from "@/components/app/money";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth-guards";
import { businessDate, formatDateTime, formatQty } from "@/lib/format";
import { MOVEMENT_TYPE_LABEL } from "@/modules/inventory/infrastructure/labels";
import { describeRange, parseDateRange } from "@/modules/reporting/domain/date-range";
import { getAdjustmentsReport, type AdjustmentGroupRow, type AdjustmentMovementRow } from "@/modules/reporting/infrastructure/adjustments-report";
import { ExportButton } from "@/modules/reporting/ui/export-button";
import { KpiCard } from "@/modules/reporting/ui/kpi-card";
import { PeriodFilter } from "@/modules/reporting/ui/period-filter";

export const metadata = { title: "Ajustes y mermas" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MOVEMENT_LIMIT = 500;

function GroupTable({ rows, totals, firstColumn }: { rows: AdjustmentGroupRow[]; totals: AdjustmentGroupRow; firstColumn: string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{firstColumn}</TableHead>
          <TableHead className="hidden text-right md:table-cell">Movimientos</TableHead>
          <TableHead className="hidden text-right md:table-cell">Unid. salida</TableHead>
          <TableHead className="hidden text-right md:table-cell">Unid. entrada</TableHead>
          <TableHead className="text-right">Pérdida</TableHead>
          <TableHead className="hidden text-right md:table-cell">Sobrante</TableHead>
          <TableHead className="text-right">Neto</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id ?? "none"}>
            <TableCell className="whitespace-normal">
              <div className="font-medium">{r.name}</div>
              {r.detail ? <div className="text-muted-foreground text-xs">{r.detail}</div> : null}
            </TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{r.movements}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(r.unitsOut, 3)}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(r.unitsIn, 3)}</TableCell>
            <TableCell className="text-right">
              <Money value={r.valueOut} />
            </TableCell>
            <TableCell className="hidden text-right md:table-cell">
              <Money value={r.valueIn} />
            </TableCell>
            <TableCell className="text-right">
              <Money value={r.net} colored />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{totals.movements}</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(totals.unitsOut, 3)}</TableCell>
          <TableCell className="hidden text-right tabular-nums md:table-cell">{formatQty(totals.unitsIn, 3)}</TableCell>
          <TableCell className="text-right">
            <Money value={totals.valueOut} />
          </TableCell>
          <TableCell className="hidden text-right md:table-cell">
            <Money value={totals.valueIn} />
          </TableCell>
          <TableCell className="text-right">
            <Money value={totals.net} colored />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function MovementsTable({ rows }: { rows: AdjustmentMovementRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="hidden md:table-cell">Documento</TableHead>
          <TableHead className="hidden md:table-cell">Usuario</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="text-muted-foreground tabular-nums">{formatDateTime(m.createdAt)}</TableCell>
            <TableCell className="whitespace-normal">
              <Link href={`/productos/${m.productId}`} className="font-medium hover:underline">
                {m.productName}
              </Link>
              <div className="text-muted-foreground text-xs">
                {MOVEMENT_TYPE_LABEL[m.type]}
                {m.reasonName ? ` · ${m.reasonName}` : ""}
                {m.notes ? ` · ${m.notes}` : ""}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {Number(m.quantity) > 0 ? "+" : ""}
              {formatQty(m.quantity, m.unitDecimals)} {m.unitSymbol}
            </TableCell>
            <TableCell className="text-right">
              <Money value={m.value} colored />
            </TableCell>
            <TableCell className="hidden md:table-cell">
              {m.documentHref && m.documentNumber ? (
                <Link href={m.documentHref} className="hover:underline">
                  {m.documentNumber}
                </Link>
              ) : (
                (m.documentNumber ?? "—")
              )}
            </TableCell>
            <TableCell className="text-muted-foreground hidden md:table-cell">{m.userName ?? "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function AdjustmentsReportPage({ searchParams }: { searchParams: SearchParams }) {
  await requireRole("admin");
  const params = await searchParams;
  const today = businessDate();
  const range = parseDateRange(params, today);
  const report = await getAdjustmentsReport(range, { movementLimit: MOVEMENT_LIMIT });
  const hasData = report.totals.movements > 0;
  const lossReasons = report.byReason.filter((r) => Number(r.valueOut) > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/reportes", label: "Volver a reportes" }}
        title="Ajustes y mermas"
        description={describeRange(range)}
        actions={
          <>
            <ExportButton report="adjustments" params={{ from: range.from, to: range.to }} disabled={!hasData} />
          </>
        }
      />

      <PeriodFilter range={range} today={today} />

      {!hasData ? (
        <EmptyState
          icon={PackageMinus}
          title="No hubo ajustes en este período"
          description="Aquí aparecen los ajustes de inventario (mermas, daños, uso interno) y las diferencias de los conteos físicos."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Pérdidas"
              value={<Money value={report.totals.valueOut} />}
              hint={`${formatQty(report.totals.unitsOut, 3)} unidades retiradas, a costo`}
            />
            <KpiCard label="Sobrantes" value={<Money value={report.totals.valueIn} />} hint={`${formatQty(report.totals.unitsIn, 3)} unidades agregadas`} />
            <KpiCard label="Neto" value={<Money value={report.totals.net} colored />} hint="Sobrantes menos pérdidas" />
            <KpiCard
              label="Movimientos"
              value={report.totals.movements}
              hint={`${report.products} ${report.products === 1 ? "producto afectado" : "productos afectados"}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle</CardTitle>
              <CardDescription>
                Valorizado al costo de cada movimiento. {lossReasons[0] ? `Motivo con más pérdida: ${lossReasons[0].name}.` : ""} Las correcciones de una
                importación de Excel no cuentan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="motivos">
                <TabsList>
                  <TabsTrigger value="motivos">Por motivo</TabsTrigger>
                  <TabsTrigger value="productos">Por producto</TabsTrigger>
                  <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
                </TabsList>
                <TabsContent value="motivos">
                  <GroupTable rows={report.byReason} totals={report.totals} firstColumn="Motivo" />
                </TabsContent>
                <TabsContent value="productos">
                  <GroupTable rows={report.byProduct} totals={report.totals} firstColumn="Producto" />
                </TabsContent>
                <TabsContent value="movimientos" className="space-y-2">
                  <MovementsTable rows={report.movements} />
                  {report.totals.movements > report.movements.length ? (
                    <p className="text-muted-foreground text-sm">
                      Se muestran los últimos {report.movements.length} de {report.totals.movements} movimientos. Exporta a Excel para verlos todos.
                    </p>
                  ) : null}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
