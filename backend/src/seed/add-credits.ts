import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';

async function addCredits() {
  await AppDataSource.initialize();
  const userRepository = AppDataSource.getRepository(User);

  const email = 'arnavparashar7@gmail.com';
  const user = await userRepository.findOne({ where: { email } });

  if (!user) {
    console.error(`User with email "${email}" not found.`);
    await AppDataSource.destroy();
    return;
  }

  const creditsToAdd = 10000;
  user.creditsBalance += creditsToAdd;
  await userRepository.save(user);

  console.log(`Successfully added ${creditsToAdd} credits to user: ${email}`);
  console.log(`New balance: ${user.creditsBalance} credits`);

  await AppDataSource.destroy();
}

addCredits().catch(async (error) => {
  console.error('Failed to add credits:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
