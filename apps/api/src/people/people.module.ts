import { Module } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';
import { PeopleRepository } from './people.repository';

@Module({
  controllers: [PeopleController],
  providers: [PeopleService, PeopleRepository],
  exports: [PeopleService],
})
export class PeopleModule {}
