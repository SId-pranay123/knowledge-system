import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateClientDto, UpdateClientDto } from './clients.dto';
import { ClientsRepository } from './clients.repository';

@Injectable()
export class ClientsService {
  constructor(private clientsRepository: ClientsRepository) {}

  findAll() {
    return this.clientsRepository.findAll();
  }

  async findOne(id: string) {
    const client = await this.clientsRepository.findOne(id);
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return client;
  }

  create(dto: CreateClientDto) {
    return this.clientsRepository.create(dto);
  }

  async update(id: string, dto: UpdateClientDto) {
    await this.findOne(id);
    return this.clientsRepository.update(id, dto);
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.clientsRepository.remove(id);
  }
}
