import { Module } from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsController } from './conversations.controller';
import { QueryModule } from '../query/query.module';

@Module({
  imports: [QueryModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, ConversationsRepository],
})
export class ConversationsModule {}