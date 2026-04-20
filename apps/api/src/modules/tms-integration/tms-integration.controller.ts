import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TmsIntegrationService } from './tms-integration.service';
import type { CarrierCode, CarrierServiceType } from '@handyseller/tms-sdk';
import { UpsertCarrierConnectionDto } from './dto/upsert-carrier-connection.dto';
import { CreateTmsEstimateOrderDto } from './dto/create-tms-estimate-order.dto';
import { RejectTmsM2mJwtGuard } from './guards/reject-tms-m2m-jwt.guard';

@Controller('tms')
@UseGuards(JwtAuthGuard, RejectTmsM2mJwtGuard)
export class TmsIntegrationController {
  constructor(private readonly tmsIntegrationService: TmsIntegrationService) {}

  @Get('orders/candidates')
  listCandidates(@CurrentUser('userId') userId: string) {
    return this.tmsIntegrationService.listOrderCandidates(userId);
  }

  @Get('orders/:id/snapshot')
  snapshot(@CurrentUser('userId') userId: string, @Param('id') orderId: string) {
    return this.tmsIntegrationService.buildOrderSnapshot(userId, orderId);
  }

  /** Ручной заказ MANUAL для оценки доставки (груз + адреса). */
  @Post('orders/tms-estimate')
  createTmsEstimate(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateTmsEstimateOrderDto,
  ) {
    return this.tmsIntegrationService.createTmsEstimateOrder(userId, dto);
  }

  @Get('carrier-connections')
  listCarrierConnections(@CurrentUser('userId') userId: string) {
    return this.tmsIntegrationService.listCarrierConnections(userId);
  }

  @Post('carrier-connections')
  upsertCarrierConnection(
    @CurrentUser('userId') userId: string,
    @Body() input: UpsertCarrierConnectionDto,
  ) {
    return this.tmsIntegrationService.upsertCarrierConnection(userId, input);
  }

  @Delete('carrier-connections/:id')
  deleteCarrierConnection(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tmsIntegrationService.deleteCarrierConnection(userId, id);
  }

  @Post('carrier-connections/:id/check')
  checkCarrierConnection(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.tmsIntegrationService.checkCarrierConnection(userId, id);
  }

  @Post('carrier-connections/check-all')
  checkAllCarrierConnections(@CurrentUser('userId') userId: string) {
    return this.tmsIntegrationService.checkAllCarrierConnections(userId);
  }

  @Get('carrier-connections/internal/:carrierCode/default')
  async getInternalCarrierCredentials(
    @CurrentUser('userId') userId: string,
    @Param('carrierCode') carrierCode: CarrierCode,
    @Query('serviceType') serviceType: CarrierServiceType | undefined,
    @Headers('x-tms-internal-key') internalKey?: string,
  ) {
    const expected = process.env.TMS_INTERNAL_KEY?.trim();
    if (!expected || internalKey !== expected) {
      throw new UnauthorizedException('Недостаточно прав для внутреннего доступа TMS');
    }
    const connection = await this.tmsIntegrationService.getInternalCarrierCredentials(
      userId,
      carrierCode,
      serviceType ?? 'EXPRESS',
    );
    if (!connection) {
      throw new UnauthorizedException('Подключение перевозчика для клиента не найдено');
    }
    return connection;
  }
}
