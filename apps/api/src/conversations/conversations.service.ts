import { Injectable, NotFoundException } from '@nestjs/common';
import { ConversationsRepository } from './conversations.repository';
import { QueryService } from '../query/query.service';

// Chat sessions: a Conversation groups Messages (question+answer pairs), the
// same mental model as a ChatGPT/Claude thread. Each ask() call runs the real
// query pipeline once and persists the result — nothing is recomputed when
// browsing history, since the full answer/entities/relationships/sources are
// stored alongside the question.
@Injectable()
export class ConversationsService {
  constructor(private repo: ConversationsRepository, private queryService: QueryService) {}

  findAll() {
    return this.repo.findAll();
  }

  async findOne(id: string) {
    const conversation = await this.repo.findOneWithMessages(id);
    if (!conversation) throw new NotFoundException(`Conversation ${id} not found`);
    return conversation;
  }

  create() {
    return this.repo.create('New chat');
  }

  // Runs the question through the real query pipeline (LLM extraction of
  // intent, graph traversal, vector search, synthesis), then persists the
  // question+answer as a Message. The first question in a conversation also
  // sets the conversation's title (truncated), so the sidebar shows something
  // meaningful instead of every entry reading "New chat".
  async ask(conversationId: string, question: string) {
    const conversation = await this.findOne(conversationId);
    const result = await this.queryService.ask(question);

    const message = await this.repo.createMessage({
      conversationId,
      question,
      answer: typeof result.answer === 'string' ? result.answer : String(result.answer),
      entities: result.entities as any,
      relationships: result.relationships as any,
      sources: result.sources as any,
    });

    if (conversation.messages.length === 0) {
      await this.repo.updateTitle(conversationId, question.length > 60 ? question.slice(0, 57) + '...' : question);
    } else {
      await this.repo.touch(conversationId);
    }

    return message;
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.repo.remove(id);
  }
}