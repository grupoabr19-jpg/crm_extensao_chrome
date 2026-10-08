import ExcelJS from "exceljs";

const normalizeHeader = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "");

export const normalizeCustomerName = (value) => String(value ?? "")
  .normalize("NFD")
  .replace(/\p{Diacritic}/gu, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

function cellValue(cell) {
  const value = cell?.value;
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    if ("result" in value) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value ?? null;
}

function headerMap(worksheet) {
  const headers = new Map();
  worksheet.getRow(1).eachCell((cell, column) => {
    const header = normalizeHeader(cellValue(cell));
    if (header) headers.set(header, column);
  });
  return headers;
}

function requireColumns(headers, required) {
  const missing = required.filter((column) => !headers.has(column));
  if (missing.length) throw new Error(`workbook_missing_columns:${missing.join(",")}`);
}

function text(cell) {
  const value = cellValue(cell);
  if (typeof value === "number" && String(cell?.text || "").trim()) return String(cell.text).trim();
  return value == null ? "" : String(value).trim();
}

function field(row, headers, name) {
  const column = headers.get(name);
  return column ? row.getCell(column) : null;
}

function numeric(cell) {
  const value = cellValue(cell);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const input = String(value ?? "").trim();
  if (!input) return null;
  const normalized = input.includes(",")
    ? input.replace(/\./g, "").replace(",", ".")
    : input;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function date(cell) {
  const value = cellValue(cell);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 0) {
    const timestamp = Date.UTC(1899, 11, 30) + value * 86400000;
    return new Date(timestamp).toISOString();
  }
  const input = String(value ?? "").trim();
  const brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input);
  const parsed = brazilian
    ? new Date(Date.UTC(Number(brazilian[3]), Number(brazilian[2]) - 1, Number(brazilian[1])))
    : new Date(input);
  return input && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("workbook_has_no_sheets");
  return worksheet;
}

export async function parseInactiveCustomers(buffer) {
  const worksheet = await loadWorkbook(buffer);
  const headers = headerMap(worksheet);
  requireColumns(headers, ["codcliente", "nomedocliente"]);
  const bySourceCode = new Map();
  let skippedRows = 0;
  let duplicateSourceCodes = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const sourceCode = text(field(row, headers, "codcliente"));
    const name = text(field(row, headers, "nomedocliente"));
    if (!sourceCode || !name) {
      if (sourceCode || name) skippedRows += 1;
      return;
    }
    if (bySourceCode.has(sourceCode)) {
      duplicateSourceCodes += 1;
      return;
    }
    bySourceCode.set(sourceCode, {
      sourceCode,
      name,
      normalizedName: normalizeCustomerName(name),
      phone: text(field(row, headers, "celular")) || null,
      email: text(field(row, headers, "email")).toLowerCase() || null,
      profile: {
        sourceSystem: "clientes_inativos",
        sourceCustomerCode: sourceCode,
        createdAt: date(field(row, headers, "datacriacaopn")),
        city: text(field(row, headers, "cidade")) || null,
        state: text(field(row, headers, "estado")) || null,
        creditLimit: numeric(field(row, headers, "limitedecredito")),
        email: text(field(row, headers, "email")).toLowerCase() || null,
        daysSinceLastSale: numeric(field(row, headers, "menordiasultimavenda")),
        lastPurchaseRange: text(field(row, headers, "faixaultimacompra")) || null,
        seller: text(field(row, headers, "vendedor")) || null,
        regionCode: text(field(row, headers, "codigoregiao")) || null,
        region: text(field(row, headers, "regiao")) || null,
        segment: text(field(row, headers, "segmento")) || null,
        sellerType: text(field(row, headers, "tipodevendedor")) || null
      }
    });
  });

  return {
    customers: [...bySourceCode.values()],
    skippedRows,
    duplicateSourceCodes,
    sourceRows: Math.max(worksheet.rowCount - 1, 0)
  };
}

export async function parseProductionHistory(buffer) {
  const worksheet = await loadWorkbook(buffer);
  const headers = headerMap(worksheet);
  requireColumns(headers, ["cliente", "pedido", "total"]);
  const summaries = new Map();
  let skippedRows = 0;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = text(field(row, headers, "cliente"));
    const normalizedName = normalizeCustomerName(name);
    if (!normalizedName) {
      if (text(field(row, headers, "pedido"))) skippedRows += 1;
      return;
    }
    let summary = summaries.get(normalizedName);
    if (!summary) {
      summary = { normalizedName, itemCount: 0, orders: new Set(), totalSales: 0, lastPurchaseAt: null };
      summaries.set(normalizedName, summary);
    }
    summary.itemCount += 1;
    const order = text(field(row, headers, "pedido"));
    if (order) summary.orders.add(order);
    summary.totalSales += numeric(field(row, headers, "total")) || 0;
    const purchasedAt = date(field(row, headers, "datadocumentopedido"))
      || date(field(row, headers, "dataentradapedido"));
    if (purchasedAt && (!summary.lastPurchaseAt || purchasedAt > summary.lastPurchaseAt)) {
      summary.lastPurchaseAt = purchasedAt;
    }
  });

  return {
    summaries: [...summaries.values()].map(({ orders, ...summary }) => ({
      ...summary,
      orderCount: orders.size
    })),
    sourceRows: Math.max(worksheet.rowCount - 1, 0),
    skippedRows
  };
}
