import { IsEmail, IsString, Matches } from 'class-validator';

export class RegisterVerifyDto {
  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Код должен состоять из 6 цифр' })
  code: string;
}
