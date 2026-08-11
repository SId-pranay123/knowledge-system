import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePersonDto, UpdatePersonDto } from './people.dto';
import { PeopleRepository } from './people.repository';

@Injectable()
export class PeopleService {
  constructor(private peopleRepository: PeopleRepository) {}

  findAll() {
    return this.peopleRepository.findAll();
  }

  async findOne(id: string) {
    const person = await this.peopleRepository.findOne(id);
    if (!person) throw new NotFoundException(`Person ${id} not found`);
    return person;
  }

  create(dto: CreatePersonDto) {
    return this.peopleRepository.create(dto);
  }

  async update(id: string, dto: UpdatePersonDto) {
    await this.findOne(id);
    return this.peopleRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.peopleRepository.remove(id);
  }
}
