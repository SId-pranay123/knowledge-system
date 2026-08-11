import { IsOptional, IsString } from 'class-validator';

export class CreateTopicDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
}

export class UpdateTopicDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
}