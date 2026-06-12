import { Module } from '@nestjs/common';
import { CopilotKitController } from './copilotkit.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [],
  controllers: [HealthController, CopilotKitController],
  providers: [],
})
export class AppModule {}
