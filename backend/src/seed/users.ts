import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';

const users = [
  {
    email: 'demo1@cloneos.com',
    password: 'Password123!',
    creditsBalance: 1000,
  },
  {
    email: 'demo2@cloneos.com',
    password: 'Password123!',
    creditsBalance: 1000,
  },
];

async function seedUsers() {
  await AppDataSource.initialize();
  const userRepository = AppDataSource.getRepository(User);

  for (const userData of users) {
    const existing = await userRepository.findOne({
      where: { email: userData.email },
    });

    if (existing) {
      existing.creditsBalance = userData.creditsBalance;
      existing.password = userData.password; // Triggers BeforeUpdate hash hook
      await userRepository.save(existing);
      console.log(`Updated credentials/credits for existing user: ${userData.email}`);
    } else {
      const user = userRepository.create({
        email: userData.email,
        password: userData.password, // Triggers BeforeInsert hash hook
        creditsBalance: userData.creditsBalance,
      });
      await userRepository.save(user);
      console.log(`Created new seeded user: ${userData.email}`);
    }
  }

  await AppDataSource.destroy();
  console.log('Seeding of users complete.');
}

seedUsers().catch(async (error) => {
  console.error('Failed to seed users:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
