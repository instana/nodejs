#!/bin/bash

# Setup script for NestJS Prisma example

echo "🚀 Setting up NestJS Prisma example..."

# Copy .env.example to .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env file..."
  cp .env.example .env
  echo "✅ .env file created"
else
  echo "ℹ️  .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Push schema to database
echo "🗄️  Pushing schema to database..."
npx prisma db push

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure PostgreSQL is running with the credentials in .env"
echo "2. Run 'npm run start' to start the application"
echo "3. Visit http://localhost:3000/persons/init to initialize the database"
echo "4. Test the complex query at POST http://localhost:3000/persons/query"

