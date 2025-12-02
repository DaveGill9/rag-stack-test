import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';

const PINECONE_INDEX = process.env.PINECONE_INDEX || 'rag-demo';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'v1';

type RetrievedSource = {
  id: string;
  score?: number;
  metadata?: any;
};

@Injectable()
export class ChatService {
  private openai: OpenAI;
  private pinecone: Pinecone;

  constructor() {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const pineconeKey = process.env.PINECONE_API_KEY;
    if (!pineconeKey) {
      throw new Error('PINECONE_API_KEY is not set');
    }

    this.openai = new OpenAI({ apiKey: openaiKey });
    this.pinecone = new Pinecone({ apiKey: pineconeKey });
  }

  async generateAnswer(message: string, sessionId?: string) {
    if (!message || !message.trim()) {
      throw new Error('Message is required');
    }

    const embeddingRes = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: message,
    });

    const queryVector = embeddingRes.data[0].embedding;

    const index = this.pinecone.index(PINECONE_INDEX);
    const ns = index.namespace(PINECONE_NAMESPACE);

    const queryRes = await ns.query({
      topK: 5,
      vector: queryVector,
      includeMetadata: true,
    });

    const matches = queryRes.matches || [];
    const sources: RetrievedSource[] = matches.map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata,
    }));

    const contextBlocks = matches.map((m, i) => {
      const meta: any = m.metadata || {};
      const title = meta.source_path || meta.doc_id || 'Unknown document';
      const pageFrom =
        meta.page_from ?? (meta.page_from === 0 ? 0 : undefined);
      const pageTo = meta.page_to ?? (meta.page_to === 0 ? 0 : undefined);
      const pageStr =
        pageFrom !== undefined && pageTo !== undefined
          ? ` (pages ${pageFrom}-${pageTo})`
          : '';

      const header = `Source ${i + 1}: ${title}${pageStr}`;
      const content = meta.text || '[no text stored in metadata]';

      return `${header}\n${content}`;
    });

    const context = contextBlocks.join('\n\n---\n\n');

    const systemPrompt = `
      You are a helpful assistant that answers questions using ONLY the provided context.
      If the context does not contain the answer, say you don't know.
      Always indicate which source(s) you used in your answer.
      `.trim();

    const userPrompt = `
      User question:
      ${message}

      Context:
      ${context}
      `.trim();

    const chatRes = await this.openai.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    });

    const answer = chatRes.choices[0]?.message?.content ?? '';

    return {
      answer,
      sources,
      sessionId: sessionId || null,
    };
  }
}