# Nextjs-starter-GraphQl
a basic template with Next.js, Tailwind CSS, TypeScript, and a GraphQL setup using Yoga and Pothos. You can use this template as a starting point for any future GraphQL projects by copying the project and adjusting the graphql schema and resolvers as needed.  Feel free to customize this template further based on your needs!

# 🚀 Next.js GraphQL Auto-CRUD

A powerful, type-safe GraphQL API with automatic CRUD generation using Next.js, Prisma, and Pothos.

## ✨ Features

- 🔄 **Auto-CRUD Generation** - Automatically generates GraphQL queries and mutations for all Prisma models
- 🛡️ **Type Safety** - End-to-end type safety with TypeScript and Prisma
- 🔐 **Authentication & Authorization** - Built-in JWT authentication and role-based access control
- 📊 **Advanced Querying** - Filtering, sorting, pagination, and relations out of the box
- 🎨 **GraphiQL Interface** - Interactive GraphQL playground for testing
- 🐳 **Docker Support** - Easy database setup with Docker Compose
- 🌱 **Database Seeding** - Sample data to get started quickly
- 📈 **Scalable Architecture** - Built with best practices for production use

## 🏗️ Tech Stack

- **Frontend Framework**: Next.js 14
- **GraphQL**: GraphQL Yoga + Pothos Schema Builder
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT tokens
- **Type Safety**: TypeScript throughout
- **Development**: Docker Compose for local database

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/AmanVatsSharma/Nextjs-starter-GraphQl.git
cd Nextjs-starter-GraphQl
npm install
```

### 2. Setup Database

Start PostgreSQL with Docker:

```bash
docker-compose up -d
```

Or use your own PostgreSQL instance and update the `DATABASE_URL` in `.env`

### 3. Environment Setup

```bash
cp .env.example .env
# Edit .env with your database credentials
```

### 4. Database Migration & Seeding

```bash
# Generate Prisma client and run migrations
npm run generate
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000/api/graphql` to access GraphiQL!

## 📖 Usage Examples

### Basic Queries

```graphql
# Get all users with pagination
query GetUsers {
  findManyUser(take: 10, skip: 0) {
    id
    name
    email
    role
    createdAt
    posts {
      id
      title
      published
    }
  }
}

# Find a specific user
query GetUser {
  findUniqueUser(where: { id: "user-id-here" }) {
    id
    name
    email
    bio
    posts {
      title
      content
      tags {
        name
        color
      }
    }
  }
}

# Get posts with complex filtering
query GetPublishedPosts {
  findManyPost(
    where: { 
      published: { equals: true }
      author: { role: { equals: ADMIN } }
    }
    orderBy: [{ createdAt: desc }]
    take: 5
  ) {
    id
    title
    content
    views
    author {
      name
      avatar
    }
    comments {
      content
      author {
        name
      }
    }
  }
}
```

### Mutations

```graphql
# Create a new user
mutation CreateUser {
  createOneUser(data: {
    name: "Alice Johnson"
    email: "alice@example.com"
    bio: "Software engineer and open source contributor"
    role: USER
  }) {
    id
    name
    email
    createdAt
  }
}

# Create a post with tags
mutation CreatePost {
  createOnePost(data: {
    title: "My New Blog Post"
    content: "This is the content of my blog post..."
    slug: "my-new-blog-post"
    published: true
    authorId: "user-id-here"
    tags: {
      connect: [
        { id: "tag-id-1" }
        { id: "tag-id-2" }
      ]
    }
  }) {
    id
    title
    slug
    published
    author {
      name
    }
    tags {
      name
      color
    }
  }
}

# Update a user
mutation UpdateUser {
  updateOneUser(
    where: { id: "user-id-here" }
    data: {
      bio: { set: "Updated bio information" }
      isActive: { set: true }
    }
  ) {
    id
    name
    bio
    isActive
  }
}

