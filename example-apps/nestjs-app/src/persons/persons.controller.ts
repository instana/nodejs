import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { PersonsService } from './persons.service';

@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  async findAll() {
    return this.personsService.findAll();
  }

  @Post('query')
  async findWithComplexQuery(
    @Body() body: {
      user: { currentTeam?: { teamId: string } },
      excludedIds?: number[]
    }
  ) {
    return this.personsService.findWithComplexQuery(
      body.user,
      body.excludedIds || []
    );
  }

  @Post()
  async create(@Body() data: {
    name: string;
    email?: string;
    teamId?: number;
    isSystemUser?: boolean
  }) {
    return this.personsService.create(data);
  }

  @Get('init')
  async initDatabase() {
    return this.personsService.initDatabase();
  }
}

// Made with Bob
