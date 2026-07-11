import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Actor } from '../entities/Actor';
import { ActorInfo } from '../types';

const TRIGGER_WORDS: Record<string, string> = {
  salman: 'sa1man',
  ryan: 'ry4n',
  emma: 'e4ma',
  john: 'j4hn',
  sophia: 's0phia',
  marcus: 'm4rcus',
};

function toActorInfo(actor: Actor): ActorInfo {
  return {
    id: actor.id,
    name: actor.name,
    triggerWord: TRIGGER_WORDS[actor.name.toLowerCase()] || actor.name.toLowerCase(),
    costPerVideo: actor.costPerVideo,
    avatarUrl: actor.avatarUrl,
  };
}

export class ActorService {
  private actorRepository: Repository<Actor>;

  constructor() {
    this.actorRepository = AppDataSource.getRepository(Actor);
  }

  async getAllActors(): Promise<ActorInfo[]> {
    const actors = await this.actorRepository.find();
    return actors.map(toActorInfo);
  }

  async getActorById(id: string): Promise<ActorInfo | undefined> {
    const actor = await this.actorRepository.findOne({ where: { id } });
    return actor ? toActorInfo(actor) : undefined;
  }

  async getActorByName(name: string): Promise<ActorInfo | undefined> {
    const actors = await this.actorRepository.find();
    const match = actors.find(
      (actor) => actor.name.toLowerCase() === name.toLowerCase()
    );
    return match ? toActorInfo(match) : undefined;
  }
}