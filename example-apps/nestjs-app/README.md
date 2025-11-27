# NestJS App with Prisma and PostgreSQL

This is a sample NestJS application demonstrating Prisma ORM integration with PostgreSQL database, instrumented with Instana collector.

## Features

- NestJS framework
- Prisma ORM (version 5.9.1)
- PostgreSQL database
- Instana tracing integration
- `/persons` endpoint for database operations

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database running
- npm or yarn

## Setup Instructions

### Quick Setup (Recommended)

Run the setup script:

```bash
chmod +x setup.sh
./setup.sh
```

This will:
1. Create `.env` file from `.env.example`
2. Install dependencies
3. Generate Prisma client
4. Push schema to database

### Manual Setup

#### 1. Install Dependencies

```bash
npm install
```

#### 2. Configure Database

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

The default configuration uses the same PostgreSQL credentials as the test environment:

```
DATABASE_URL="postgresql://node:nodepw@127.0.0.1:5432/nodedb?schema=prisma"
```

#### 3. Generate Prisma Client

**IMPORTANT:** You must run this command to generate the Prisma client with the schema types:

```bash
npx prisma generate
```

This will resolve TypeScript errors related to Prisma models.

#### 4. Push Schema to Database

```bash
npx prisma db push
```

This will create all tables (Person, Team, Profile, Tag, Role) in your database.

#### 5. Start the Application

```bash
npm run start
```

The application will start on port 3000 (or the port specified in your `.env` file).

## API Endpoints

### Initialize Database
```bash
GET http://localhost:3000/persons/init
```
Initializes the database with sample data including:
- Teams
- Persons with relations (team, profile, tags, roles)
- Tags and Roles

### Get All Persons
```bash
GET http://localhost:3000/persons
```
Returns all persons from the database (simple query).

### Complex Query with Relations
```bash
POST http://localhost:3000/persons/query
Content-Type: application/json

{
  "user": {
    "currentTeam": {
      "teamId": "team-001"
    }
  },
  "excludedIds": [1, 2]
}
```
Demonstrates a complex Prisma query with:
- `where` clause with `notIn` and `OR` conditions
- `include` for relations (profile, team, tags, roles)
- Filtering by team or system users
- Excluding specific IDs

### Create a Person
```bash
POST http://localhost:3000/persons
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "teamId": 1,
  "isSystemUser": false
}
```
Creates a new person in the database.

### Health Check
```bash
GET http://localhost:3000/
```
Returns "Hello World!" if the application is running.

### Instana Endpoint
```bash
GET http://localhost:3000/instana
```
Returns "This is the Instana endpoint!"

## Database Schema

The application uses a relational schema with multiple models:

```prisma
model Person {
  id            Int       @id @default(autoincrement())
  name          String
  email         String?
  teamId        Int?
  isSystemUser  Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  team          Team?     @relation(fields: [teamId], references: [id])
  profile       Profile?
  tags          Tag[]
  roles         Role[]
}

model Team {
  id        Int      @id @default(autoincrement())
  teamId    String   @unique
  name      String
  persons   Person[]
}

model Profile {
  id          Int      @id @default(autoincrement())
  personId    Int      @unique
  bio         String?
  avatarUrl   String?
  person      Person   @relation(fields: [personId], references: [id])
}

model Tag {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  persons   Person[]
}

model Role {
  id        Int      @id @default(autoincrement())
  name      String   @unique
  persons   Person[]
}
```

This schema demonstrates:
- One-to-many relations (Team → Person)
- One-to-one relations (Person → Profile)
- Many-to-many relations (Person ↔ Tag, Person ↔ Role)

## Prisma Commands

### View Database in Prisma Studio
```bash
npx prisma studio
```

### Reset Database
```bash
npx prisma db push --force-reset
```

### Generate Prisma Client (after schema changes)
```bash
npx prisma generate
```

## Testing with curl

```bash
# Initialize database with sample data
curl http://localhost:3000/persons/init

# Get all persons (simple query)
curl http://localhost:3000/persons

# Complex query with relations and filters
curl -X POST http://localhost:3000/persons/query \
  -H "Content-Type: application/json" \
  -d '{
    "user": {
      "currentTeam": {
        "teamId": "team-001"
      }
    },
    "excludedIds": []
  }'

# Create a new person
curl -X POST http://localhost:3000/persons \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "teamId": 1,
    "isSystemUser": false
  }'
```

## Instana Tracing

The application is instrumented with Instana collector. Traces will be automatically captured for:
- HTTP requests
- Database queries (Prisma)
- Application spans

Make sure your Instana agent is configured and running to see the traces.

## Project Structure

```
example-apps/nestjs-app/
├── prisma/
│   └── schema.prisma          # Prisma schema definition
├── src/
│   ├── persons/
│   │   ├── persons.controller.ts  # Persons endpoint controller
│   │   ├── persons.service.ts     # Persons business logic
│   │   └── persons.module.ts      # Persons module
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   ├── main.ts
│   └── prisma.service.ts      # Prisma client service
├── .env.example
├── package.json
└── README.md
```

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in `.env` file
- Ensure database exists and user has proper permissions

### Prisma Client Not Found
Run `npx prisma generate` to generate the Prisma client

### Column Does Not Exist Error (P2022)
If you get an error like `"code":"P2022","meta":{"column":"Person.email"}`, it means the database schema is out of sync with your Prisma schema.

**Solution:**
```bash
npx prisma db push
```

This will update the database schema to match your Prisma schema file.

**Note:** If you already have data in the database and the schema change is incompatible, you may need to:
1. Backup your data
2. Run `npx prisma db push --force-reset` to reset the database
3. Re-initialize with `GET /persons/init`

### Port Already in Use
Change the PORT in `.env` file or stop the process using port 3000
