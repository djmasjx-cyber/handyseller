import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertOrganizationDto {
  /** ООО | ИП | АО | ПАО */
  @IsOptional() @IsString() @MaxLength(20)
  entityType?: string;

  /** ОСНО | УСН_ДОХОДЫ | УСН_ДОХОДЫ_РАСХОДЫ | ПСН | ЕСХН | НПД | АУСН */
  @IsOptional() @IsString() @MaxLength(30)
  taxSystem?: string;

  /** БЕЗ_НДС | 0 | 5 | 7 | 10 | 20 */
  @IsOptional() @IsString() @MaxLength(10)
  vatRate?: string;

  @IsOptional() @IsString() @MaxLength(12)
  inn?: string;

  @IsOptional() @IsString() @MaxLength(9)
  kpp?: string;

  @IsOptional() @IsString() @MaxLength(15)
  ogrn?: string;

  @IsOptional() @IsString() @MaxLength(10)
  okpo?: string;

  @IsOptional() @IsString() @MaxLength(10)
  okved?: string;

  @IsOptional() @IsString() @MaxLength(500)
  fullName?: string;

  @IsOptional() @IsString() @MaxLength(200)
  shortName?: string;

  @IsOptional() @IsString() @MaxLength(500)
  legalAddress?: string;

  @IsOptional() @IsString() @MaxLength(500)
  actualAddress?: string;

  @IsOptional() @IsString() @MaxLength(9)
  bik?: string;

  @IsOptional() @IsString() @MaxLength(200)
  bankName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  settlementAccount?: string;

  @IsOptional() @IsString() @MaxLength(20)
  corrAccount?: string;

  @IsOptional() @IsString() @MaxLength(30)
  orgPhone?: string;

  @IsOptional() @IsString() @MaxLength(200)
  directorName?: string;

  @IsOptional() @IsString() @MaxLength(200)
  chiefAccountant?: string;
}
