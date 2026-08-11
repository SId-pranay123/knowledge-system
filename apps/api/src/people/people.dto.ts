import { IsEmail, IsOptional, IsString } from 'class-validator';

export class CreatePersonDto {
  @IsString() name: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() role?: string;
  @IsString() @IsOptional() bio?: string;
}

export class UpdatePersonDto {
  @IsString() @IsOptional() name?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() role?: string;
  @IsString() @IsOptional() bio?: string;
}
