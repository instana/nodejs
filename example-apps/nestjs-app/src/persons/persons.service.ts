import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PersonsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.person.findMany();
  }

  async findWithComplexQuery(user: { currentTeam?: { teamId: string } }, excludedIds: number[] = []) {
    // Complex query similar to your example with relations, filters, and includes
    return this.prisma.person.findMany({
      where: {
        id: { notIn: excludedIds },
        OR: [
          { teamId: user.currentTeam?.teamId ? parseInt(user.currentTeam.teamId) : undefined },
          { isSystemUser: true }
        ],
      },
      include: {
        profile: {
          select: {
            bio: true,
            avatarUrl: true,
          },
        },
        team: true,
        tags: true,
        roles: true,
      },
    });
  }

  async create(data: { name: string; email?: string; teamId?: number; isSystemUser?: boolean }) {
    return this.prisma.person.create({
      data,
    });
  }

  async initDatabase() {
    try {
      // Clean up existing data
      await this.prisma.person.deleteMany({});
      await this.prisma.team.deleteMany({});
      await this.prisma.tag.deleteMany({});
      await this.prisma.role.deleteMany({});
      
      // Create a team
      const team = await this.prisma.team.create({
        data: {
          teamId: 'team-001',
          name: 'Engineering Team',
        },
      });

      // Create tags
      const tag1 = await this.prisma.tag.create({
        data: { name: 'developer' },
      });
      
      const tag2 = await this.prisma.tag.create({
        data: { name: 'senior' },
      });

      // Create roles
      const role1 = await this.prisma.role.create({
        data: { name: 'admin' },
      });
      
      const role2 = await this.prisma.role.create({
        data: { name: 'user' },
      });
      
      // Create persons with relations
      const person1 = await this.prisma.person.create({
        data: {
          name: 'Brainy Smurf',
          email: 'brainy@smurf.org',
          teamId: team.id,
          isSystemUser: false,
          profile: {
            create: {
              bio: 'The smartest smurf in the village',
              avatarUrl: 'https://example.com/brainy.png',
            },
          },
          tags: {
            connect: [{ id: tag1.id }, { id: tag2.id }],
          },
          roles: {
            connect: [{ id: role1.id }],
          },
        },
      });

      const person2 = await this.prisma.person.create({
        data: {
          name: 'System Admin',
          email: 'admin@system.org',
          isSystemUser: true,
          profile: {
            create: {
              bio: 'System administrator',
              avatarUrl: 'https://example.com/admin.png',
            },
          },
          roles: {
            connect: [{ id: role1.id }, { id: role2.id }],
          },
        },
      });
      
      return {
        message: 'Database initialized successfully',
        data: {
          team,
          persons: [person1, person2],
          tags: [tag1, tag2],
          roles: [role1, role2],
        },
      };
    } catch (error) {
      throw new Error(`Failed to initialize database: ${error.message}`);
    }
  }
}

// Made with Bob
