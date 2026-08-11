import { Injectable } from '@nestjs/common';
import { CreateRelationshipDto, EntityType } from './relationships.dto';
import { RelationshipsRepository } from './relationships.repository';

@Injectable()
export class RelationshipsService {
  constructor(private relationshipsRepository: RelationshipsRepository) {}

  // Upsert-style create: if the same edge (source, type, target) already exists,
  // bump mention_count in metadata instead of creating a duplicate row.
  // This is what keeps incremental ingestion idempotent.
  async create(dto: CreateRelationshipDto) {
    const existing = await this.relationshipsRepository.findExisting(dto);

    if (existing) {
      const meta = (existing.metadata as any) ?? {};
      return this.relationshipsRepository.updateMetadata(existing.id, {
        ...meta,
        ...dto.metadata,
        mentionCount: (meta.mentionCount ?? 1) + 1,
      });
    }

    return this.relationshipsRepository.create(dto, { ...dto.metadata, mentionCount: 1 });
  }

  // 1-hop neighborhood for an entity — the core graph-traversal building block.
  // Returns edges where the entity is either source or target.
  async findForEntity(entityType: EntityType, entityId: string) {
    return this.relationshipsRepository.findForEntity(entityType, entityId);
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

  remove(id: string) {
    return this.relationshipsRepository.remove(id);
  }
}
