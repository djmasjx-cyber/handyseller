import type { CoreOrderSnapshot } from '@handyseller/tms-sdk';

type OrderProduct = {
  id: string;
  title: string;
  weight: number | null;
  width: number | null;
  length: number | null;
  height: number | null;
};

type OrderItem = {
  quantity: number;
  product: OrderProduct | null;
};

type CoreOrderForSnapshot = {
  id: string;
  externalId: string;
  marketplace: string;
  createdAt: Date;
  warehouseName: string | null;
  deliveryAddressLabel: string | null;
  totalAmount: unknown;
  tmsCargoOverride: unknown;
  tmsContactOverride: unknown;
  items: OrderItem[];
};

export class CoreToTmsSnapshotAcl {
  static map(userId: string, order: CoreOrderForSnapshot): CoreOrderSnapshot {
    const totalWeightGrams = order.items.reduce(
      (sum, item) => sum + (item.product?.weight ?? 0) * item.quantity,
      0,
    );
    const maxWidthMm = order.items.reduce(
      (max, item) => Math.max(max, item.product?.width ?? 0),
      0,
    );
    const maxLengthMm = order.items.reduce(
      (max, item) => Math.max(max, item.product?.length ?? 0),
      0,
    );
    const totalHeightMm = order.items.reduce(
      (sum, item) => sum + (item.product?.height ?? 0) * item.quantity,
      0,
    );

    const cargoOv = this.parseCargoOverride(order.tmsCargoOverride);
    const contactOv = this.parseContactOverride(order.tmsContactOverride);
    const destinationLabel =
      order.deliveryAddressLabel?.trim() ||
      (order.marketplace === 'MANUAL' ? 'Ручной канал' : `${order.marketplace} order`);

    return {
      sourceSystem: 'HANDYSELLER_CORE',
      userId,
      coreOrderId: order.id,
      coreOrderNumber: order.externalId,
      marketplace: order.marketplace,
      logisticsScenario: order.marketplace === 'MANUAL' ? 'CARRIER_DELIVERY' : 'MARKETPLACE_RC',
      createdAt: order.createdAt.toISOString(),
      originLabel: order.warehouseName ?? null,
      destinationLabel,
      contacts: {
        shipper: {
          name: contactOv?.shipperName ?? null,
          phone: contactOv?.shipperPhone ?? null,
        },
        recipient: {
          name: contactOv?.recipientName ?? null,
          phone: contactOv?.recipientPhone ?? null,
        },
      },
      pickupDatePreferred: cargoOv?.pickupDate ?? null,
      cargo: {
        weightGrams: cargoOv?.weightGrams ?? totalWeightGrams,
        widthMm: cargoOv?.widthMm ?? (maxWidthMm || null),
        lengthMm: cargoOv?.lengthMm ?? (maxLengthMm || null),
        heightMm: cargoOv?.heightMm ?? (totalHeightMm || null),
        places: cargoOv?.places ?? Math.max(order.items.length, 1),
        declaredValueRub: cargoOv?.declaredValueRub ?? Number(order.totalAmount),
      },
      itemSummary: order.items.map((item) => ({
        productId: item.product?.id ?? null,
        title: cargoOv?.cargoDescription || item.product?.title || 'Товар',
        quantity: item.quantity,
        weightGrams: item.product?.weight ?? null,
      })),
    };
  }

  private static parseCargoOverride(raw: unknown): {
    weightGrams?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    places?: number;
    declaredValueRub?: number;
    cargoDescription?: string;
    pickupDate?: string;
  } | null {
    if (raw == null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() || undefined : undefined);
    return {
      weightGrams: num(o.weightGrams),
      lengthMm: num(o.lengthMm),
      widthMm: num(o.widthMm),
      heightMm: num(o.heightMm),
      places: num(o.places),
      declaredValueRub: num(o.declaredValueRub),
      cargoDescription: str(o.cargoDescription),
      pickupDate: str(o.pickupDate),
    };
  }

  private static parseContactOverride(raw: unknown): {
    shipperName?: string;
    shipperPhone?: string;
    recipientName?: string;
    recipientPhone?: string;
  } | null {
    if (raw == null || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() || undefined : undefined);
    return {
      shipperName: str(o.shipperName),
      shipperPhone: str(o.shipperPhone),
      recipientName: str(o.recipientName),
      recipientPhone: str(o.recipientPhone),
    };
  }
}
