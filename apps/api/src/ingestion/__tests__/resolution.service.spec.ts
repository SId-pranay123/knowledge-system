import { Test } from '@nestjs/testing';
import { ResolutionService } from '../resolution.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../../embeddings/embeddings.service';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

function createPrismaMock() {
  const project = { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() };
  return { project };
}

describe('ResolutionService', () => {
  let service: ResolutionService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let embeddings: { embed: jest.Mock; cosineSimilarity: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    embeddings = { embed: jest.fn(), cosineSimilarity: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ResolutionService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmbeddingsService, useValue: embeddings },
      ],
    }).compile();
    service = moduleRef.get(ResolutionService);
  });

  it('returns the existing entity id on an exact (case-insensitive) name match, without calling the embedding model', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'proj-1', name: 'Lexora' });

    const id = await service.resolveOrCreate('project', 'lexora');

    expect(id).toBe('proj-1');
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('resolves a fuzzy mention ("the Lexora project") to the existing node via embedding similarity above threshold', async () => {
    prisma.project.findFirst.mockResolvedValue(null); // no exact match
    prisma.project.findMany.mockResolvedValue([{ id: 'proj-1', name: 'Lexora' }]);
    embeddings.embed.mockResolvedValue([0.1, 0.2, 0.3]);
    embeddings.cosineSimilarity.mockReturnValue(0.93); // above 0.88 threshold

    const id = await service.resolveOrCreate('project', 'the Lexora project');

    expect(id).toBe('proj-1');
    expect(prisma.project.create).not.toHaveBeenCalled();
  });

  it('creates a new node when similarity is below threshold — does not silently merge unrelated entities', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.project.findMany.mockResolvedValue([{ id: 'proj-1', name: 'Lexora' }]);
    embeddings.embed.mockResolvedValue([0.1, 0.2, 0.3]);
    embeddings.cosineSimilarity.mockReturnValue(0.4); // well below threshold
    prisma.project.create.mockResolvedValue({ id: 'proj-2', name: 'FinEdge' });

    const id = await service.resolveOrCreate('project', 'FinEdge');

    expect(id).toBe('proj-2');
    expect(prisma.project.create).toHaveBeenCalledWith({ data: { name: 'FinEdge' } });
  });

  it('creates a new node immediately when no candidates of that type exist yet', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.create.mockResolvedValue({ id: 'proj-1', name: 'Lexora' });

    const id = await service.resolveOrCreate('project', 'Lexora');

    expect(id).toBe('proj-1');
    expect(embeddings.embed).not.toHaveBeenCalled();
  });
});