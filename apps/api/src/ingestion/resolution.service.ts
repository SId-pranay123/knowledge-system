import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { EntityType } from '../relationships/relationships.dto';

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'for', 'in', 'on', 'v1', 'v2']);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  return (2 * intersection) / (setA.size + setB.size);
}

function acronymMatch(mentionRaw: string, candidateRaw: string): boolean {
  const mentionWords = mentionRaw.trim().split(/\s+/);
  const candidateTokens = tokenize(candidateRaw);
  if (mentionWords.length < 2 || candidateTokens.length < 2) return false;

  const firstMention = mentionWords[0].toLowerCase();
  if (firstMention !== candidateTokens[0]) return false;

  const remainingMention = mentionWords.slice(1).join('');
  if (!/^[A-Z]{2,6}$/.test(remainingMention)) return false;

  const remainingCandidateInitials = candidateTokens
    .slice(1)
    .map((t) => t[0])
    .join('')
    .toUpperCase();

  return remainingCandidateInitials === remainingMention;
}

@Injectable()
export class ResolutionService {
  private readonly SIMILARITY_THRESHOLD = 0.88;
  private readonly DICE_THRESHOLD = 0.5;

  constructor(private prisma: PrismaService, private embeddings: EmbeddingsService) {}

  private tableFor(type: EntityType) {
    const map: Record<EntityType, any> = {
      person: this.prisma.person,
      client: this.prisma.client,
      project: this.prisma.project,
      document: this.prisma.document,
      decision: this.prisma.decision,
      topic: this.prisma.topic,
    };
    return map[type];
  }

  private labelFieldFor(type: EntityType): 'name' | 'title' {
    return type === 'decision' ? 'title' : 'name';
  }

  private getLabel(type: EntityType, row: any): string {
    return row[this.labelFieldFor(type)];
  }

  private readonly ALLOWED_ATTRS: Record<EntityType, string[]> = {
    person: ['role', 'bio', 'email'],
    client: ['description'],
    project: ['description', 'status'],
    decision: ['description', 'reasoning', 'status'],
    topic: ['description'],
    document: [],
  };

  private sanitizeAttributes(type: EntityType, attributes: Record<string, any>): Record<string, any> {
    const allowed = this.ALLOWED_ATTRS[type];
    return Object.fromEntries(Object.entries(attributes).filter(([key]) => allowed.includes(key)));
  }

  async resolveOrCreate(type: EntityType, name: string, attributes: Record<string, any> = {}): Promise<string> {
    const table = this.tableFor(type);
    const labelField = this.labelFieldFor(type);

    const exact = await table.findFirst({ where: { [labelField]: { equals: name, mode: 'insensitive' } } });
    if (exact) return exact.id;

    const candidates = await table.findMany({ take: 200 });
    const nameLower = name.trim().toLowerCase();

    const aliasMatch = candidates.find((c: any) =>
      Array.isArray(c.aliases) && c.aliases.some((a: string) => a.toLowerCase() === nameLower),
    );
    if (aliasMatch) return aliasMatch.id;

    if (nameLower.length >= 4) {
      const substringMatch = candidates.find((c: any) => {
        const label = this.getLabel(type, c);
        if (!label) return false;
        const labelLower = label.toLowerCase();
        return labelLower.includes(nameLower) || nameLower.includes(labelLower);
      });
      if (substringMatch) return substringMatch.id;
    }

    const acronymMatched = candidates.find((c: any) => {
      const label = this.getLabel(type, c);
      return label && acronymMatch(name, label);
    });
    if (acronymMatched) return acronymMatched.id;

    const mentionTokens = tokenize(name);
    let bestDice: { id: string; score: number } | null = null;
    for (const c of candidates) {
      const label = this.getLabel(type, c);
      if (!label) continue;
      const score = diceCoefficient(mentionTokens, tokenize(label));
      if (!bestDice || score > bestDice.score) bestDice = { id: c.id, score };
    }
    if (bestDice && bestDice.score >= this.DICE_THRESHOLD) return bestDice.id;

    if (candidates.length > 0) {
      const targetVec = await this.embeddings.embed(name);
      let best: { id: string; score: number } | null = null;
      for (const c of candidates) {
        const label = this.getLabel(type, c);
        if (!label) continue;
        const vec = await this.embeddings.embed(label);
        const score = this.embeddings.cosineSimilarity(targetVec, vec);
        if (!best || score > best.score) best = { id: c.id, score };
      }
      if (best && best.score >= this.SIMILARITY_THRESHOLD) return best.id;
    }

    const safeAttributes = this.sanitizeAttributes(type, attributes);
    const created = await table.create({ data: { [labelField]: name, ...safeAttributes } });
    return created.id;
  }
}