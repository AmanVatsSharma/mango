import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: 'John Doe',
        email: 'john@example.com',
        bio: 'Full-stack developer and tech enthusiast',
        role: Role.ADMIN,
        avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        bio: 'Frontend developer and UI/UX designer',
        role: Role.USER,
        avatar: 'https://images.unsplash.com/photo-1494790108755-2616b02b2e6e?w=400',
      },
    }),
    prisma.user.create({
      data: {
        name: 'Mike Johnson',
        email: 'mike@example.com',
        bio: 'Backend developer and DevOps engineer',
        role: Role.MODERATOR,
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} users`);

  // Create tags
  const tags = await Promise.all([
    prisma.tag.create({
      data: { name: 'JavaScript', color: '#F7DF1E' },
    }),
    prisma.tag.create({
      data: { name: 'TypeScript', color: '#3178C6' },
    }),
    prisma.tag.create({
      data: { name: 'React', color: '#61DAFB' },
    }),
    prisma.tag.create({
      data: { name: 'Next.js', color: '#000000' },
    }),
    prisma.tag.create({
      data: { name: 'GraphQL', color: '#E10098' },
    }),
    prisma.tag.create({
      data: { name: 'Prisma', color: '#2D3748' },
    }),
  ]);

  console.log(`✅ Created ${tags.length} tags`);

  // Create categories
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Web Development',
        description: 'Articles about web development technologies and practices',
        color: '#3B82F6',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Backend',
        description: 'Server-side development and architecture',
        color: '#10B981',
      },
    }),
    prisma.category.create({
      data: {
        name: 'Frontend',
        description: 'Client-side development and user interfaces',
        color: '#F59E0B',
      },
    }),
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // Create posts
  const posts = await Promise.all([
    prisma.post.create({
      data: {
        title: 'Getting Started with Next.js and GraphQL',
        slug: 'getting-started-nextjs-graphql',
        content: 'Learn how to build a modern web application using Next.js and GraphQL. This comprehensive guide covers everything from setup to deployment.',
        published: true,
        views: 1250,
        authorId: users[0].id,
        tags: {
          connect: [
            { id: tags[3].id }, // Next.js
            { id: tags[4].id }, // GraphQL
            { id: tags[1].id }, // TypeScript
          ],
        },
      },
    }),
    prisma.post.create({
      data: {
        title: 'Building Type-Safe APIs with Prisma and Pothos',
        slug: 'building-type-safe-apis-prisma-pothos',
        content: 'Discover how to create robust, type-safe GraphQL APIs using Prisma as your database toolkit and Pothos as your schema builder.',
        published: true,
        views: 890,
        authorId: users[2].id,
        tags: {
          connect: [
            { id: tags[5].id }, // Prisma
            { id: tags[4].id }, // GraphQL
            { id: tags[1].id }, // TypeScript
          ],
        },
      },
    }),
    prisma.post.create({
      data: {
        title: 'React Best Practices in 2024',
        slug: 'react-best-practices-2024',
        content: 'Stay up-to-date with the latest React patterns, hooks, and best practices that will make your applications more maintainable and performant.',
        published: true,
        views: 2100,
        authorId: users[1].id,
        tags: {
          connect: [
            { id: tags[2].id }, // React
            { id: tags[0].id }, // JavaScript
            { id: tags[1].id }, // TypeScript
          ],
        },
      },
    }),
    prisma.post.create({
      data: {
        title: 'Advanced TypeScript Patterns',
        slug: 'advanced-typescript-patterns',
        content: 'Explore advanced TypeScript patterns and techniques that will help you write more robust and maintainable code.',
        published: false,
        views: 0,
        authorId: users[0].id,
        tags: {
          connect: [
            { id: tags[1].id }, // TypeScript
          ],
        },
      },
    }),
  ]);

  console.log(`✅ Created ${posts.length} posts`);

  // Create comments
  const comments = await Promise.all([
    prisma.comment.create({
      data: {
        content: 'Great article! This really helped me understand GraphQL better.',
        postId: posts[0].id,
        authorId: users[1].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Thanks for sharing this. The Prisma integration examples were particularly useful.',
        postId: posts[1].id,
        authorId: users[0].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Excellent overview of React patterns. Looking forward to more content like this!',
        postId: posts[2].id,
        authorId: users[2].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'The code examples are very clear and well-explained.',
        postId: posts[0].id,
        authorId: users[2].id,
      },
    }),
  ]);

  console.log(`✅ Created ${comments.length} comments`);

  console.log('🎉 Database seed completed successfully!');
  
  // Display summary
  console.log('\n📊 Summary:');
  console.log(`- ${users.length} users created`);
  console.log(`- ${tags.length} tags created`);
  console.log(`- ${categories.length} categories created`);  
  console.log(`- ${posts.length} posts created`);
  console.log(`- ${comments.length} comments created`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });