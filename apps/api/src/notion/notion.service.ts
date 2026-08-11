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