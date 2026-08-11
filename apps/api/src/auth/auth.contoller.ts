import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';

@Controller('api/auth')
export class AuthController {
  constructor(private service: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto.username, dto.password);
  }
}