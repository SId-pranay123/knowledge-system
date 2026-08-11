import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateDecisionDto, UpdateDecisionDto } from './decisions.dto';
import { DecisionsRepository } from './decisions.repository';

@Injectable()
export class DecisionsService {
  constructor(private decisionsRepository: DecisionsRepository) {}

  findAll() {
    return this.decisionsRepository.findAll();
  }

  async findOne(id: string) {
    const decision = await this.decisionsRepository.findOne(id);
    if (!decision) throw new NotFoundException(`Decision ${id} not found`);
    return decision;
  }

  create(dto: CreateDecisionDto) {
    return this.decisionsRepository.create(dto);
  }

  // If this decision supersedes another, mark the old one SUPERSEDED automatically —
  // this is what lets the system represent decision evolution rather than static facts.
  async update(id: string, dto: UpdateDecisionDto) {
    await this.findOne(id);
    if (dto.supersedesDecisionId) {
      await this.decisionsRepository.updateSupersededDecision(dto.supersedesDecisionId);
    }
    return this.decisionsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.decisionsRepository.remove(id);
  }
}
