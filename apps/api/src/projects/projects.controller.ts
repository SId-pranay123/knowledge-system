import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';

@Controller('api/projects')
export class ProjectsController {
  constructor(private service: ProjectsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() create(@Body() dto: CreateProjectDto) { return this.service.create(dto); }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}