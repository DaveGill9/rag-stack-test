import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { getSession } from './session-store';
import { getSessionsCollection } from 'src/config/mongo';

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

  @Post('stream')
  async chatStream(@Body() body: ChatRequestDto, @Res() res: Response) {
    const { message, sessionId } = body;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    await this.chatService.generateAnswerStream(message, sessionId, res);
  }

  @Get('sessions')
  async listSessions() {
    const col = await getSessionsCollection();
    const list = await col.find({}, { projection: { turns: 1, id: 1 } }).toArray();
    return list.map((s) => ({
      id: s.id,
      title:  s.turns[0]?.content?.slice(0,40) || "New Chat",
    }));
  }
  
  @Get('session/:id')
  async getSessionHistory(@Param('id') id: string) {
    const session = await getSession(id);
    if (!session) {
      return { sessionId: id, turns: [] };
    }
    return {
      sessionId: session.id,
      turns: session.turns,
    };
  }
}
