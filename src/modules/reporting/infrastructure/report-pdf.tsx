import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { APP_LOCALE, formatDateTime } from "@/lib/format";
import type { CellKind, Sheet } from "./excel";

/**
 * PDF version of a report, built from the same sheets as the Excel export:
 * one section per sheet, the title and column headers repeat on every page.
 * Plain function components without hooks (see sales/infrastructure/pdf).
 */

/** Long tables stay readable in Excel; the PDF keeps the first rows. */
export const PDF_MAX_ROWS = 2000;

const styles = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 36, paddingHorizontal: 28, fontFamily: "Helvetica", color: "#111" },
  header: { marginBottom: 6 },
  company: { fontSize: 8, color: "#555", textTransform: "uppercase" },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 2 },
  note: { fontSize: 9, color: "#444", marginTop: 1 },
  sheetName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#888", backgroundColor: "#efefef", fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d4d4d4" },
  cell: { paddingVertical: 2.5, paddingHorizontal: 3 },
  right: { textAlign: "right" },
  empty: { fontSize: 9, color: "#555", marginTop: 8 },
  truncated: { fontSize: 8, color: "#555", marginTop: 6 },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: "#666" },
});

const NUMBER_FORMATS: Record<Exclude<CellKind, "text">, Intl.NumberFormat> = {
  money: new Intl.NumberFormat(APP_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  qty: new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 3 }),
  int: new Intl.NumberFormat(APP_LOCALE, { maximumFractionDigits: 0 }),
  pct: new Intl.NumberFormat(APP_LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

function formatCell(value: unknown, kind: CellKind): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return formatDateTime(value);
  if (kind === "text") return String(value);
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const out = NUMBER_FORMATS[kind].format(n);
  return kind === "pct" ? `${out} %` : out;
}

function SheetPage({ sheet, companyName, generatedAt }: { sheet: Sheet; companyName: string; generatedAt: string }) {
  const [title, ...notes] = sheet.notes ?? [sheet.name];
  const totalWidth = sheet.columns.reduce((acc, c) => acc + (c.width ?? 12), 0);
  const landscape = totalWidth > 110 || sheet.columns.length > 7;
  const fontSize = sheet.columns.length > 10 ? 6.5 : sheet.columns.length > 7 ? 7.5 : 8.5;
  const widths = sheet.columns.map((c) => `${(((c.width ?? 12) / totalWidth) * 100).toFixed(2)}%`);
  const rows = sheet.rows.slice(0, PDF_MAX_ROWS) as ReadonlyArray<Record<string, unknown>>;

  return (
    <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={[styles.page, { fontSize }]}>
      <View fixed style={styles.header}>
        <Text style={styles.company}>{companyName}</Text>
        <Text style={styles.title}>{title}</Text>
        {notes.map((n) => (
          <Text key={n} style={styles.note}>
            {n}
          </Text>
        ))}
        {sheet.notes?.length ? <Text style={styles.sheetName}>{sheet.name}</Text> : null}
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>Sin datos para este período.</Text>
      ) : (
        <View fixed style={styles.head}>
          {sheet.columns.map((c, i) => (
            <Text key={c.key} style={[styles.cell, { width: widths[i] }, c.kind && c.kind !== "text" ? styles.right : {}]}>
              {c.header}
            </Text>
          ))}
        </View>
      )}
      {rows.map((row, r) => (
        <View key={r} style={styles.row} wrap={false}>
          {sheet.columns.map((c, i) => (
            <Text key={c.key} style={[styles.cell, { width: widths[i] }, c.kind && c.kind !== "text" ? styles.right : {}]}>
              {formatCell(row[c.key], c.kind ?? "text")}
            </Text>
          ))}
        </View>
      ))}
      {sheet.rows.length > PDF_MAX_ROWS ? (
        <Text style={styles.truncated}>
          Se muestran las primeras {NUMBER_FORMATS.int.format(PDF_MAX_ROWS)} filas de {NUMBER_FORMATS.int.format(sheet.rows.length)}. El archivo de Excel las tiene todas.
        </Text>
      ) : null}
      <View fixed style={styles.footer}>
        <Text>Generado el {generatedAt}</Text>
        <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
      </View>
    </Page>
  );
}

export async function buildReportPdf(sheets: Sheet[], opts: { companyName: string; title: string }): Promise<Buffer> {
  const generatedAt = formatDateTime(new Date());
  return renderToBuffer(
    <Document title={opts.title} author={opts.companyName} creator="La Principal 2050">
      {sheets.map((sheet) => (
        <SheetPage key={sheet.name} sheet={sheet} companyName={opts.companyName} generatedAt={generatedAt} />
      ))}
    </Document>,
  );
}
