import { IsString } from 'class-validator';

export class IngestGoogleDocDto {
  @IsString() documentId!: string;
}

export class IngestGoogleDocsFolderDto {
  @IsString() folderId!: string;
}