import { IsNumber, IsOptional, Min } from 'class-validator';

export class RefundPaymentDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01, { message: 'Сумма возврата должна быть больше 0' })
  amount?: number; // если не указана — полный возврат
}
