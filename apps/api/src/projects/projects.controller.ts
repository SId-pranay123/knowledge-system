import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';

@Controller('api/projects')
export class ProjectsController {
  constructor(private service: ProjectsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreateProjectDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}