import { Controller, Get, Header } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { TmsM2mService } from './tms-m2m.service';

@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller('tms')
export class TmsDocsController {
  constructor(private readonly tmsM2m: TmsM2mService) {}

  @Get('openapi.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  openApi() {
    return this.tmsM2m.getOpenApiYaml();
  }

  /** Полная спецификация: витрина + 1С/оператор + webhooks (см. описание в корневом info). */
  @Get('openapi-extended.yaml')
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  openApiExtended() {
    return this.tmsM2m.getOpenApiExtendedYaml();
  }
}
