export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  initial: "Inventario inicial",
  purchase_in: "Entrada por compra",
  purchase_void_out: "Anulación de compra",
  manual_in: "Entrada manual",
  manual_out: "Salida manual",
  sale_out: "Venta",
  sale_void_in: "Anulación de venta",
  return_in: "Devolución de cliente",
  adjust_in: "Ajuste (entrada)",
  adjust_out: "Ajuste (salida)",
  count_adjust: "Conteo físico",
};

export const BARCODE_TYPE_LABEL: Record<string, string> = {
  EAN13: "EAN-13",
  UPC: "UPC-A",
  CODE128: "Code 128",
  INTERNAL: "Interno",
};

export const IMAGE_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  processed: "Fondo blanco",
  original_only: "Original",
  failed: "Falló",
};

export const IMPORT_STATUS_LABEL: Record<string, string> = {
  validating: "Validando",
  ready: "Lista para aplicar",
  applied: "Aplicada",
  failed: "Falló",
  undone: "Deshecha",
};

export const STOCK_MODE_LABEL: Record<string, string> = {
  manual: "Manual (mínimo y máximo)",
  auto: "Automático (velocidad de venta)",
};
