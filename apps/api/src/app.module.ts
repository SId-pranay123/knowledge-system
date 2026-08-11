import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PeopleModule } from './people/people.module';
import { ClientsModule } from './clients/clients.module';
import { ProjectsModule } from './projects/projects.module';
import { DocumentsModule } from './documents/documents.module';
import { DecisionsModule } from './decisions/decisions.module';
import { TopicsModule } from './topics/topics.module';
import { RelationshipsModule } from './relationships/relationships.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { NotionModule } from './notion/notion.module';
import { QueryModule } from './query/query.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    PeopleModule,
    ClientsModule,
    ProjectsModule,
    DocumentsModule,
    DecisionsModule,
    TopicsModule,
    RelationshipsModule,
    EmbeddingsModule,
    IngestionModule,
    NotionModule,
    QueryModule,
  ],
})
export class AppModule {}