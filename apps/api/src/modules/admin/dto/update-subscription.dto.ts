import { IsIn, IsOptional, IsDateString } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsIn(['FREE', 'PROFESSIONAL', 'BUSINESS'])
  plan: 'FREE' | 'PROFESSIONAL' | 'BUSINESS';

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;
}
