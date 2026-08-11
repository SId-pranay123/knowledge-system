// Shared DTOs between apps/api and apps/web, so the frontend and backend
// never drift on response shapes.

export type EntityType = 'person' | 'client' | 'project' | 'document' | 'decision' | 'topic';

export interface RelationshipDto {
  id: string;
  sourceType: EntityType;
  sourceId: string;
  relationshipType: string;
  targetType: EntityType;
  targetId: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface QueryResponseDto {
  answer: string;
  entities: { type: EntityType; id: string }[];
  relationships: RelationshipDto[];
  sources: { documentId: string; title: string }[];
}
