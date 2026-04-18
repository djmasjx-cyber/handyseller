export type ServiceFlag = 'EXPRESS' | 'HAZMAT' | 'CONSOLIDATED' | 'AIR' | 'OVERSIZED';

export type CarrierMode = 'ROAD' | 'AIR' | 'COURIER' | 'PICKUP' | 'FLEET';

export type CarrierCode = 'MAJOR_EXPRESS' | 'DELLIN';

export type CarrierServiceType = 'EXPRESS' | 'LTL';

export type OrderLogisticsScenario = 'MARKETPLACE_RC' | 'CARRIER_DELIVERY';

export type TmsOrderStatus =
  | 'NO_REQUEST'
  | 'DRAFT'
  | 'QUOTED'
  | 'BOOKED'
  | 'IN_TRANSIT'
  | 'DELIVERED';

export type ShipmentRequestStatus = 'DRAFT' | 'QUOTED' | 'BOOKED';

export type ShipmentStatus =
  | 'CREATED'
  | 'CONFIRMED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export interface CargoSnapshot {
  weightGrams: number;
  widthMm: number | null;
  lengthMm: number | null;
  heightMm: number | null;
  places: number;
  declaredValueRub: number;
}

export interface CoreOrderSnapshot {
  sourceSystem: 'HANDYSELLER_CORE';
  userId: string;
  coreOrderId: string;
  coreOrderNumber: string;
  marketplace: string;
  logisticsScenario?: OrderLogisticsScenario;
  createdAt: string;
  originLabel: string | null;
  destinationLabel: string | null;
  cargo: CargoSnapshot;
  itemSummary: Array<{
    productId: string | null;
    title: string;
    quantity: number;
    weightGrams: number | null;
  }>;
}

export interface ShipmentRequestDraft {
  originLabel: string;
  destinationLabel: string;
  serviceFlags: ServiceFlag[];
  notes?: string;
}

export interface ClientOrderRecord {
  id: string;
  externalId: string;
  marketplace: string;
  status: string;
  totalAmount: number;
  warehouseName?: string | null;
  createdAt: string;
  logisticsScenario: OrderLogisticsScenario;
  items: Array<{ title: string; quantity: number }>;
}

export interface ClientOrderWithTmsStatusRecord extends ClientOrderRecord {
  tmsStatus: TmsOrderStatus;
  requestId?: string;
  shipmentId?: string;
}

export interface CarrierDescriptor {
  id: string;
  code?: CarrierCode;
  name: string;
  modes: CarrierMode[];
  supportedFlags: ServiceFlag[];
  supportsTracking: boolean;
  supportsBooking: boolean;
  requiresCredentials?: boolean;
}

export interface CarrierQuote {
  id: string;
  requestId: string;
  carrierId: string;
  carrierName: string;
  mode: CarrierMode;
  priceRub: number;
  etaDays: number;
  serviceFlags: ServiceFlag[];
  notes?: string;
  score: number;
}

export interface ShipmentRequestRecord {
  id: string;
  userId: string;
  source: 'CORE_ORDER';
  status: ShipmentRequestStatus;
  snapshot: CoreOrderSnapshot;
  draft: ShipmentRequestDraft;
  createdAt: string;
  updatedAt: string;
  selectedQuoteId?: string;
}

export interface ShipmentRecord {
  id: string;
  userId: string;
  requestId: string;
  carrierId: string;
  carrierName: string;
  trackingNumber: string;
  status: ShipmentStatus;
  priceRub: number;
  etaDays: number;
  createdAt: string;
}

export interface ShipmentDocumentRecord {
  id: string;
  shipmentId: string;
  type: 'WAYBILL' | 'LABEL' | 'INVOICE';
  title: string;
  content: string;
  createdAt: string;
}

export interface TrackingEventRecord {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  description: string;
  occurredAt: string;
  location?: string;
}

export interface TmsOverview {
  carriersCount: number;
  requestsCount: number;
  quotedCount: number;
  bookedCount: number;
  activeShipmentsCount: number;
}

export interface RoutingPolicyRecord {
  id: string;
  name: string;
  mode: 'MANUAL_ASSIST' | 'RULE_BASED';
  active: boolean;
  description: string;
}

export interface CarrierConnectionRecord {
  id: string;
  carrierCode: CarrierCode;
  serviceType: CarrierServiceType;
  accountLabel: string | null;
  contractLabel: string | null;
  loginPreview: string | null;
  isDefault: boolean;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertCarrierConnectionInput {
  id?: string;
  carrierCode: CarrierCode;
  serviceType?: CarrierServiceType;
  accountLabel?: string;
  contractLabel?: string;
  /** Ключ приложения (например Деловые Линии), опционально для ТК без отдельного appKey */
  appKey?: string;
  login: string;
  password: string;
  isDefault?: boolean;
}

export interface InternalCarrierCredentials {
  id: string;
  carrierCode: CarrierCode;
  serviceType: CarrierServiceType;
  accountLabel: string | null;
  contractLabel: string | null;
  /** Расшифрованный appKey, если был сохранён (Деловые Линии и др.) */
  appKey?: string | null;
  login: string;
  password: string;
}

export interface CreateShipmentRequestInput {
  snapshot: CoreOrderSnapshot;
  draft: ShipmentRequestDraft;
}

export interface CreateShipmentRequestResult {
  request: ShipmentRequestRecord;
  quotes: CarrierQuote[];
}
