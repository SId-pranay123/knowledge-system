import { Body, Controller, Post } from '@nestjs/common';
import { QueryService } from './query.service';
import { AskQuestionDto } from './query.dto';

@Controller('api/query')
export class QueryController {
  constructor(private service: QueryService) {}

  @Post() ask(@Body() dto: AskQuestionDto) { return this.service.ask(dto.question); }
}
