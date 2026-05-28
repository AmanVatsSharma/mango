import { Repository, DeepPartial } from 'typeorm';
import { Entity } from 'typeorm';

@Entity()
class TestEntity {
  id!: string;
  name!: string;
}

declare const repo: Repository<TestEntity>;

// What type does create() return when passed a DeepPartial?
const result = repo.create({ name: 'test' });
// What type is 'result'?
