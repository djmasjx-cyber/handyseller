import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  async getPublished(@Query('limit') limit?: string) {
    const parsed = limit ? parseInt(limit, 10) : 6;
    return this.reviewsService.getPublished(Number.isFinite(parsed) ? parsed : 6);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createReview(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createPending(userId, dto);
  }
}
