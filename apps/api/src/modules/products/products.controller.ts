import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ReplenishStockDto } from './dto/replenish-stock.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.productsService.findAll(userId);
  }

  @Get('paged')
  async findPaged(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'stockFbs' | 'reservedFbs' | 'reservedFbo' | 'cost' | 'createdAt',
    @Query('sortDirection') sortDirection?: 'asc' | 'desc',
  ) {
    return this.productsService.findPaged(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      search,
      sortBy,
      sortDirection,
    });
  }

  /** Список архивных товаров */
  @Get('archive')
  async findArchived(@CurrentUser('userId') userId: string) {
    return this.productsService.findArchived(userId);
  }

  @Get('archive/paged')
  async findArchivedPaged(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('sortDirection') sortDirection?: 'asc' | 'desc',
  ) {
    return this.productsService.findArchivedPaged(userId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      search,
      sortDirection,
    });
  }

  /** Поиск товара по ID или артикулу — для автоподстановки в форме пополнения */
  @Get('lookup')
  async lookup(@CurrentUser('userId') userId: string, @Query('q') q: string) {
    const product = await this.productsService.findByArticleOrId(userId, q ?? '');
    return product ?? null;
  }

  /** Поиск товаров для autocomplete: id, article, title. Возврат [{ id, article, title, displayId }]. */
  @Get('search')
  async search(
    @CurrentUser('userId') userId: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.search(userId, q ?? '', limit ? parseInt(limit, 10) || 10 : 10);
  }

  /** Получить товар по ID (UUID), displayId (0001) или артикулу (edc002) — для карточки товара */
  @Get(':id')
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    const product = await this.productsService.findByIdWithMappingsByArticleOrId(userId, id);
    if (!product) throw new NotFoundException('Товар не найден');
    return product;
  }

  /** Пополнение или списание остатков */
  @Post('replenish')
  async replenish(@CurrentUser('userId') userId: string, @Body() dto: ReplenishStockDto) {
    return this.productsService.replenish(userId, dto.productIdOrArticle, dto.delta, dto.note);
  }

  /** Установить остаток (абсолютное значение) — для inline-редактирования */
  @Post(':id/stock')
  async setStock(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStockDto,
  ) {
    return this.productsService.setStock(userId, id, dto.stock);
  }

  /** История изменений остатков по товару */
  @Get(':id/stock-history')
  async getStockHistory(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.productsService.getStockHistory(userId, id);
  }

  /** Объединённая история: остатки + изменения полей */
  @Get(':id/history')
  async getProductHistory(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.productsService.getProductHistory(userId, id);
  }

  /** Обновить поля товара (с записью в историю) */
  @Patch(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(userId, id, dto);
  }

  /** Архивировать товар (переносит в Архив) */
  @Delete(':id')
  async remove(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.productsService.archive(userId, id);
  }

  /** Восстановить товар из архива */
  @Post(':id/restore')
  async restore(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.productsService.restore(userId, id);
  }

  @Post()
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(userId, dto);
  }
}
