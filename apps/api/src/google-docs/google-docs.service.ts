import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { docs_v1, drive_v3, google } from 'googleapis';
import { IngestionService } from '../ingestion/ingestion.service';

// Reads Google Docs via a service account (no user OAuth consent flow needed —
// simpler than building a login-with-Google UI for what the assignment scopes
// as "just one simple external integration"). To use: create a service
// account in Google Cloud Console, enable the Docs + Drive APIs, download its
// JSON key, and share the target doc/folder with the service account's email
// (found in the key file as "client_email") with at least Viewer access.
@Injectable()
export class GoogleDocsService {
  private readonly logger = new Logger(GoogleDocsService.name);
  private docsClient: docs_v1.Docs;
  private driveClient: drive_v3.Drive;

  constructor(private ingestion: IngestionService) {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

    // Two supported auth modes:
    // 1. Service account key file (GOOGLE_SERVICE_ACCOUNT_KEY_PATH set) —
    //    works if your Google Cloud org allows service account key creation.
    // 2. Application Default Credentials (no key path set) — falls back to
    //    credentials from `gcloud auth application-default login`, which
    //    authenticates as your own Google account. Required on projects
    //    where an org policy blocks service account key creation (a default
    //    on many personal/free-tier Cloud projects). In this mode, the
    //    integration reads whatever Docs your own account already has
    //    access to — no separate "share with service account email" step.
    const authOptions: any = {
      scopes: ['https://www.googleapis.com/auth/documents.readonly', 'https://www.googleapis.com/auth/drive.readonly'],
    };
    if (keyPath) {
      authOptions.keyFile = keyPath;
    } else {
      this.logger.warn(
        'GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set — falling back to Application Default Credentials. Run `gcloud auth application-default login` first if this fails.',
      );
    }

    const auth = new google.auth.GoogleAuth(authOptions);
    this.docsClient = google.docs({ version: 'v1', auth: auth as unknown as JWT });
    this.driveClient = google.drive({ version: 'v3', auth: auth as unknown as JWT });
  }

  // Flattens a Google Doc's structured content (paragraphs, tables, etc.)
  // into plain text. Google's Docs API returns a deeply nested structure —
  // this only handles the common case (paragraphs of text runs), which
  // covers typical internal docs; tables/images are skipped rather than
  // partially rendered incorrectly.
  private extractPlainText(doc: docs_v1.Schema$Document): string {
    const content = doc.body?.content ?? [];
    const lines: string[] = [];
    for (const element of content) {
      if (!element.paragraph) continue;
      const text = (element.paragraph.elements ?? [])
        .map((e) => e.textRun?.content ?? '')
        .join('');
      if (text.trim()) lines.push(text.trimEnd());
    }
    return lines.join('\n');
  }

  async ingestDocument(documentId: string) {
    if (!this.docsClient) {
      throw new BadRequestException('Google Docs integration is not configured (missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH).');
    }

    this.logger.log(`Fetching Google Doc ${documentId}...`);
    const { data: doc } = await this.docsClient.documents.get({ documentId });
    const content = this.extractPlainText(doc);
    const title = doc.title ?? `Google Doc ${documentId}`;

    // Reuses the exact same ingestion pipeline as markdown/Slack sample data —
    // delta detection, LLM extraction, entity resolution, chunking/embedding.
    // No separate code path for Google Docs beyond this fetch-and-flatten step.
    return this.ingestion.ingestDocument({
      title,
      content,
      sourceType: 'GOOGLE_DOC',
      sourceUrl: `https://docs.google.com/document/d/${documentId}`,
    });
  }

  // Convenience: ingest every Google Doc in a Drive folder, for when the
  // person building the KB wants to point at a whole folder rather than
  // pasting individual doc IDs one at a time.
  async ingestFolder(folderId: string) {
    if (!this.driveClient) {
      throw new BadRequestException('Google Docs integration is not configured (missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH).');
    }

    const { data } = await this.driveClient.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'files(id, name)',
    });

    const files = data.files ?? [];
    this.logger.log(`Found ${files.length} Google Docs in folder ${folderId}`);

    const results = [];
    for (const file of files) {
      if (!file.id) continue;
      try {
        results.push(await this.ingestDocument(file.id));
      } catch (err: any) {
        this.logger.error(`Failed to ingest doc ${file.name} (${file.id}): ${err.message}`);
        results.push({ skipped: true, documentId: file.id, reason: `error: ${err.message}` });
      }
    }
    return results;
  }
}