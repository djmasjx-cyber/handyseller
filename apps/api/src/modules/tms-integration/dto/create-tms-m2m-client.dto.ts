import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const TMS_SCOPES = ['tms:read', 'tms:write'] as const;

export class CreateTmsM2mClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsIn(TMS_SCOPES, { each: true })
  scopes?: ('tms:read' | 'tms:write')[];
}
