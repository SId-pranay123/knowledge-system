import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'] as const;

export class CreateProjectDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
  @IsIn(STATUSES) @IsOptional() status?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
}

export class UpdateProjectDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
  @IsIn(STATUSES) @IsOptional() status?: string;
  @IsString() @IsOptional() clientId?: string;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
}