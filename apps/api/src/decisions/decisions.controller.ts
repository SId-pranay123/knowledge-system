import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DecisionsService } from './decisions.service';
import { CreateDecisionDto, UpdateDecisionDto } from './decisions.dto';

@Controller('api/decisions')
export class DecisionsController {
  constructor(private service: DecisionsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreateDecisionDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateDecisionDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}