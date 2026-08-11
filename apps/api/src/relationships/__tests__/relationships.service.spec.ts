import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { RelationshipsService } from '../relationships.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock Prisma so these tests don't need a live DB.
function createPrismaMock() {
  return {
    relationship: {
      findFirst: jest.fn<() => Promise<any>>(),
      create: jest.fn<() => Promise<any>>(),
      update: jest.fn<() => Promise<any>>(),
      findMany: jest.fn<() => Promise<any[]>>(),
      delete: jest.fn<() => Promise<any>>(),
    },
  };
}

describe('RelationshipsService', () => {
  let service: RelationshipsService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(async () => {
    prisma = createPrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [RelationshipsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(RelationshipsService);
  });

  describe('create (upsert-on-edge behavior)', () => {
    const dto = {
      sourceType: 'person' as const,
      sourceId: 'p1',
      relationshipType: 'WORKED_ON',
      targetType: 'project' as const,
      targetId: 'proj1',
      metadata: { context: 'mentioned in kickoff doc' },
    };

    it('creates a new relationship when no matching edge exists', async () => {
      prisma.relationship.findFirst.mockResolvedValue(null);
      prisma.relationship.create.mockResolvedValue({ id: 'r1', ...dto, metadata: { ...dto.metadata, mentionCount: 1 } });

      const result: any = await service.create(dto);

      expect(prisma.relationship.create).toHaveBeenCalledWith({
        data: { ...dto, metadata: { ...dto.metadata, mentionCount: 1 } },
      });
      expect(prisma.relationship.update).not.toHaveBeenCalled();
      expect(result.metadata.mentionCount).toBe(1);
    });

    it('does NOT create a duplicate row when the same edge is ingested again — bumps mentionCount instead', async () => {
      const existing = { id: 'r1', ...dto, metadata: { mentionCount: 1 } };
      prisma.relationship.findFirst.mockResolvedValue(existing);
      prisma.relationship.update.mockResolvedValue({ ...existing, metadata: { mentionCount: 2 } });

      await service.create(dto);

      expect(prisma.relationship.create).not.toHaveBeenCalled();
      expect(prisma.relationship.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { metadata: expect.objectContaining({ mentionCount: 2 }) },
      });
    });

    it('merges new metadata fields onto existing metadata rather than overwriting it', async () => {
      const existing = { id: 'r1', ...dto, metadata: { mentionCount: 3, context: 'old context' } };
      prisma.relationship.findFirst.mockResolvedValue(existing);
      prisma.relationship.update.mockResolvedValue(existing);

      await service.create({ ...dto, metadata: { context: 'new context', sourceChunkId: 'doc2' } });

      const updateMock = prisma.relationship.update as jest.Mock;
      const callArg: any = updateMock.mock.calls[0][0];
      expect(callArg.data.metadata).toMatchObject({
        context: 'new context',
        sourceChunkId: 'doc2',
        mentionCount: 4,
      });
    });
  });

  describe('findForEntity', () => {
    it('finds edges where the entity is either source or target', async () => {
      prisma.relationship.findMany.mockResolvedValue([{ id: 'r1' }]);

      await service.findForEntity('project', 'proj1');

      expect(prisma.relationship.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { sourceType: 'project', sourceId: 'proj1' },
            { targetType: 'project', targetId: 'proj1' },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findNeighborhood (multi-hop traversal)', () => {
    it('returns 1-hop edges directly connected to the entity', async () => {
      prisma.relationship.findMany
        .mockResolvedValueOnce([
          { sourceType: 'person', sourceId: 'alice', relationshipType: 'WORKED_ON', targetType: 'project', targetId: 'lexora' },
        ])
        .mockResolvedValue([]); // no further hops from lexora in this test

      const edges = await service.findNeighborhood('person', 'alice', 2);

      expect(edges).toHaveLength(1);
      expect(edges[0].targetId).toBe('lexora');
    });

    it('follows a second hop and does not revisit the starting node (no infinite loop)', async () => {
      prisma.relationship.findMany
        // hop 1: alice -> lexora
        .mockResolvedValueOnce([
          { sourceType: 'person', sourceId: 'alice', relationshipType: 'WORKED_ON', targetType: 'project', targetId: 'lexora' },
        ])
        // hop 2: lexora -> decision12 (and lexora -> alice again, should not cause a re-visit loop)
        .mockResolvedValueOnce([
          { sourceType: 'project', sourceId: 'lexora', relationshipType: 'HAS_DECISION', targetType: 'decision', targetId: 'd12' },
          { sourceType: 'person', sourceId: 'alice', relationshipType: 'WORKED_ON', targetType: 'project', targetId: 'lexora' },
        ]);

      const edges = await service.findNeighborhood('person', 'alice', 2);

      // both hops' edges collected, and the traversal terminated (mock only set up for 2 calls)
      expect(edges.length).toBe(3);
      expect(prisma.relationship.findMany).toHaveBeenCalledTimes(2);
    });
  });
});