import { IsString } from 'class-validator';

export class IngestNotionPageDto {
  @IsString() pageId!: string;
}