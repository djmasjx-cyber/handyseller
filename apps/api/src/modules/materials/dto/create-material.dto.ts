import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateMaterialDto {
  @IsString()
  name: string;

  @IsNumber()
  cost: number;

  @IsOptional()
  @IsString()
  unit?: string;
}
