import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto, UpdateClientDto } from './clients.dto';

@Controller('api/clients')
export class ClientsController {
  constructor(private service: ClientsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard)
  @Post() create(@Body() dto: CreateClientDto) { return this.service.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.service.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}