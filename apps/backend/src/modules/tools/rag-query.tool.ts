import { RagService, RagSource } from '../rag/rag.service';
import { Tool } from './tool.types';

function formatSourceForLLM(source: RagSource, index: number): string {
    const meta = source.metadata || {};
    const title = meta.title || meta.filename || source.id;
    const page = meta.page ?? meta.pages ?? undefined;
    const score = source.score?.toFixed(3);

    const headerParts = [
        `Result ${index + 1}`,
        `ID: ${source.id}`,
        title ? `Title: ${title}` : null,
        page !== undefined ? `Page(s): ${page}` : null,
        score ? `Score: ${score}` : null,
    ].filter(Boolean);

    const snippet =
        meta.text ||
        meta.content ||
        meta.chunk ||
        '[No text snippet available in metadata]';

    return `${headerParts.join(' | ')}\n\n${snippet}\n`;
}

export function createRagQueryTool(
    ragService: RagService,
): Tool<{ query: string }> {
    return {
        definition: {
            name: 'rag_query',
            description:
                'Retrieve relevant passages from the local knowledge base (indexed in Pinecone). ' +
                'Use this instead of web_search for questions about documents, PDFs, or internal knowledge.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description:
                            'The semantic search query. Include as much context from the user question as needed.',
                    },
                },
                required: ['query'],
            },
        },

        async execute({ query }) {
            const sources = await ragService.retrieveContexts({ query, topK: 5 });

            if (!sources.length) {
                return JSON.stringify({
                    __rag_type: 'rag_query_result',
                    sources: [],
                    content: `No relevant RAG results found for query: "${query}".`,
                });
            }

            const formatted = sources
                .map((s, i) => formatSourceForLLM(s, i))
                .join('\n-------------------------\n\n');

            const content =
                `RAG query results for: "${query}"\n\n` +
                formatted +
                `\n\nGuidance for using these results:\n` +
                '- Prefer these passages when they clearly relate to the user’s question.\n' +
                '- If they seem unrelated or only weakly relevant, you may ignore them and answer from your general knowledge instead.\n' +
                '- Only cite these results as "Sources" if they actually support or inform your answer.\n';

            return JSON.stringify({
                __rag_type: 'rag_query_result',
                sources,
                content,
            });
        },
    };
}