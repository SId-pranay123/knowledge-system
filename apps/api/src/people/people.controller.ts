import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PeopleService } from './people.service';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';

@Controller('api/people')
export class PeopleController {
  constructor(private service: PeopleService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreatePersonDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}