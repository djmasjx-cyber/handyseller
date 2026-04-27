import type {
  CarrierDescriptor,
  CarrierPickupPoint,
  CarrierQuote,
  CreateShipmentRequestInput,
  ShipmentDocumentRecord,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';

export interface CarrierQuoteContext {
  userId: string;
  authToken?: string | null;
  requestId?: string | null;
}

export interface CarrierBookInput {
  quote: CarrierQuote;
  input: CreateShipmentRequestInput;
  context: CarrierQuoteContext;
}

export interface CarrierDocumentDownloadInput {
  shipment: ShipmentRecord;
  document: ShipmentDocumentRecord;
  context: CarrierQuoteContext;
}

export interface CarrierShipmentRefreshInput {
  shipment: ShipmentRecord;
  context: CarrierQuoteContext;
}

export interface CarrierPickupPointSearchInput {
  city?: string;
  address?: string;
  lat?: number;
  lon?: number;
  limit?: number;
}

export interface CarrierAdapter {
  readonly descriptor: CarrierDescriptor;
  quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]>;
  book(payload: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>>;
  }>;
  downloadDocument?(
    payload: CarrierDocumentDownloadInput,
  ): Promise<{ content: Buffer; mimeType: string; fileName: string }>;
  refreshShipment?(
    payload: CarrierShipmentRefreshInput,
  ): Promise<{
    shipmentPatch: Partial<
      Pick<ShipmentRecord, 'trackingNumber' | 'carrierOrderNumber' | 'carrierOrderReference' | 'status'>
    >;
    tracking?: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>>;
  }>;
  listPickupPoints?(
    input: CarrierPickupPointSearchInput,
    context: CarrierQuoteContext,
  ): Promise<CarrierPickupPoint[]>;
}
