import { Repository } from 'typeorm';

class TestEntity {
  id!: string;
  name!: string;
}

// Simulate what the service code does
const mockRepo = {} as Repository<TestEntity>;
const result = mockRepo.create({ name: 'test' });
// What type is result?
const r: typeof result = result;
console.log(r); // just to use r
