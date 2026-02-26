import { IsString, Length } from 'class-validator';

export class UpdateStatsTokenDto {
  @IsString()
  @Length(10, 5000, { message: 'Токен должен быть от 10 до 5000 символов' })
  statsToken: string;
}
