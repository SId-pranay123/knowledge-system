import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDecisionDto, UpdateDecisionDto } from './decisions.dto';

@Injectable()
export class DecisionsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.decision.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.decision.findUnique({
      where: { id },
      include: { supersedesDecision: true, supersededBy: true },
    });
  }

  create(dto: CreateDecisionDto) {
    return this.prisma.decision.create({ data: dto as any });
  }

  updateSupersededDecision(id: string) {
    return this.prisma.decision.update({
      where: { id },
      data: { status: 'SUPERSEDED' },
    });
  }

  update(id: string, dto: UpdateDecisionDto) {
    return this.prisma.decision.update({ where: { id }, data: dto as any });
  }

  remove(id: string) {
    return this.prisma.decision.delete({ where: { id } });
  }
}
