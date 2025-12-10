import OpenAI from 'openai';
import { Tool } from './tool.types';

const WEB_MODEL = process.env.WEB_MODEL || 'gpt-4.1';

type WebSource = {
    title: string | null;
    url: string | null;
    snippet: string | null;
};

export function createWebSearchTool(client: OpenAI): Tool<{ query: string }> {
    return {
        definition: {
            name: 'web_search',
            description:
                'Search the web for up-to-date information. Returns a summary plus structured sources.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'The web search query. Include relevant context from the conversation.',
                    },
                },
                required: ['query'],
            },
        },

        async execute({ query }) {
            console.log('[web_search] query:', query);

            const resp = await client.responses.create({
                model: WEB_MODEL,
                tools: [{ type: 'web_search' }],
                input: query,
                include: ['web_search_call.action.sources'],
            });

            const raw: any = resp;

            let contentText = raw.output_text?.trim() ?? '';

            if (!contentText && Array.isArray(raw.output) && raw.output.length > 0) {
                const first = raw.output[0];
                if (first?.content && Array.isArray(first.content)) {
                    const textPart =
                        first.content.find(
                            (c: any) => c.type === 'output_text' || c.type === 'text',
                        ) ?? null;

                    if (textPart?.text) {
                        contentText = String(textPart.text).trim();
                    }
                }
            }

            if (!contentText) {
                contentText = 'Web search did not return a usable answer.';
            }

            const sources: WebSource[] = [];

            try {
                const outputs = raw.output ?? [];
                const webCall = outputs.find((o: any) => o.type === 'web_search_call');

                const actionSources = webCall?.action?.sources;
                if (Array.isArray(actionSources)) {
                    for (const s of actionSources) {
                        sources.push({
                            title: s.title ?? null,
                            url: s.url ?? null,
                            snippet:
                                s.snippet ??
                                s.description ??
                                s.excerpt ??
                                s.passage ??
                                null,
                        });
                    }
                }
            } catch (err) {
                console.warn('[web_search] error parsing sources:', err);
            }

            console.log('[web_search] sources length:', sources.length);
            console.log('[web_search] first source:', sources[0]);

            return JSON.stringify({
                __rag_type: 'web_query_result',
                sources,
                content: contentText,
            });
        },
    };
}
