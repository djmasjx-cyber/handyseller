import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { MaterialsService } from './materials.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateMaterialDto } from './dto/create-material.dto';

@Controller('materials')
@UseGuards(JwtAuthGuard)
export class MaterialsController {
  constructor(private materialsService: MaterialsService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.materialsService.findAll(userId);
  }

  @Post()
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateMaterialDto) {
    return this.materialsService.create(userId, dto);
  }
}
