import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTopicDto, UpdateTopicDto } from './topics.dto';
import { TopicsRepository } from './topics.repository';

@Injectable()
export class TopicsService {
  constructor(private topicsRepository: TopicsRepository) {}

  findAll() {
    return this.topicsRepository.findAll();
  }

  async findOne(id: string) {
    const topic = await this.topicsRepository.findOne(id);
    if (!topic) throw new NotFoundException(`Topic ${id} not found`);
    return topic;
  }

  create(dto: CreateTopicDto) {
    return this.topicsRepository.create(dto);
  }

  async update(id: string, dto: UpdateTopicDto) {
    await this.findOne(id);
    return this.topicsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.topicsRepository.remove(id);
  }
}
