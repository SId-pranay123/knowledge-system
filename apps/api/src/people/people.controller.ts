import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { PeopleService } from './people.service';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';

@Controller('api/people')
export class PeopleController {
  constructor(private service: PeopleService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() create(@Body() dto: CreatePersonDto) { return this.service.create(dto); }

  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}
