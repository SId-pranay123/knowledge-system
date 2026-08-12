import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { IngestionService } from '../ingestion/ingestion.service';

// Notion integration — uses a simple internal integration token (Bearer auth),
// not OAuth. Setup: create an integration at notion.so/my-integrations, copy
// its secret, and share the target page with it via the page's "Connections"
// menu in Notion. Much simpler auth than Google's OAuth/service-account flow.
@Injectable()
export class NotionService {
  private readonly logger = new Logger(NotionService.name);
  private readonly apiKey = process.env.NOTION_API_KEY;
  private readonly baseUrl = 'https://api.notion.com/v1';

  constructor(private ingestion: IngestionService) {
    if (!this.apiKey) {
      this.logger.warn('NOTION_API_KEY is not set. Notion ingestion will fail until this is configured.');
    }
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };
  }

  // Flattens a block's rich_text array into plain text.
  private richTextToPlain(richText: any[] = []): string {
    return richText.map((t) => t.plain_text ?? '').join('');
  }

  // Recursively walks a page's block children, flattening common block types
  // (paragraphs, headings, lists) into plain text lines. Skips block types
  // that don't map cleanly to text (images, embeds, etc.) rather than
  // rendering them incorrectly.
  private async getPlainText(blockId: string): Promise<string> {
    const lines: string[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/blocks/${blockId}/children`);
      url.searchParams.set('page_size', '100');
      if (cursor) url.searchParams.set('start_cursor', cursor);

      const res = await fetch(url.toString(), { headers: this.headers() });
      if (!res.ok) {
        throw new BadRequestException(`Notion API error: ${res.status} ${await res.text()}`);
      }
      const data = await res.json();

      for (const block of data.results ?? []) {
        const type = block.type;
        const content = block[type];
        if (content?.rich_text) {
          const text = this.richTextToPlain(content.rich_text);
          if (text.trim()) lines.push(text);
        }
        if (block.has_children) {
          const childText = await this.getPlainText(block.id);
          if (childText) lines.push(childText);
        }
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    return lines.join('\n');
  }

  private async getPageTitle(pageId: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/pages/${pageId}`, { headers: this.headers() });
    if (!res.ok) throw new BadRequestException(`Notion API error: ${res.status} ${await res.text()}`);
    const page = await res.json();
    const titleProp = Object.values(page.properties ?? {}).find((p: any) => p.type === 'title') as any;
    return titleProp ? this.richTextToPlain(titleProp.title) : `Notion Page ${pageId}`;
  }

  // Lists every page the integration currently has access to (i.e. every
  // page someone has shared with it via the page's "Connections" menu in
  // Notion). This is what lets the UI show a pick-and-ingest list instead of
  // requiring a manually copy-pasted page ID — the integration's access
  // *is* the source of truth for what's ingestable.
  async listAccessiblePages() {
    if (!this.apiKey) {
      throw new BadRequestException('Notion integration is not configured (missing NOTION_API_KEY).');
    }

    const results: { id: string; title: string; lastEditedTime: string; url: string }[] = [];
    let cursor: string | undefined;

    do {
      const res = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          filter: { property: 'object', value: 'page' },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      });
      if (!res.ok) throw new BadRequestException(`Notion API error: ${res.status} ${await res.text()}`);
      const data = await res.json();

      for (const page of data.results ?? []) {
        const titleProp = Object.values(page.properties ?? {}).find((p: any) => p.type === 'title') as any;
        results.push({
          id: page.id,
          title: titleProp ? this.richTextToPlain(titleProp.title) || '(untitled)' : '(untitled)',
          lastEditedTime: page.last_edited_time,
          url: page.url,
        });
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    return results;
  }

  // Same as listAccessiblePages, but cross-referenced against already-
  // ingested documents (matched by sourceUrl) so the UI can show which pages
  // are new vs already in the graph, instead of the person having to guess
  // or re-ingest blindly.
  async listAccessiblePagesWithStatus() {
    const pages = await this.listAccessiblePages();
    const existing = await this.ingestion.getIngestedSourceUrls('NOTION');
    const existingSet = new Set(existing);
    return pages.map((p) => ({ ...p, alreadyIngested: existingSet.has(`https://notion.so/${p.id.replace(/-/g, '')}`) }));
  }

  async ingestPage(pageId: string) {
    if (!this.apiKey) {
      throw new BadRequestException('Notion integration is not configured (missing NOTION_API_KEY).');
    }

    this.logger.log(`Fetching Notion page ${pageId}...`);
    const title = await this.getPageTitle(pageId);
    const content = await this.getPlainText(pageId);

    // Same ingestion pipeline as markdown/Slack/Google Docs — no separate
    // code path beyond this fetch-and-flatten step.
    return this.ingestion.ingestDocument({
      title,
      content,
      sourceType: 'NOTION',
      sourceUrl: `https://notion.so/${pageId.replace(/-/g, '')}`,
    });
  }
}