import { Injectable } from '@nestjs/common';
import { RagSource } from '../rag/rag.service';
import {
    AgentTurn,
    AgentStreamEvent,
    OpenAiResponsesService,
} from '../openai/openai-responses.service';
import {
    createSession,
    getSession,
    getRecentTurns,
    upsertSessionTurn,
    type Session,
} from '../chat/session-store';

export type { AgentTurn };

@Injectable()
export class AgentService {
    constructor(private readonly openAiResponses: OpenAiResponsesService) {}

    async runAgent(args: {
        message: string;
        history?: AgentTurn[];
    }): Promise<{ answer: string; sources: RagSource[] }> {
        return this.openAiResponses.generateResponse(args);
    }

    async runAgentWithSession(args: {
        message: string;
        sessionId?: string | null;
    }): Promise<{ sessionId: string; answer: string; sources: any[] }> {
        const { message, sessionId } = args;

        if (!message || !message.trim()) {
            throw new Error('Message is required');
        }

        let session: Session | null = null;

        if (sessionId) {
            session = await getSession(sessionId);
        }

        if (!session) {
            session = await createSession();
        }

        const recentTurns = getRecentTurns(session, 6);

        const history = recentTurns.map((t) => ({
            role: t.role as AgentTurn['role'],
            content: t.content,
        }));

        const { answer, sources } = await this.runAgent({
            message,
            history,
        });

        session = await upsertSessionTurn(session, {
            role: 'user',
            content: message,
        });

        await upsertSessionTurn(session, {
            role: 'assistant',
            content: answer,
            sources,
        });

        return {
            sessionId: session.id,
            answer,
            sources,
        };
    }

    async *runAgentStream(args: {
        message: string;
        history?: AgentTurn[];
    }): AsyncGenerator<AgentStreamEvent> {
        yield* this.openAiResponses.generateResponseStream(args);
    }

}