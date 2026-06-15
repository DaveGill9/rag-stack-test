import { Module } from '@nestjs/common';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { OpenAiModule } from '../openai/openai.module';

@Module({
    imports: [OpenAiModule],
    providers: [AgentService],
    controllers: [AgentController],
})
export class AgentModule { }
