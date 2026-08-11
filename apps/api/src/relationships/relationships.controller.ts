import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RelationshipsService } from './relationships.service';
import { CreateRelationshipDto, EntityType } from './relationships.dto';

@Controller('api/relationships')
export class RelationshipsController {
  constructor(private service: RelationshipsService) {}

  @Post() create(@Body() dto: CreateRelationshipDto) { return this.service.create(dto); }

  @Get(':entityType/:entityId')
  findForEntity(@Param('entityType') entityType: EntityType, @Param('entityId') entityId: string) {
    return this.service.findForEntity(entityType, entityId);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
