import { IsOptional, IsString } from 'class-validator';

export class CreateClientDto {
  @IsString() name!: string;
  @IsString() @IsOptional() description?: string;
}

export class UpdateClientDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() description?: string;
}