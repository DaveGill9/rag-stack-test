import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
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

  @Post('stream')
  async chatStream(
    @Body() body: ChatRequestDto,
    @Res() res: Response
  ) {
    const { message, sessionId } = body;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await this.chatService.generateAnswerStream(message, sessionId, res);
  }
}