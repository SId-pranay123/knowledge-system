import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';

@Injectable()
export class PeopleRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.person.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.person.findUnique({ where: { id } });
  }

  create(dto: CreatePersonDto) {
    return this.prisma.person.create({ data: dto });
  }

  update(id: string, dto: UpdatePersonDto) {
    return this.prisma.person.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.person.delete({ where: { id } });
  }
}
