import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AppError } from '../middleware/errorHandler';

export class UserService {
  private userRepository: Repository<User>;

  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createUser(email: string, initialCredits: number = 100): Promise<User> {
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new AppError(409, 'User with this email already exists');
    }

    const user = this.userRepository.create({
      email,
      creditsBalance: initialCredits,
    });

    return this.userRepository.save(user);
  }

  async getUserById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async getUserCredits(userId: string): Promise<number> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user.creditsBalance;
  }

  async deductCredits(userId: string, amount: number): Promise<User> {
    return AppDataSource.transaction(async (transactionalEntityManager) => {
      const user = await transactionalEntityManager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new AppError(404, 'User not found');
      }

      if (user.creditsBalance < amount) {
        throw new AppError(402, `Insufficient credits. Required: ${amount}, Available: ${user.creditsBalance}`);
      }

      user.creditsBalance -= amount;
      return transactionalEntityManager.save(user);
    });
  }

  async addCredits(userId: string, amount: number): Promise<User> {
    const user = await this.getUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    user.creditsBalance += amount;
    return this.userRepository.save(user);
  }
}