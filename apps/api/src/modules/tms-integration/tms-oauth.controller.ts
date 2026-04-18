import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OAuthTokenDto } from './dto/oauth-token.dto';
import { TmsM2mService } from './tms-m2m.service';

/** Публичный OAuth2 token endpoint (без JWT пользователя). */
@Throttle({ default: { limit: 40, ttl: 60000 } })
@Controller('tms/oauth')
export class TmsOAuthController {
  constructor(private readonly tmsM2m: TmsM2mService) {}

  @Post('token')
  @HttpCode(200)
  token(@Body() body: OAuthTokenDto) {
    return this.tmsM2m.exchangeClientCredentials(body.client_id, body.client_secret);
  }
}
