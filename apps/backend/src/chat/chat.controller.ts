import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';

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
    const result = await this.chatService.generateAnswer(message, sessionId);
    return result;
  }
}