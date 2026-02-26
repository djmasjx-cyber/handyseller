import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Email основного аккаунта — использовать его маркетплейсы (Ozon, WB). Пустая строка — отвязать. */
  @IsOptional()
  @ValidateIf((o) => o.linkedToUserEmail != null && String(o.linkedToUserEmail).trim() !== '')
  @IsEmail()
  linkedToUserEmail?: string;
}
