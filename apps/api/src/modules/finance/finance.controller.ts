import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FinanceService } from './finance.service';
import { CommissionSyncService } from './commission-sync.service';

@Controller('finance')
@UseGuards(JwtAuthGuard)
export class FinanceController {
  constructor(
    private readonly financeService: FinanceService,
    private readonly commissionSyncService: CommissionSyncService,
  ) {}

  /**
   * GET /finance/products?scheme=FBO|FBS
   * Таблица unit-экономики по всем активным товарам.
   */
  @Get('products')
  async getProducts(
    @CurrentUser('userId') userId: string,
    @Query('scheme') scheme?: string,
  ) {
    const s = scheme === 'FBO' || scheme === 'FBS' ? scheme : undefined;
    return this.financeService.getProductFinanceTable(userId, s);
  }

  /**
   * PATCH /finance/products/:id/cost
   * Обновить себестоимость товара inline.
   */
  @Patch('products/:id/cost')
  @HttpCode(HttpStatus.OK)
  async updateCost(
    @CurrentUser('userId') userId: string,
    @Param('id') productId: string,
    @Body() body: { cost: number },
  ) {
    await this.financeService.updateProductCost(userId, productId, Number(body.cost));
    return { ok: true };
  }

  /**
   * POST /finance/sync
   * Ручной запуск синхронизации тарифов для пользователя.
   */
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncCommissions(@CurrentUser('userId') userId: string) {
    const result = await this.commissionSyncService.syncForUser(userId);
    return { ok: true, ...result };
  }
}
