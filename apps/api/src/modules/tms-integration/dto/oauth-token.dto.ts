import { IsIn, IsString, Length, MaxLength } from 'class-validator';

export class OAuthTokenDto {
  @IsString()
  @IsIn(['client_credentials'])
  grant_type!: 'client_credentials';

  @IsString()
  @Length(36, 36)
  client_id!: string;

  @IsString()
  @MaxLength(512)
  client_secret!: string;
}
