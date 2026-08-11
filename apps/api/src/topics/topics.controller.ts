import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TopicsService } from './topics.service';
import { CreateTopicDto, UpdateTopicDto } from './topics.dto';

@Controller('api/topics')
export class TopicsController {
  constructor(private service: TopicsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreateTopicDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateTopicDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}