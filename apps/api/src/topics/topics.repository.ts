import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto, UpdateTopicDto } from './topics.dto';

@Injectable()
export class TopicsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.topic.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.topic.findUnique({ where: { id } });
  }

  create(dto: CreateTopicDto) {
    return this.prisma.topic.create({ data: dto });
  }

  update(id: string, dto: UpdateTopicDto) {
    return this.prisma.topic.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.topic.delete({ where: { id } });
  }
}
