import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get()
  async getDashboard(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role?: string,
  ) {
    try {
      return await this.dashboardService.getDashboard(userId, role ?? 'USER');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[Dashboard] Ошибка getDashboard:', msg, e instanceof Error ? e.stack : '');
      throw e;
    }
  }
}
