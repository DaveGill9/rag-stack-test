import { Body, Controller, Post, Sse } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Observable } from 'rxjs';

class ChatRequestDto {
  message: string;
  sessionId?: string;
}

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(@Body() body: ChatRequestDto) {
    const { message, sessionId } = body;
    return this.chatService.generateAnswer(message, sessionId);
  }

  @Sse('stream')
  async stream(@Body() body: ChatRequestDto) {
    const { message, sessionId } = body;
    return this.chatService.generateAnswerStream(message, sessionId);
  }
}