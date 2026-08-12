import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRelationshipDto, EntityType } from './relationships.dto';

@Injectable()
export class RelationshipsService {
  constructor(private prisma: PrismaService) {}

  // Upsert-style create: if the same edge (source, type, target) already exists,
  // bump mention_count in metadata instead of creating a duplicate row.
  // This is what keeps incremental ingestion idempotent.
  async create(dto: CreateRelationshipDto) {
    const existing = await this.prisma.relationship.findFirst({
      where: {
        sourceType: dto.sourceType,
        sourceId: dto.sourceId,
        relationshipType: dto.relationshipType,
        targetType: dto.targetType,
        targetId: dto.targetId,
      },
    });

    if (existing) {
      const meta = (existing.metadata as any) ?? {};
      return this.prisma.relationship.update({
        where: { id: existing.id },
        data: {
          metadata: { ...meta, ...dto.metadata, mentionCount: (meta.mentionCount ?? 1) + 1 },
        },
      });
    }

    return this.prisma.relationship.create({
      data: { ...dto, metadata: { ...dto.metadata, mentionCount: 1 } },
    });
  }

  // 1-hop neighborhood for an entity — the core graph-traversal building block.
  // Returns edges where the entity is either source or target.
  async findForEntity(entityType: EntityType, entityId: string) {
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

  // 2-hop traversal: neighborhood of the neighborhood. Used by the query pipeline
  // for questions that need indirect connections (e.g. project -> decision -> person).
  async findNeighborhood(entityType: EntityType, entityId: string, hops = 2) {
    const visited = new Set<string>([`${entityType}:${entityId}`]);
    let frontier: { type: EntityType; id: string }[] = [{ type: entityType, id: entityId }];
    const allEdges: any[] = [];

    for (let hop = 0; hop < hops; hop++) {
      const nextFrontier: { type: EntityType; id: string }[] = [];
      for (const node of frontier) {
        const edges = await this.findForEntity(node.type, node.id);
        for (const edge of edges) {
          allEdges.push(edge);
          const other = edge.sourceId === node.id && edge.sourceType === node.type
            ? { type: edge.targetType as EntityType, id: edge.targetId }
            : { type: edge.sourceType as EntityType, id: edge.sourceId };
          const key = `${other.type}:${other.id}`;
          if (!visited.has(key)) {
            visited.add(key);
            nextFrontier.push(other);
          }
        }
      }
      frontier = nextFrontier;
    }
    return allEdges;
  }

  // Every relationship, unfiltered — used by the global graph view, which
  // renders the whole knowledge graph at once rather than one entity's
  // neighborhood. Fine at this scale (tens to low hundreds of edges).
  async findAll() {
    return this.prisma.relationship.findMany({ orderBy: { createdAt: 'desc' } });
  }

  remove(id: string) {
    return this.prisma.relationship.delete({ where: { id } });
  }
}