# Batch create users
mutation CreateManyUsers {
  createManyUser(data: [
    {
      name: "User 1"
      email: "user1@example.com"
    }
    {
      name: "User 2"
      email: "user2@example.com"
    }
  ]) {
    id
    name
    email
  }
}
```

### Advanced Filtering

```graphql
# Complex where conditions
query SearchPosts {
  findManyPost(
    where: {
      OR: [
        { title: { contains: "GraphQL", mode: insensitive } }
        { content: { contains: "API", mode: insensitive } }
      ]
      AND: [
        { published: { equals: true } }
        { views: { gte: 100 } }
        { author: { role: { in: [ADMIN, MODERATOR] } } }
      ]
    }
  ) {
    id
    title
    views
    author {
      name
      role
    }
  }
}
```

## 🔐 Authentication

The API supports JWT-based authentication. Include the token in your requests:

```javascript
const response = await fetch('/api/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer your-jwt-token-here'
  },
  body: JSON.stringify({
    query: `
      query Me {
        me {
          id
          name
          email
          role
        }
      }
    `
  })
});
```

## 🛡️ Authorization Scopes

The API includes built-in authorization scopes:

- `authenticated`: Requires a valid JWT token
- `admin`: Requires ADMIN role
- `owner`: Dynamic scope for resource ownership

### Customizing Authorization

You can customize authorization in the `handleResolver` function:

```typescript
generateAllCrud({
  handleResolver: ({ field, modelName, operationName, type }) => {
    // Require authentication for all mutations
    if (type === 'Mutation') {
      return {
        ...field,
        authScopes: { authenticated: true }
      };
    }
    
    // Require admin for delete operations
    if (operationName.includes('delete')) {
      return {
        ...field,
        authScopes: { admin: true }
      };
    }
    
    return field;
  }
});
```

## 📁 Project Structure

```
├── lib/
│   └── builder.ts              # Pothos schema builder configuration
├── generated/                  # Auto-generated files (ignored in git)
│   ├── autocrud.ts            # CRUD operations generator
│   ├── inputs.ts              # GraphQL input types
│   ├── objects.ts             # GraphQL object types
│   └── pothos-types.ts        # Pothos type definitions
├── pages/api/
│   └── graphql.ts             # GraphQL API endpoint
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Database seeder
│   └── generated/             # Prisma client (auto-generated)
├── docker-compose.yml         # Local database setup
├── .env.example              # Environment variables template
└── README.md
```

## 🔧 Available Scripts

```bash
# Development
npm run dev                    # Start development server
npm run build                  # Build for production
npm run start                  # Start production server

# Database
npm run generate              # Generate Prisma client and types
npm run db:migrate            # Run database migrations
npm run db:push               # Push schema changes to database
npm run db:seed               # Seed database with sample data
npm run db:studio             # Open Prisma Studio
npm run db:reset              # Reset database (destructive)

# Utilities
npm run lint                  # Run ESLint
npm run type-check            # Run TypeScript type checking
npm run clean:generated       # Clean generated files
```

## 🎯 Adding New Models

1. **Define your model in `prisma/schema.prisma`:**

```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Float
  inStock     Boolean  @default(true)
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("products")
}
```

2. **Generate and migrate:**

```bash
npm run generate
npm run db:migrate
```

3. **Restart your dev server** - CRUD operations are automatically generated!

4. **Use your new CRUD operations:**

```graphql
query GetProducts {
  findManyProduct {
    id
    name
    price
    category {
      name
    }
  }
}

mutation CreateProduct {
  createOneProduct(data: {
    name: "New Product"
    price: 29.99
    categoryId: "category-id"
  }) {
    id
    name
    price
  }
}
```

## 🔄 Generated Operations

For each Prisma model, the following GraphQL operations are automatically generated:

### Queries
- `findUnique{Model}` - Find a single record by unique field
- `findFirst{Model}` - Find the first record matching criteria
- `findMany{Model}` - Find multiple records with filtering/pagination
- `count{Model}` - Count records matching criteria

### Mutations
- `createOne{Model}` - Create a single record
- `createMany{Model}` - Create multiple records
- `updateOne{Model}` - Update a single record
- `updateMany{Model}` - Update multiple records
- `deleteOne{Model}` - Delete a single record
- `deleteMany{Model}` - Delete multiple records
- `upsertOne{Model}` - Create or update a record

## 🚀 Production Deployment

### Environment Variables

```bash
DATABASE_URL="your-production-database-url"
JWT_SECRET="your-secure-jwt-secret"
FRONTEND_URL="https://yourdomain.com"
NODE_ENV="production"
DISABLE_VORTEX_LOGGER="true"  # Optional: Set to 'true' to disable all Vortex logging
```

### Build and Deploy

```bash
npm run build
npm start
```

### Docker Production Build

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run generate
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and type checking
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Troubleshooting

### Common Issues

**1. "Cannot find module" errors:**
```bash
npm run clean:generated
npm run generate
```

**2. Database connection errors:**
- Check your `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running (`docker-compose up -d`)

