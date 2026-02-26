import { IsNumber, IsString, IsOptional, IsUrl, Min, IsIn } from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  subscriptionId: string;

  @IsNumber()
  @Min(1, { message: 'Сумма должна быть больше 0' })
  amount: number;

  @IsIn(['PROFESSIONAL', 'BUSINESS'], { message: 'targetPlan должен быть PROFESSIONAL или BUSINESS' })
  targetPlan: 'PROFESSIONAL' | 'BUSINESS';

  @IsUrl()
  returnUrl: string;

  @IsUrl()
  failUrl: string;

  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
