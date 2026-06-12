import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CopilotKitController } from './copilotkit.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [],
  controllers: [AppController, HealthController, CopilotKitController],
  providers: [],
})
export class AppModule {}