**3. TypeScript errors in generated files:**
- Generated files are automatically ignored in `tsconfig.json`
- If you see errors, run `npm run clean:generated && npm run generate`

**4. GraphQL schema errors:**
- Restart your development server after schema changes
- Check for circular dependencies in your Prisma schema

### Performance Tips

- Use `take` and `skip` for pagination
- Select only needed fields in your queries
- Use database indexes for frequently queried fields
- Enable Prisma query logging in development

## 📚 Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Pothos GraphQL](https://pothos-graphql.dev)
- [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)

---

## 📖 Project Documentation

### Core Documentation
- [`TRADING_SYSTEM_ARCHITECTURE.md`](./TRADING_SYSTEM_ARCHITECTURE.md) - Complete system architecture and design
- [`FEATURE_ROADMAP.md`](./FEATURE_ROADMAP.md) - Future enhancements and planned features
- [`MIGRATION_GUIDE.md`](./MIGRATION_GUIDE.md) - Migration documentation
- [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md) - Production deployment guide
- [`CHANGELOG.md`](./CHANGELOG.md) - Project changelog and milestones

### Setup & Configuration
- [`CONSOLE_SETUP.md`](./CONSOLE_SETUP.md) - Console setup instructions
- [`ADMIN_CONSOLE_SETUP.md`](./ADMIN_CONSOLE_SETUP.md) - Admin console setup
- [`WEBSOCKET_SETUP_GUIDE.md`](./WEBSOCKET_SETUP_GUIDE.md) - WebSocket configuration
- [`VORTEX_INTEGRATION.md`](./VORTEX_INTEGRATION.md) - Vortex API integration guide
- [`SMS_SETUP_GUIDE.md`](./SMS_SETUP_GUIDE.md) - SMS setup guide
- [`MOBILE_AUTH_SETUP.md`](./MOBILE_AUTH_SETUP.md) - Mobile authentication setup
- [`LOGGING_GUIDE.md`](./LOGGING_GUIDE.md) - Logging configuration

### Quick Reference
- [`AUTH_QUICK_REFERENCE.md`](./AUTH_QUICK_REFERENCE.md) - Authentication quick reference
- [`WATCHLIST_QUICK_REFERENCE.md`](./WATCHLIST_QUICK_REFERENCE.md) - Watchlist quick reference
- [`IST_TIMEZONE_QUICK_GUIDE.md`](./IST_TIMEZONE_QUICK_GUIDE.md) - Timezone handling guide
- [`QUICK_REFERENCE_REALTIME_HOOKS.md`](./QUICK_REFERENCE_REALTIME_HOOKS.md) - Realtime hooks reference

### Integration Guides
- [`WATCHLIST_INTEGRATION_GUIDE.md`](./WATCHLIST_INTEGRATION_GUIDE.md) - Watchlist integration
- [`WEBSCKET_INTEGRATIONGUIDE.MD`](./WEBSCKET_INTEGRATIONGUIDE.MD) - WebSocket integration
- [`MIGRATION_GUIDE_RPC_TO_SERVICES.md`](./MIGRATION_GUIDE_RPC_TO_SERVICES.md) - RPC to services migration

### Module-Specific Documentation
See the [`docs/`](./docs/) folder for detailed module-specific documentation:
- Authentication flows
- Console architecture
- Order execution optimization
- WebSocket architecture
- And more...
