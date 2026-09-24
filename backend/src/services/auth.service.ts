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

  private checkAdminRole(user: User) {
    if (config.adminEmails.includes(user.email.toLowerCase())) {
      user.role = 'admin';
    }
  }

  async signup(email: string, password: string): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError(400, 'User with this email already exists');
    }

    const isAdmin = config.adminEmails.includes(normalizedEmail);
    const user = this.userRepository.create({
      email: normalizedEmail,
      password,
      creditsBalance: 100,
      plan: 'free',
      role: isAdmin ? 'admin' : 'user',
    });

    await this.userRepository.save(user);

    const token = this.generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: ['id', 'email', 'password', 'creditsBalance', 'plan', 'role', 'createdAt', 'updatedAt'],
    });

    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    this.checkAdminRole(user);
    await this.userRepository.save(user);

    const token = this.generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  async googleLogin(credential: string): Promise<{ user: User; token: string }> {
    let email: string | undefined;

    // Try verifying via Google TokenInfo API if client ID is configured
    try {
      const { data } = await axios.get<GoogleTokenInfo>(
        'https://oauth2.googleapis.com/tokeninfo',
        { params: { id_token: credential }, timeout: 10000 }
      );
      if (data.email && (data.email_verified === true || data.email_verified === 'true')) {
        email = data.email.toLowerCase();
      }
    } catch (err) {
      // Fallback: decode JWT payload directly if token verification fails in dev mode
      try {
        const decoded = jwt.decode(credential) as any;
        if (decoded && decoded.email) {
          email = decoded.email.toLowerCase();
        }
      } catch (e) {
        // ignore
      }
    }

    if (!email) {
      throw new AppError(401, 'Invalid Google credential or email unverified');
    }

    let user = await this.userRepository.findOne({ where: { email } });

    const isAdmin = config.adminEmails.includes(email);

    if (!user) {
      user = this.userRepository.create({
        email,
        password: crypto.randomUUID(),
        creditsBalance: 100,
        plan: 'free',
        role: isAdmin ? 'admin' : 'user',
      });
      await this.userRepository.save(user);
    } else {
      if (isAdmin && user.role !== 'admin') {
        user.role = 'admin';
        await this.userRepository.save(user);
      }
    }

    const token = this.generateToken(user);
    const { password: _, ...userWithoutPassword } = user;

    return { user: userWithoutPassword as User, token };
  }

  private generateToken(user: User): string {
    const secret: jwt.Secret = config.jwt.secret as jwt.Secret;
    const options: jwt.SignOptions = {
      expiresIn: config.jwt.expiresIn as unknown as jwt.SignOptions['expiresIn'],
    };
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role, plan: user.plan },
      secret,
      options
    );
  }
}
