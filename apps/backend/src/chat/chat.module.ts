import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { RagService } from './rag/rag.service';

@Module({
  providers: [ChatService, RagService],
  controllers: [ChatController],
})
export class ChatModule {}