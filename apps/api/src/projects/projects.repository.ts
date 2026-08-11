import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';

@Injectable()
export class ProjectsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany({ include: { client: true }, orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.project.findUnique({ where: { id }, include: { client: true } });
  }

  create(dto: CreateProjectDto) {
    return this.prisma.project.create({ data: dto as any });
  }

  update(id: string, dto: UpdateProjectDto) {
    return this.prisma.project.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.project.delete({ where: { id } });
  }
}
