import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpsertCarrierConnectionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(['MAJOR_EXPRESS', 'DELLIN', 'CDEK', 'DALLI'])
  carrierCode!: 'MAJOR_EXPRESS' | 'DELLIN' | 'CDEK' | 'DALLI';

  @IsOptional()
  @IsIn(['EXPRESS', 'LTL'])
  serviceType?: 'EXPRESS' | 'LTL';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accountLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contractLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  appKey?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  login!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  password!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
