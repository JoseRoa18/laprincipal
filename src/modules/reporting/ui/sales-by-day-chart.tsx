"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { formatMoney, formatQty } from "@/lib/format";
import { formatDayLong, formatDayShort } from "../domain/date-range";
import { VIZ_ROOT } from "./viz";

export interface DayPoint {
  /** yyyy-MM-dd */
  day: string;
  total: number;
  count: number;
}

function compactUsd(value: number): string {
  if (Math.abs(value) >= 1000) return `$ ${formatQty(value / 1000, 1)} mil`;
  return `$ ${formatQty(value, 0)}`;
}

function DayTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: DayPoint }> }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="bg-popover text-popover-foreground rounded-lg border px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground text-xs">{formatDayLong(point.day)}</p>
      <p className="font-semibold tabular-nums">{formatMoney(point.total)}</p>
      <p className="text-muted-foreground text-xs">
        {point.count} {point.count === 1 ? "venta" : "ventas"}
      </p>
    </div>
  );
}

/**
 * Sales per day as a single-series column chart (one accent hue, thin
 * rounded columns, hairline grid, hover tooltip). Pair it with a table: the
 * chart is the picture, the table is the record.
 */
export function SalesByDayChart({ data, height = 240, label, className }: { data: DayPoint[]; height?: number; label: string; className?: string }) {
  const tickEvery = data.length > 16 ? Math.ceil(data.length / 8) - 1 : 0;
  return (
    <div className={cn(VIZ_ROOT, "w-full", className)} role="img" aria-label={label} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="25%">
          <CartesianGrid vertical={false} stroke="var(--border)" strokeWidth={1} />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayShort}
            interval={tickEvery}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            minTickGap={16}
          />
          <YAxis
            width={60}
            tickFormatter={compactUsd}
            tickLine={false}
            axisLine={false}
            tickCount={4}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          />
          <Tooltip cursor={{ fill: "var(--muted)" }} content={<DayTooltip />} />
          <Bar dataKey="total" fill="var(--viz-accent)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
