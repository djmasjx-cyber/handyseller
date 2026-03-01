import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateSalesSourceDto {
  @IsString()
  @IsNotEmpty({ message: 'Название источника не может быть пустым' })
  @MaxLength(100)
  name: string;
}
