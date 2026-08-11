import { Injectable } from '@nestjs/common';

// Naive fixed-size chunking with overlap. Good enough for markdown/plaintext
// sample data at this scale; swap for header-aware splitting if docs get long.
@Injectable()
export class ChunkingService {
  chunk(text: string, size = 800, overlap = 150): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + size, text.length);
      chunks.push(text.slice(start, end));
      if (end === text.length) break;
      start = end - overlap;
    }
    return chunks;
  }
}
