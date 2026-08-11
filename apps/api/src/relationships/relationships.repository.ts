import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto, EntityType } from './relationships.dto';

@Injectable()
export class RelationshipsRepository {
  constructor(private prisma: PrismaService) {}

  findExisting(dto: CreateRelationshipDto) {
    return this.prisma.relationship.findFirst({
      where: {
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        relationshipType: dto.relationshipType,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });
  }

  updateMetadata(id: string, metadata: Record<string, any>) {
    return this.prisma.relationship.update({
      where: { id },
      data: { metadata },
    });
  }

  create(dto: CreateRelationshipDto, metadata: Record<string, any>) {
    return this.prisma.relationship.create({
      data: { ...dto, metadata },
    });
  }

  findForEntity(entityType: EntityType, entityId: string) {
    return this.prisma.relationship.findMany({
      where: {
        OR: [
          { sourceType: entityType, sourceId: entityId },
          { targetType: entityType, targetId: entityId },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  remove(id: string) {
    return this.prisma.relationship.delete({ where: { id } });
  }
}
