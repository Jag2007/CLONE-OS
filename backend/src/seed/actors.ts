import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { Actor } from '../entities/Actor';

const actors = [
  { name: 'Salman', costPerVideo: 50, avatarUrl: null },
  { name: 'Ryan', costPerVideo: 45, avatarUrl: null },
  { name: 'Emma', costPerVideo: 40, avatarUrl: null },
  { name: 'John', costPerVideo: 35, avatarUrl: null },
  { name: 'Sophia', costPerVideo: 55, avatarUrl: null },
  { name: 'Marcus', costPerVideo: 30, avatarUrl: null },
];

async function seedActors() {
  await AppDataSource.initialize();
  const actorRepository = AppDataSource.getRepository(Actor);

  for (const actor of actors) {
    const existing = await actorRepository.findOne({
      where: { name: actor.name },
    });

    if (existing) {
      existing.costPerVideo = actor.costPerVideo;
      existing.avatarUrl = actor.avatarUrl ?? '';
      await actorRepository.save(existing);
      continue;
    }

    await actorRepository.save(
      actorRepository.create({
        name: actor.name,
        costPerVideo: actor.costPerVideo,
        avatarUrl: actor.avatarUrl ?? '',
      }),
    );
  }

  await AppDataSource.destroy();
  console.log(`Seeded ${actors.length} actors`);
}

seedActors().catch(async (error) => {
  console.error('Failed to seed actors:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
  process.exit(1);
});
