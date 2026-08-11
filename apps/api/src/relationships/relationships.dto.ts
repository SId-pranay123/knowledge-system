import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export const ENTITY_TYPES = ['person', 'client', 'project', 'document', 'decision', 'topic'] as const;
export type EntityType = typeof ENTITY_TYPES[number];

export class CreateRelationshipDto {
  @IsIn(ENTITY_TYPES) sourceType!: EntityType;
  @IsString() sourceId!: string;
  @IsString() relationshipType!: string; // e.g. WORKED_ON, HAS_DECISION, MADE_BY, SUPERSEDES, INFLUENCED_BY, ABOUT, DISCUSSED_IN
  @IsIn(ENTITY_TYPES) targetType!: EntityType;
  @IsString() targetId!: string;
  @IsObject() @IsOptional() metadata?: Record<string, any>;
}
