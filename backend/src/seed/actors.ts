import 'reflect-metadata';
import { AppDataSource } from '../config/database';
import { Actor } from '../entities/Actor';

const actors = [
  { name: 'Reina', costPerVideo: 0, avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&auto=format&fit=crop&q=80', isPro: false },
  { name: 'Tarina', costPerVideo: 30, avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&auto=format&fit=crop&q=80', isPro: true },
  { name: 'Salman', costPerVideo: 50, avatarUrl: null, isPro: true },
  { name: 'Ryan', costPerVideo: 45, avatarUrl: null, isPro: false },
  { name: 'Emma', costPerVideo: 40, avatarUrl: null, isPro: false },
  { name: 'John', costPerVideo: 35, avatarUrl: null, isPro: false },
  { name: 'Sophia', costPerVideo: 55, avatarUrl: null, isPro: true },
];

async function seedActors() {
  await AppDataSource.initialize();
  const actorRepository = AppDataSource.getRepository(Actor);

  // Rename existing 'Marcus' to 'Tarina' if present
  const marcus = await actorRepository.findOne({ where: { name: 'Marcus' } });
  if (marcus) {
    marcus.name = 'Tarina';
    marcus.isPro = true;
    await actorRepository.save(marcus);
    console.log("Renamed existing Marcus actor in DB to Tarina");
  }

  for (const actor of actors) {
    const existing = await actorRepository.findOne({
      where: { name: actor.name },
    });

    if (existing) {
      existing.costPerVideo = actor.costPerVideo;
      existing.avatarUrl = actor.avatarUrl ?? '';
      existing.isPro = actor.isPro;
      await actorRepository.save(existing);
      continue;
    }

    await actorRepository.save(
      actorRepository.create({
        name: actor.name,
        costPerVideo: actor.costPerVideo,
        avatarUrl: actor.avatarUrl ?? '',
        isPro: actor.isPro,
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
