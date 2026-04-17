import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TmsIntegrationService } from './tms-integration.service';

@Controller('tms')
@UseGuards(JwtAuthGuard)
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
}
