import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateDocumentDto } from './documents.dto';

@Injectable()
export class DocumentsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.document.findMany({
      select: { id: true, title: true, sourceType: true, sourceUrl: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.document.findUnique({ where: { id }, include: { chunks: false } });
  }

  update(id: string, dto: UpdateDocumentDto) {
    return this.prisma.document.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.document.delete({ where: { id } });
  }
}
