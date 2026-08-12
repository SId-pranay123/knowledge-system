import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Raw Prisma access for conversations/messages, kept separate from
// ConversationsService's business logic (title-setting on first message,
// calling the query pipeline, etc.) — same service/repository split as
// people, clients, projects, decisions, topics, relationships.
@Injectable()
export class ConversationsRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
  }

  findOneWithMessages(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
  }

  create(title: string) {
    return this.prisma.conversation.create({ data: { title } });
  }

  updateTitle(id: string, title: string) {
    return this.prisma.conversation.update({ where: { id }, data: { title } });
  }

  touch(id: string) {
    // bumps updatedAt with no field changes, so the sidebar sorts
    // most-recently-active chats first
    return this.prisma.conversation.update({ where: { id }, data: {} });
  }

  createMessage(data: {
    conversationId: string;
    question: string;
    answer: string;
    entities?: any;
    relationships?: any;
    sources?: any;
  }) {
    return this.prisma.message.create({ data });
  }

  remove(id: string) {
    return this.prisma.conversation.delete({ where: { id } });
  }
}