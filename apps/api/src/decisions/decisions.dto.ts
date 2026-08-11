import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['ACTIVE', 'SUPERSEDED', 'REJECTED', 'PROPOSED'] as const;

export class CreateDecisionDto {
  @IsString() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() reasoning?: string;
  @IsDateString() @IsOptional() decisionDate?: string;
  @IsIn(STATUSES) @IsOptional() status?: string;
  @IsString() @IsOptional() supersedesDecisionId?: string;
}

export class UpdateDecisionDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() reasoning?: string;
  @IsDateString() @IsOptional() decisionDate?: string;
  @IsIn(STATUSES) @IsOptional() status?: string;
  @IsString() @IsOptional() supersedesDecisionId?: string;
}