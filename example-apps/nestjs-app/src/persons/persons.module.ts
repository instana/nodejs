import { Module } from '@nestjs/common';
import { PersonsController } from './persons.controller';
import { PersonsService } from './persons.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [PersonsController],
  providers: [PersonsService, PrismaService],
})
export class PersonsModule {}

// Made with Bob
