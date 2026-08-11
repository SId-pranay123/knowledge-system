import { IsIn, IsOptional, IsString } from 'class-validator';

const SOURCE_TYPES = ['LOCAL', 'GOOGLE_DOC', 'SLACK', 'MANUAL'] as const;

export class UpdateDocumentDto {
  @IsString() @IsOptional() title?: string;
  @IsIn(SOURCE_TYPES) @IsOptional() sourceType?: string;
  @IsString() @IsOptional() sourceUrl?: string;
}