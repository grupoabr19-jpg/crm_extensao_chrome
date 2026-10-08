export interface ImportedCustomerRecord {
  sourceCode: string;
  name: string;
  normalizedName: string;
  phone: string | null;
  email: string | null;
  profile: Record<string, string | number | null>;
}

export interface PurchaseSummary {
  normalizedName: string;
  itemCount: number;
  orderCount: number;
  totalSales: number;
  lastPurchaseAt: string | null;
}

export function normalizeCustomerName(value: unknown): string;
export function parseInactiveCustomers(buffer: Uint8Array): Promise<{
  customers: ImportedCustomerRecord[];
  skippedRows: number;
  duplicateSourceCodes: number;
  sourceRows: number;
}>;
export function parseProductionHistory(buffer: Uint8Array): Promise<{
  summaries: PurchaseSummary[];
  sourceRows: number;
  skippedRows: number;
}>;
