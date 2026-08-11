import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProjectDto, UpdateProjectDto } from './projects.dto';
import { ProjectsRepository } from './projects.repository';

@Injectable()
export class ProjectsService {
  constructor(private projectsRepository: ProjectsRepository) {}

  findAll() {
    return this.projectsRepository.findAll();
  }

  async findOne(id: string) {
    const project = await this.projectsRepository.findOne(id);
    if (!project) throw new NotFoundException(`Project ${id} not found`);
    return project;
  }

  create(dto: CreateProjectDto) {
    return this.projectsRepository.create(dto);
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.projectsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.projectsRepository.remove(id);
  }
}
