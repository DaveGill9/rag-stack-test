import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { RagModule } from './modules/rag/rag.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AgentModule } from './modules/agent/agent.module';
import { OpenAiModule } from './modules/openai/openai.module';

@Module({
  imports: [
    RagModule,
    ChatModule,
    ToolsModule,
    OpenAiModule,
    AgentModule,
  ],
})
export class AppModule { }