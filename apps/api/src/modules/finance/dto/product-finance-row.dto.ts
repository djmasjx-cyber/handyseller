export interface MarketplaceCommissionBlock {
  marketplace: string;
  scheme: string;
  salesCommissionPct: number;
  salesCommissionAmt: number;
  logisticsAmt: number;
  firstMileAmt: number;
  returnAmt: number;
  acceptanceAmt: number;
  totalFeeAmt: number;
  /** FBO only: стоимость хранения на складе в рублях за 1 день (извлекается из rawData) */
  storageCostPerDay: number;
  syncedAt: string | null;
}

export interface ProductFinanceRow {
  productId: string;
  displayId: number;
  title: string;
  article: string | null;
  imageUrl: string | null;
  cost: number;
  price: number | null;
  commissions: MarketplaceCommissionBlock[];
}
