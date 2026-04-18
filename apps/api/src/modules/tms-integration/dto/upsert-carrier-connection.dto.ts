import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpsertCarrierConnectionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsIn(['MAJOR_EXPRESS', 'DELLIN'])
  carrierCode!: 'MAJOR_EXPRESS' | 'DELLIN';

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
