import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { RagModule } from './modules/rag/rag.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AgentModule } from './modules/agent/agent.module';

@Module({
  imports: [
    RagModule,
    ChatModule,
    ToolsModule,
    AgentModule,
  ],
})
export class AppModule {}