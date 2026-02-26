import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private subscriptionsService: SubscriptionsService) {}

  @Get('me')
  async getMe(@CurrentUser('userId') userId: string) {
    const [sub, limits] = await Promise.all([
      this.subscriptionsService.findForUser(userId),
      this.subscriptionsService.getLimits(userId),
    ]);
    return { ...sub, limits };
  }
}
