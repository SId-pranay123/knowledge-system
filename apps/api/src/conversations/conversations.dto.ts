import { IsString } from 'class-validator';

export class AskInConversationDto {
  @IsString() question!: string;
}