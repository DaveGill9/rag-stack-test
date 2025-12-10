import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import {
  createSession,
  getSession,
  getRecentTurns,
  upsertSessionTurn,
  Session,
} from './session-store';
import { RagService } from '../rag/rag.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly rag: RagService) { }

  async generateAnswer(message: string, sessionId?: string | null) {
    if (!message || !message.trim()) {
      throw new Error('Message is required');
    }

    // Load or create session
    let session: Session | null = null;

    if (sessionId) {
      session = await getSession(sessionId);
    }

    if (!session) {
      session = await createSession();
    }

    const recentTurns = getRecentTurns(session, 6);

    // RAG service asks OpenAI
    const { answer, sources } = await this.rag.generateAnswer({
      message,
      recentTurns,
    });

    // Persist user & assistant turns
    session = await upsertSessionTurn(session, {
      role: 'user',
      content: message,
    });

    await upsertSessionTurn(session, {
      role: 'assistant',
      content: answer,
      sources,
    });

    // Return all data
    return {
      sessionId: session.id,
      answer,
      sources,
    };
  }

  async generateAnswerStream(
    message: string,
    sessionId: string | undefined,
    res: Response,
  ) {
    if (!message || !message.trim()) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: 'Message is required',
        })}\n\n`,
      );
      res.end();
      return;
    }

    // Create Session
    let session: Session | null = null;

    if (sessionId) {
      session = await getSession(sessionId);
    }

    if (!session) {
      session = await createSession();
    }

    const recentTurns = getRecentTurns(session, 6);

    let fullAnswer = '';
    let lastSources: any[] = [];

    try {
      const stream = this.rag.generateAnswerStream({
        message,
        recentTurns,
      });

      // Pump SSE events for frontend
      for await (const event of stream) {
        if (event.type === 'meta') {
          lastSources = event.sources ?? [];

          res.write(
            `data: ${JSON.stringify({
              type: 'meta',
              sessionId: session.id,
              sources: lastSources,
            })}\n\n`,
          );
        } else if (event.type === 'token') {
          fullAnswer += event.content;

          res.write(
            `data: ${JSON.stringify({
              type: 'token',
              content: Buffer.from(event.content, 'utf8').toString('base64'),
              encoding: 'base64',
            })}\n\n`
          );

        } else if (event.type === 'done') {
          res.write(
            `data: ${JSON.stringify({
              type: 'done',
            })}\n\n`,
          );
        }
      }
    } catch (err) {
      this.logger.error('Error while streaming answer', err as any);

      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: 'Failed to generate answer',
        })}\n\n`,
      );
    } finally {
      res.end();
    }

    // Persist conversation
    try {
      session = await upsertSessionTurn(session, {
        role: 'user',
        content: message,
      });

      await upsertSessionTurn(session, {
        role: 'assistant',
        content: fullAnswer,
        sources: lastSources,
      });
    } catch (err) {
      this.logger.error('Failed to persist session turns after stream', err as any);
    }
  }
}
