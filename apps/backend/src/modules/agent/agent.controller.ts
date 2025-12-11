import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AgentService, AgentTurn } from './agent.service';

import {
    createSession,
    getSession,
    getRecentTurns,
    upsertSessionTurn,
    type Session,
} from '../chat/session-store';

@Controller('agent')
export class AgentController {
    constructor(private readonly agentService: AgentService) { }

    @Post('chat')
    async chat(
        @Body()
        body: {
            message: string;
            sessionId?: string;
            history?: AgentTurn[];
        },
    ) {
        const { message, sessionId } = body;

        const { sessionId: finalSessionId, answer, sources } =
            await this.agentService.runAgentWithSession({ message, sessionId });

        return { sessionId: finalSessionId, answer, sources };
    }

    @Post('chat/stream')
    async chatStream(
        @Body()
        body: {
            message: string;
            sessionId?: string;
        },
        @Res() res: Response,
    ) {
        const { message, sessionId } = body;

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

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

        let session: Session | null = null;

        if (sessionId) {
            session = await getSession(sessionId);
        }

        if (!session) {
            session = await createSession();
        }

        const recentTurns = getRecentTurns(session, 6);

        const history: AgentTurn[] = recentTurns.map((t) => ({
            role: t.role as AgentTurn['role'],
            content: t.content,
        }));

        let fullAnswer = '';
        let lastSources: any[] = [];

        try {
            const stream = this.agentService.runAgentStream({
                message,
                history,
            });

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
                    const chunk = event.content ?? '';
                    fullAnswer += chunk;

                    const b64 = Buffer.from(chunk, 'utf8').toString('base64');

                    res.write(
                        `data: ${JSON.stringify({
                            type: 'token',
                            content: b64,
                            encoding: 'base64',
                        })}\n\n`,
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
            console.error('Error while streaming agent answer', err as any);
            res.write(
                `data: ${JSON.stringify({
                    type: 'error',
                    error: 'Failed to generate answer',
                })}\n\n`,
            );
        } finally {
            res.end();
        }

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
            console.error('Failed to persist agent session turns after stream', err as any);
        }
    }


}
