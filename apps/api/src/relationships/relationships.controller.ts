import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto, EntityType } from './relationships.dto';

@Controller('api/relationships')
export class RelationshipsController {
  constructor(private service: RelationshipsService) {}

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreateRelationshipDto) { return this.service.create(dto); }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':entityType/:entityId')
  findForEntity(@Param('entityType') entityType: EntityType, @Param('entityId') entityId: string) {
    return this.service.findForEntity(entityType, entityId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}