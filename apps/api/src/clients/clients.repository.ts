import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './clients.dto';

@Injectable()
export class ClientsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.client.findUnique({ where: { id } });
  }

  create(dto: CreateClientDto) {
    return this.prisma.client.create({ data: dto });
  }

  update(id: string, dto: UpdateClientDto) {
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.client.delete({ where: { id } });
  }
}
