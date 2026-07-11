// src/services/info.service.ts
import { AppDataSource } from '../config/database';
import { Info } from '../entities/Info';
import { AppError } from '../middleware/errorHandler';

export class InfoService {
  private infoRepository = AppDataSource.getRepository(Info);

  async submitInfo(data: {
    fullName: string;
    email: string;
    company?: string;
    useCase?: string;
  }): Promise<Info> {
    const existing = await this.infoRepository.findOne({
      where: { email: data.email },
    });

    if (existing) {
      throw new AppError(409, 'This email is already on the waitlist.');
    }

    const info = this.infoRepository.create({
      fullName: data.fullName,
      email: data.email,
      company: data.company ?? null,
      useCase: data.useCase ?? null,
    });

    await this.infoRepository.save(info);
    return info;
  }
}
