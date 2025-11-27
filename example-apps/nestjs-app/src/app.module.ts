import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PersonsModule } from './persons/persons.module';

@Module({
  imports: [PersonsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
