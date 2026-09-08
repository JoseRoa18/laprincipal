"use client";

import { Calculator, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { closeCashSessionAction } from "@/app/(app)/caja/actions";
import { Money } from "@/components/app/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney, parseLocalizedNumber } from "@/lib/format";
import { D } from "@/lib/money";
import { denominationsFor, sumDenominations } from "@/modules/cash/domain/denominations";
import { computeDifference } from "@/modules/cash/domain/summary";
import { AmountInput } from "./amount-input";

export interface CloseCurrency {
  code: string;
  symbol: string;
  decimals: number;
  /** Expected cash (kept hidden until the user types a count). */
  expected: string;
}

export interface ElectronicMethod {
  paymentMethodId: string;
  name: string;
  currencyCode: string;
  count: number;
  amount: string;
  amountUsd: string;
  refundsAmount: string;
}

export interface ReferenceRow {
  paymentMethodId: string;
  methodName: string;
  currencyCode: string;
  amount: string;
  reference: string | null;
  saleNumber: string | null;
  /** ISO timestamp */
  at: string | null;
}

export function CloseSessionForm({
  sessionNumber,
  currencies,
  methods,
  references,
}: {
  sessionNumber: string;
  currencies: CloseCurrency[];
  methods: ElectronicMethod[];
  references: ReferenceRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [helperOpen, setHelperOpen] = useState<Record<string, boolean>>({});
  const [bills, setBills] = useState<Record<string, Record<string, string>>>({});
  const [justification, setJustification] = useState<Record<string, string>>({});
  const [reconciled, setReconciled] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const parsedCount = (code: string): string | null => {
    const raw = counted[code];
    if (raw === undefined || raw.trim() === "") return null;
    return parseLocalizedNumber(raw);
  };
  const differenceFor = (c: CloseCurrency): string | null => {
    const n = parsedCount(c.code);
    return n === null ? null : computeDifference(c.expected, n);
  };

  const missing = currencies.filter((c) => parsedCount(c.code) === null);
  const withDifference = currencies.filter((c) => {
    const d = differenceFor(c);
    return d !== null && !D(d).isZero();
  });
  const missingJustification = withDifference.filter((c) => !(justification[c.code] ?? "").trim());
  const canSubmit = missing.length === 0 && missingJustification.length === 0 && !pending;

  function setBill(code: string, bill: number, value: string) {
    const next = { ...(bills[code] ?? {}), [String(bill)]: value };
    setBills((prev) => ({ ...prev, [code]: next }));
    const total = D(sumDenominations(next));
    setCounted((prev) => ({ ...prev, [code]: total.toFixed(currencies.find((c) => c.code === code)?.decimals ?? 2).replace(/\.?0+$/, "") || "0" }));
  }

  function submit() {
    startTransition(async () => {
      const denominations: Record<string, Record<string, number>> = {};
      for (const [code, map] of Object.entries(bills)) {
        const clean: Record<string, number> = {};
        for (const [bill, n] of Object.entries(map)) {
          const v = Number(n);
          if (n !== "" && Number.isInteger(v) && v >= 0) clean[bill] = v;
        }
        if (Object.keys(clean).length) denominations[code] = clean;
      }
      const result = await closeCashSessionAction({
        counts: currencies.map((c) => ({ currencyCode: c.code, counted: counted[c.code] ?? "", justification: justification[c.code] || undefined })),
        denominations,
        reconciled,
        closingNotes: notes || undefined,
      });
      if (result.ok) {
        toast.success(`Caja ${result.data.number ?? sessionNumber} cerrada`);
        router.push(`/caja/historial/${result.data.id}`);
        router.refresh();
      } else {
        const fields = (result.error.details?.fields ?? {}) as Record<string, string>;
        setFieldErrors(fields);
        toast.error(result.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" /> Conteo ciego de efectivo
          </CardTitle>
          <CardDescription>Cuenta el dinero de la gaveta antes de ver el monto esperado. La diferencia aparece al escribir el conteo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-2">
          {currencies.map((c) => {
            const diff = differenceFor(c);
            const denominations = denominationsFor(c.code);
            const err = fieldErrors[`justification.${c.code}`];
            return (
              <div key={c.code} className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">Efectivo {c.code === "USD" ? "en dólares" : c.code === "COP" ? "en pesos" : c.code}</h3>
                  {denominations.length > 0 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setHelperOpen((p) => ({ ...p, [c.code]: !p[c.code] }))}>
                      <Calculator />
                      {helperOpen[c.code] ? "Ocultar billetes" : "Contar por billetes"}
                    </Button>
                  ) : null}
                </div>

                {helperOpen[c.code] ? (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-3">
                    {denominations.map((bill) => (
                      <div key={bill} className="space-y-1">
                        <Label htmlFor={`bill-${c.code}-${bill}`} className="text-muted-foreground text-xs">
                          {formatMoney(bill, c.code)}
                        </Label>
                        <Input
                          id={`bill-${c.code}-${bill}`}
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          placeholder="0"
                          className="h-10 text-center tabular-nums"
                          value={bills[c.code]?.[String(bill)] ?? ""}
                          onChange={(e) => setBill(c.code, bill, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                <Field>
                  <FieldLabel htmlFor={`counted-${c.code}`}>Efectivo contado</FieldLabel>
                  <AmountInput
                    id={`counted-${c.code}`}
                    symbol={c.symbol}
                    value={counted[c.code] ?? ""}
                    onChange={(e) => setCounted((p) => ({ ...p, [c.code]: e.target.value }))}
                    aria-invalid={counted[c.code] !== undefined && counted[c.code] !== "" && parsedCount(c.code) === null}
                  />
                  {counted[c.code] && parsedCount(c.code) === null ? <FieldError>Escribe un monto válido</FieldError> : null}
                </Field>

                {diff !== null ? (
                  <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                    <dt className="text-muted-foreground">Esperado</dt>
                    <dd className="text-right">
                      <Money value={c.expected} currency={c.code} />
                    </dd>
                    <dt className="text-muted-foreground">Diferencia</dt>
                    <dd className="text-right font-medium">
                      {D(diff).isZero() ? <span className="text-emerald-700 dark:text-emerald-400">Cuadra</span> : <Money value={diff} currency={c.code} colored />}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-muted-foreground text-xs">Escribe el conteo para ver el esperado y la diferencia.</p>
                )}

                {diff !== null && !D(diff).isZero() ? (
                  <Field data-invalid={Boolean(err) || undefined}>
                    <FieldLabel htmlFor={`just-${c.code}`}>Justificación de la diferencia</FieldLabel>
                    <Textarea
                      id={`just-${c.code}`}
                      rows={2}
                      placeholder={D(diff).lt(0) ? "Ej. faltó un billete al dar cambio" : "Ej. sobró por un vuelto no entregado"}
                      value={justification[c.code] ?? ""}
                      onChange={(e) => setJustification((p) => ({ ...p, [c.code]: e.target.value }))}
                    />
                    {err ? <FieldError>{err}</FieldError> : <FieldDescription>Obligatoria cuando el conteo no cuadra.</FieldDescription>}
                  </Field>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pagos electrónicos</CardTitle>
          <CardDescription>Revisa las referencias de Pago Móvil, Punto de venta, Zelle y Binance contra tus cuentas y marca cada método como conciliado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {methods.length === 0 ? (
            <p className="text-muted-foreground text-sm">No hubo pagos electrónicos en esta sesión.</p>
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Pagos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">En USD</TableHead>
                    <TableHead className="text-center">Conciliado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {methods.map((m) => (
                    <TableRow key={m.paymentMethodId}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                      <TableCell className="text-right">
                        <Money value={m.amount} currency={m.currencyCode} />
                        {D(m.refundsAmount).gt(0) ? (
                          <span className="text-muted-foreground block text-xs">
                            − <Money value={m.refundsAmount} currency={m.currencyCode} /> devueltos
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={m.amountUsd} currency="USD" />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          aria-label={`Conciliado ${m.name}`}
                          checked={Boolean(reconciled[m.paymentMethodId])}
                          onCheckedChange={(checked) => setReconciled((p) => ({ ...p, [m.paymentMethodId]: checked }))}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {references.length > 0 ? (
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium">Ver referencias ({references.length})</summary>
              <div className="mt-2 rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Venta</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {references.map((r, i) => (
                      <TableRow key={`${r.saleNumber}-${i}`}>
                        <TableCell>{r.at ? formatDateTime(r.at).slice(11) : ""}</TableCell>
                        <TableCell>{r.saleNumber ?? "—"}</TableCell>
                        <TableCell>{r.methodName}</TableCell>
                        <TableCell className="font-mono text-xs">{r.reference ?? <span className="text-muted-foreground">sin referencia</span>}</TableCell>
                        <TableCell className="text-right">
                          <Money value={r.amount} currency={r.currencyCode} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notas del cierre</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea rows={2} placeholder="Opcional" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </CardContent>
      </Card>

      <div className="bg-background/95 sticky bottom-16 z-10 flex flex-col gap-2 border-t py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between md:bottom-0">
        <p className="text-muted-foreground text-sm">
          {missing.length > 0
            ? `Falta contar: ${missing.map((c) => c.code).join(", ")}`
            : missingJustification.length > 0
              ? `Justifica la diferencia en ${missingJustification.map((c) => c.code).join(", ")}`
              : "Todo listo para cerrar."}
        </p>
        <Button size="lg" onClick={submit} disabled={!canSubmit}>
          {pending ? "Cerrando..." : "Cerrar caja"}
        </Button>
      </div>
    </div>
  );
}
