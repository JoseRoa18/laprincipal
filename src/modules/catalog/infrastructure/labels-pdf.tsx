import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { formatMoney } from "@/lib/format";
import { LABEL_FORMATS, mmToPt, truncateLabel, type LabelFormat } from "../domain/labels";
import { barcodePng } from "./barcode-image";
import type { LabelData } from "./labels-data";

const styles = StyleSheet.create({
  cell: { position: "absolute", padding: mmToPt(1.5), overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between" },
  name: { fontSize: 7, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  meta: { fontSize: 6, color: "#333333" },
  row: { display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  price: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  barcode: { objectFit: "contain", width: "100%" },
  empty: { fontSize: 6, color: "#999999", textAlign: "center" },
});

interface LabelCellProps {
  label: LabelData;
  png: string | null;
  showPrice: boolean;
  width: number;
  height: number;
  left: number;
  top: number;
}

function LabelCell({ label, png, showPrice, width, height, left, top }: LabelCellProps) {
  const barcodeHeight = height * 0.46;
  return (
    <View style={[styles.cell, { width, height, left, top }]}>
      <Text style={styles.name}>{truncateLabel(label.name, 44)}</Text>
      <View style={styles.row}>
        <Text style={styles.meta}>{label.partNumber ? `Ref. ${truncateLabel(label.partNumber, 18)}` : label.sku}</Text>
        {showPrice && label.priceUsd ? <Text style={styles.price}>{formatMoney(label.priceUsd, "USD")}</Text> : null}
      </View>
      {png ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt prop
        <Image src={png} style={[styles.barcode, { height: barcodeHeight }]} />
      ) : (
        <Text style={styles.empty}>Sin código de barras · {label.sku}</Text>
      )}
    </View>
  );
}

export interface RenderLabelsInput {
  format: LabelFormat;
  /** One entry per physical label (repeat a product to print several). */
  labels: LabelData[];
  showPrice: boolean;
}

export async function renderLabelsPdf(input: RenderLabelsInput): Promise<Buffer> {
  const layout = LABEL_FORMATS[input.format];
  const pngCache = new Map<string, string>();
  for (const l of input.labels) {
    if (!l.barcode || pngCache.has(l.barcode)) continue;
    const buf = await barcodePng(l.barcode, l.barcodeType, { scale: 3, height: 8 });
    pngCache.set(l.barcode, `data:image/png;base64,${buf.toString("base64")}`);
  }

  const pageW = mmToPt(layout.pageWidthMm);
  const pageH = mmToPt(layout.pageHeightMm);
  const cellW = mmToPt(layout.cellWidthMm);
  const cellH = mmToPt(layout.cellHeightMm);
  const perPage = layout.cols * layout.rows;
  const pages: LabelData[][] = [];
  for (let i = 0; i < input.labels.length; i += perPage) pages.push(input.labels.slice(i, i + perPage));
  if (pages.length === 0) pages.push([]);

  const doc = (
    <Document title="Etiquetas" author="La Principal 2050">
      {pages.map((items, pageIndex) => (
        <Page key={pageIndex} size={[pageW, pageH]} style={{ padding: 0 }}>
          {items.map((label, i) => {
            const col = i % layout.cols;
            const row = Math.floor(i / layout.cols);
            return (
              <LabelCell
                key={`${pageIndex}-${i}`}
                label={label}
                png={label.barcode ? (pngCache.get(label.barcode) ?? null) : null}
                showPrice={input.showPrice}
                width={cellW}
                height={cellH}
                left={col * cellW}
                top={row * cellH}
              />
            );
          })}
          {items.length === 0 ? <Text style={[styles.empty, { marginTop: 10 }]}>No hay productos seleccionados</Text> : null}
        </Page>
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
