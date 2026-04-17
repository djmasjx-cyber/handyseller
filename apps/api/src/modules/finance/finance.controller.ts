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
    @Query('includeEmpty') includeEmpty?: string,
  ) {
    const s = scheme === 'FBO' || scheme === 'FBS' ? scheme : undefined;
    const include = includeEmpty === '1' || includeEmpty === 'true';
    return this.financeService.getProductFinanceTable(userId, s, include);
  }

  /**
   * GET /finance/products/paged?scheme=FBO|FBS&limit=20&offset=0
   * Постраничная выдача для больших таблиц юнит-экономики.
   */
  @Get('products/paged')
  async getProductsPaged(
    @CurrentUser('userId') userId: string,
    @Query('scheme') scheme?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('includeEmpty') includeEmpty?: string,
  ) {
    const s = scheme === 'FBO' || scheme === 'FBS' ? scheme : undefined;
    const include = includeEmpty === '1' || includeEmpty === 'true';
    return this.financeService.getProductFinanceTablePaged(userId, {
      scheme: s,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      includeEmpty: include,
    });
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
