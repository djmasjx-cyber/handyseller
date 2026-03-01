import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { SalesSourcesService } from './sales-sources.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateSalesSourceDto } from './dto/create-sales-source.dto';

@Controller('sales-sources')
@UseGuards(JwtAuthGuard)
export class SalesSourcesController {
  constructor(private salesSourcesService: SalesSourcesService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.salesSourcesService.findAll(userId);
  }

  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateSalesSourceDto,
  ) {
    return this.salesSourcesService.upsert(userId, dto.name);
  }
}
