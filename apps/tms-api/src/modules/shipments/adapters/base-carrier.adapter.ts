import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';

export interface CarrierAdapter {
  readonly descriptor: CarrierDescriptor;
  quote(input: CreateShipmentRequestInput, requestId: string): Promise<CarrierQuote | null>;
  book(quote: CarrierQuote): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
  }>;
}
