import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('summary')
  async getSummary(@CurrentUser('userId') userId: string) {
    return this.analyticsService.getSummary(userId);
  }

  /** Выручка и заказы за последние 3 календарных месяца. */
  @Get('monthly')
  async getMonthly(@CurrentUser('userId') userId: string) {
    return this.analyticsService.getMonthlyBreakdown(userId);
  }

  /** Агрегаты по товарам за период (календарный месяц по умолчанию). */
  @Get('products')
  async getProducts(
    @CurrentUser('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.analyticsService.getProductStats(userId, fromDate, toDate);
  }
}
