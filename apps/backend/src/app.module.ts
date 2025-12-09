import { Module } from '@nestjs/common';
import { ChatModule } from './modules/chat/chat.module';
import { RagModule } from './modules/rag/rag.module';

@Module({
  imports: [RagModule, ChatModule],
})
export class AppModule {}
