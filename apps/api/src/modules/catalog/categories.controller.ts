import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RequirePermission } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, CreateSubcategoryDto, UpdateCategoryDto } from './dto/catalog.dto';

@Controller()
export class CategoriesController {
  constructor(private svc: CategoriesService) {}

  @Get('categories') @RequirePermission('product.read') tree() { return this.svc.tree(); }

  @Post('categories') @RequirePermission('product.write')
  create(@Body() dto: CreateCategoryDto) { return this.svc.create(dto); }

  @Post('subcategories') @RequirePermission('product.write')
  createSub(@Body() dto: CreateSubcategoryDto) { return this.svc.create(dto, dto.categoryId); }

  @Patch(['categories/:id', 'subcategories/:id']) @RequirePermission('product.write')
  update(@Param('id', ParseObjectIdPipe) id: string, @Body() dto: UpdateCategoryDto) { return this.svc.update(id, dto); }
}
