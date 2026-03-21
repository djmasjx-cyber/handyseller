import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class GetUploadSignatureDto {
  @IsString()
  @IsNotEmpty()
  filename: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}

export class ConfirmUploadDto {
  @IsString()
  @IsNotEmpty()
  key: string;
}

export class UploadFromUrlDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsOptional()
  @IsString()
  productId?: string;
}
