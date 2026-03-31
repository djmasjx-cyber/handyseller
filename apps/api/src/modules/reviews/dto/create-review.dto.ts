import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsString()
  @Length(10, 1000, { message: 'Отзыв должен быть от 10 до 1000 символов' })
  text: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
