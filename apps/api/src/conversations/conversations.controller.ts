import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { AskInConversationDto } from './conversations.dto';

// No auth guard — consistent with other read/query endpoints being public;
// only mutating team-data endpoints (people/projects/etc CRUD) are gated.
@Controller('api/conversations')
export class ConversationsController {
  constructor(private service: ConversationsService) {}

  @Get() findAll() { return this.service.findAll(); }

  @Get(':id') findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post() create() { return this.service.create(); }

  @Post(':id/messages')
  ask(@Param('id') id: string, @Body() dto: AskInConversationDto) {
    return this.service.ask(id, dto.question);
  }

  @Delete(':id') remove(@Param('id') id: string) { return this.service.remove(id); }
}