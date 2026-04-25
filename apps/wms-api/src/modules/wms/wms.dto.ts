import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type {
  WmsContainerType,
  WmsLocationType,
  WmsWarehouseKind,
} from '@handyseller/wms-sdk';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsIn(['PHYSICAL', 'VIRTUAL'])
  kind?: WmsWarehouseKind;
}

export class CreateLocationDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsIn([
    'WAREHOUSE',
    'ZONE',
    'AISLE',
    'RACK',
    'LEVEL',
    'SECTION',
    'SHELF',
    'BIN',
    'SUB_BIN',
    'BUFFER',
    'STAGING',
    'SHIPMENT_DOCK',
  ])
  type!: WmsLocationType;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsObject()
  capacity?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  constraints?: Record<string, unknown> | null;
}

export class CreateItemDto {
  @IsOptional()
  @IsString()
  coreProductId?: string | null;

  @IsString()
  @IsNotEmpty()
  sku!: string;

  @IsOptional()
  @IsString()
  article?: string | null;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  gtin?: string | null;

  @IsOptional()
  @IsBoolean()
  requiresDataMatrix?: boolean;

  @IsOptional()
  @IsBoolean()
  serialTracking?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  shelfLifeDays?: number | null;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, unknown>;
}

export class ReceiptLineDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsInt()
  @Min(1)
  expectedQty!: number;

  @IsOptional()
  @IsString()
  unitLabel?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @IsOptional()
  @IsString()
  sku?: string | null;

  @IsOptional()
  @IsString()
  lineTitle?: string | null;
}

export class CreateReceiptDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  number!: string;

  @IsOptional()
  @IsString()
  source?: string | null;

  @IsOptional()
  @IsString()
  supplierName?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineDto)
  lines!: ReceiptLineDto[];
}

export class ReserveReceiptBarcodesDto {
  @IsOptional()
  @IsString()
  receiptLineId?: string;
}

export class InvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  article!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;
}

export class CreateInvoiceReceiptDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];
}

export class UpdateItemAgxDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weightGrams!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  lengthMm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  widthMm!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  heightMm!: number;
}

export class CreateContainerDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsIn(['RECEIVING_TOTE', 'TOTE', 'BOX', 'PALLET', 'SHIPMENT_BATCH'])
  type!: WmsContainerType;

  @IsOptional()
  @IsString()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  parentContainerId?: string | null;
}

export class MoveInventoryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitBarcodes?: string[];

  @IsOptional()
  @IsString()
  containerBarcode?: string;

  @IsString()
  @IsNotEmpty()
  toLocationId!: string;

  @IsOptional()
  @IsBoolean()
  archiveTemporaryContainer?: boolean;
}

export class NestContainersDto {
  @IsString()
  @IsNotEmpty()
  parentBarcode!: string;

  @IsString()
  @IsNotEmpty()
  childBarcode!: string;
}

export class AssignPutawayTaskDto {
  @IsString()
  @IsNotEmpty()
  assigneeUserId!: string;
}

export class UnnestContainerDto {
  @IsString()
  @IsNotEmpty()
  childBarcode!: string;
}

export class CreatePutawayTaskDto {
  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  targetLocationId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  unitBarcodes?: string[];

  @IsOptional()
  @IsString()
  containerBarcode?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}
