import { IsEmail, IsOptional, IsString, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** Новый email пользователя — используется для входа. */
  @IsOptional()
  @ValidateIf((o) => o.email != null && String(o.email).trim() !== '')
  @IsEmail({}, { message: 'Некорректный формат email' })
  email?: string;

  /** Email основного аккаунта — использовать его маркетплейсы (Ozon, WB). Пустая строка — отвязать. */
  @IsOptional()
  @ValidateIf((o) => o.linkedToUserEmail != null && String(o.linkedToUserEmail).trim() !== '')
  @IsEmail({}, { message: 'Некорректный формат email для привязки' })
  linkedToUserEmail?: string;
}
