import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ToolsService } from '../tools/tools.service';
import { RagSource } from '../rag/rag.service'; // <-- add this

type Role = 'user' | 'assistant' | 'system';

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
    }): Promise<{ answer: string; sources: RagSource[] }> {
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

        // 1) First call
        const first = await this.openai.chat.completions.create({
            model: this.model,
            messages: baseMessages,
            tools,
            tool_choice: 'auto',
        });

        const firstChoice = first.choices[0];
        const toolCalls = firstChoice.message.tool_calls;

        // If no tools used, just return the answer
        if (!toolCalls || toolCalls.length === 0) {
            return {
                answer: firstChoice.message.content ?? '',
                sources: [],
            };
        }

        // 2) Execute requested tools
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

            // Try to decode the special JSON format from rag_query
            try {
                const maybeJson = JSON.parse(rawResult);

                if (maybeJson && maybeJson.__rag_type === 'rag_query_result') {
                    if (Array.isArray(maybeJson.sources)) {
                        aggregatedSources = aggregatedSources.concat(maybeJson.sources);
                    }
                    if (typeof maybeJson.content === 'string') {
                        contentForLLM = maybeJson.content;
                    }
                }
            } catch {
                // rawResult was not JSON; leave contentForLLM as-is
            }

            toolMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: contentForLLM,
            });
        }

        // 3) Second call with tool results
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
}