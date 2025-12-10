import OpenAI from 'openai';
import { Tool } from './tool.types';

const WEB_MODEL = process.env.WEB_MODEL || 'gpt-4.1';

export function createWebSearchTool(client: OpenAI): Tool<{ query: string }> {
    return {
        definition: {
            name: 'web_search',
            description:
                'Search the web for up-to-date information. Use this for current events, recent changes, or facts not covered by local documents.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'The search query. Include any important context from the conversation.',
                    },
                },
                required: ['query'],
            },
        },

        async execute({ query }) {
            const resp = await client.responses.create({
                model: WEB_MODEL,
                tools: [{ type: 'web_search_preview' }],
                input: query,
            });

            const anyResp: any = resp;

            if (typeof anyResp.output_text === 'string' && anyResp.output_text.trim()) {
                return anyResp.output_text.trim();
            }

            const first = anyResp.output?.[0];
            if (first?.content && Array.isArray(first.content)) {
                const textPart =
                    first.content.find(
                        (c: any) => c.type === 'output_text' || c.type === 'text',
                    ) ?? null;

                if (textPart?.text) {
                    return String(textPart.text).trim();
                }
            }

            return "I tried to use web search but couldn't get a usable answer.";
        },
    };
}