// src/services/auth.service.ts
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { config } from '../config/env';
import { AppError } from '../middleware/errorHandler';

type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
};

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);

  async signup(email: string, password: string): Promise<{ user: User; token: string }> {
    const existingUser = await this.userRepository.findOne({ where: { email } });

    if (existingUser) {
      throw new AppError(400, 'User with this email already exists');
    }

    const user = this.userRepository.create({
      email,
      password,
      creditsBalance: 100,
    });

    await this.userRepository.save(user);

    const token = this.generateToken(user);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'creditsBalance', 'createdAt', 'updatedAt'],
    });

    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    const token = this.generateToken(user);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  async googleLogin(credential: string): Promise<{ user: User; token: string }> {
    if (!config.google.clientId) {
      throw new AppError(503, 'Google sign-in is not configured');
    }

    const { data } = await axios.get<GoogleTokenInfo>(
      'https://oauth2.googleapis.com/tokeninfo',
      { params: { id_token: credential }, timeout: 10000 }
    );

    const emailVerified =
      data.email_verified === true || data.email_verified === 'true';

    if (data.aud !== config.google.clientId || !data.email || !emailVerified) {
      throw new AppError(401, 'Invalid Google credential');
    }

    const email = data.email.toLowerCase();
    let user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      user = this.userRepository.create({
        email,
        password: crypto.randomUUID(),
        creditsBalance: 100,
      });
      await this.userRepository.save(user);
    }

    const token = this.generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  private generateToken(user: User): string {
    // ensure secret and options have the correct jsonwebtoken types
    const secret: jwt.Secret = config.jwt.secret as jwt.Secret;
    const options: jwt.SignOptions = {
      expiresIn: config.jwt.expiresIn as unknown as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(
      { userId: user.id, email: user.email },
      secret,
      options
    );
  }
}
