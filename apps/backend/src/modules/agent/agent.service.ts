import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ToolsService } from '../tools/tools.service';
import { RagSource } from '../rag/rag.service';
import {
    createSession,
    getSession,
    getRecentTurns,
    upsertSessionTurn,
    type Session,
} from '../chat/session-store';

type Role = 'user' | 'assistant' | 'system';

type AgentStreamEvent =
    | { type: 'meta'; sources: RagSource[] }
    | { type: 'token'; content: string }
    | { type: 'done' };

export type AgentTurn = {
    role: Role;
    content: string;
};

@Injectable()
export class AgentService {
    private readonly openai: OpenAI;
    private readonly model: string;

    constructor(private readonly toolsService: ToolsService) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set');
        }

        this.openai = new OpenAI({ apiKey });
        this.model = process.env.LLM_MODEL || 'gpt-4.1-mini';
    }

    async runAgent(args: {
        message: string;
        history?: AgentTurn[];
    }): Promise<{ answer: string; sources: any[] }> {
        const { message, history = [] } = args;

        const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content:
                    'You are an assistant with access to function tools.\n' +
                    '- Use `rag_query` to look up information in the local knowledge base (PDFs, documents, internal content, lab sheets, etc).\n' +
                    '- Use `web_search` ONLY for up-to-date or web-based information (news, weather, very recent events, things not in the local docs).\n' +
                    '- Prefer `rag_query` when the user asks about known documents or material that could plausibly be in the indexed knowledge base.\n' +
                    '- Do NOT guess when you can use a tool; call the tool, inspect the results, then answer.\n',
            },
            ...history.map((t) => ({
                role: t.role,
                content: t.content,
            })),
            { role: 'user', content: message },
        ];

        const tools = this.toolsService.getToolDefinitions();

        const first = await this.openai.chat.completions.create({
            model: this.model,
            messages: baseMessages,
            tools,
            tool_choice: 'auto',
        });

        const firstChoice = first.choices[0];
        const toolCalls = firstChoice.message.tool_calls;

        if (!toolCalls || toolCalls.length === 0) {
            return {
                answer: firstChoice.message.content ?? '',
                sources: [],
            };
        }

        const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        let aggregatedSources: RagSource[] = [];

        for (const toolCall of toolCalls) {
            if (toolCall.type !== 'function') continue;

            const toolName = toolCall.function.name;
            const rawArgs = toolCall.function.arguments ?? '{}';

            let parsedArgs: any;
            try {
                parsedArgs = JSON.parse(rawArgs);
            } catch {
                parsedArgs = {};
            }

            const rawResult = await this.toolsService.executeTool(
                toolName,
                parsedArgs,
            );

            let contentForLLM = rawResult;

            try {
                const maybeJson = JSON.parse(rawResult);

                if (
                    maybeJson &&
                    (maybeJson.__rag_type === 'rag_query_result' ||
                        maybeJson.__rag_type === 'web_query_result')
                ) {
                    if (Array.isArray(maybeJson.sources)) {
                        aggregatedSources = aggregatedSources.concat(maybeJson.sources);
                    }
                    if (typeof maybeJson.content === 'string') {
                        contentForLLM = maybeJson.content;
                    }
                }
            } catch { }

            toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: contentForLLM,
            });
        }

        const second = await this.openai.chat.completions.create({
            model: this.model,
            messages: [...baseMessages, firstChoice.message, ...toolMessages],
        });

        const finalChoice = second.choices[0];

        return {
            answer: finalChoice.message.content ?? '',
            sources: aggregatedSources,
        };
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
            role: t.role as Role,
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
        const { message, history = [] } = args;

        const baseMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content:
                    'You are an assistant with access to function tools.\n' +
                    '- Use `rag_query` to look up information in the local knowledge base (PDFs, documents, internal content, lab sheets, etc).\n' +
                    '- Use `web_search` ONLY for up-to-date or web-based information (news, weather, very recent events, things not in the local docs).\n' +
                    '- Prefer `rag_query` when the user asks about known documents or material that could plausibly be in the indexed knowledge base.\n' +
                    '- Do NOT guess when you can use a tool; call the tool, inspect the results, then answer.\n',
            },
            ...history.map((t) => ({
                role: t.role,
                content: t.content,
            })),
            { role: 'user', content: message },
        ];

        const tools = this.toolsService.getToolDefinitions();
        const first = await this.openai.chat.completions.create({
            model: this.model,
            messages: baseMessages,
            tools,
            tool_choice: 'auto',
        });

        const firstChoice = first.choices[0];
        const toolCalls = firstChoice.message.tool_calls;

        const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
        let aggregatedSources: RagSource[] = [];

        if (toolCalls && toolCalls.length > 0) {
            for (const toolCall of toolCalls) {
                if (toolCall.type !== 'function') continue;

                const toolName = toolCall.function.name;
                const rawArgs = toolCall.function.arguments ?? '{}';

                let parsedArgs: any;
                try {
                    parsedArgs = JSON.parse(rawArgs);
                } catch {
                    parsedArgs = {};
                }

                const rawResult = await this.toolsService.executeTool(toolName, parsedArgs);

                let contentForLLM = rawResult;

                try {
                    const maybeJson = JSON.parse(rawResult);

                    if (
                        maybeJson &&
                        (maybeJson.__rag_type === 'rag_query_result' ||
                            maybeJson.__rag_type === 'web_query_result')
                    ) {
                        if (Array.isArray(maybeJson.sources)) {
                            aggregatedSources = aggregatedSources.concat(maybeJson.sources);
                        }
                        if (typeof maybeJson.content === 'string') {
                            contentForLLM = maybeJson.content;
                        }
                    }
                } catch { }

                toolMessages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: contentForLLM,
                });
            }
        }

        yield {
            type: 'meta',
            sources: aggregatedSources,
        };

        const stream = await this.openai.chat.completions.create({
            model: this.model,
            messages: [...baseMessages, firstChoice.message, ...toolMessages],
            stream: true,
        });

        for await (const chunk of stream) {
            const delta = chunk.choices?.[0]?.delta?.content;
            if (!delta) continue;

            yield {
                type: 'token',
                content: delta,
            };
        }

        // 4) All done
        yield {
            type: 'done',
        };
    }

}