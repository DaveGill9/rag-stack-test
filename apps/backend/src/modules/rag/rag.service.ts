import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';

const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4.1-mini';

const PINECONE_INDEX = process.env.PINECONE_INDEX || 'rag-demo';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'v1';

export type RagSource = {
  id: string;
  score?: number;
  metadata?: any;
};

export type RagAnswer = {
  answer: string;
  sources: RagSource[];
};

export type RagEvent =
  | { type: 'meta'; sources: RagSource[] }
  | { type: 'token'; content: string }
  | { type: 'done'; content: string };

@Injectable()
export class RagService {
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

  async generateAnswer(opts: {
    message: string;
    recentTurns: { role: 'user' | 'assistant'; content: string }[];
  }): Promise<RagAnswer> {
    const { message, recentTurns } = opts;

    if (!message || !message.trim()) {
      throw new Error('Message is required');
    }

    const retrievalQuery = this.buildRetrievalQuery(message, recentTurns);

    const embeddingRes = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: retrievalQuery,
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
    const sources: RagSource[] = matches.map((m) => ({
      id: m.id!,
      score: m.score,
      metadata: m.metadata,
    }));

    const bestScore = matches[0]?.score ?? 0;
    if (!matches.length || bestScore < 0.15) {
      const safeAnswer =
        "I’m not confident I can answer that from the loaded documents. " +
        'Try rephrasing the question or adding more relevant documents.';

      return { answer: safeAnswer, sources: [] };
    }

    const context = this.buildContextBlocks(matches);

    const historyMessages = this.formatHistory(recentTurns);

    const systemPrompt = `
      You are a helpful assistant that must answer using ONLY the provided context.
      If the context does not contain the answer, say you don't know.
      Always indicate which source(s) you used in your answer.
      Do NOT guess or fabricate facts. If unsure, say you are unsure.
    `.trim();

    const userPrompt = `
      User question:
      ${message}

      Context:
      ${context}
    `.trim();

    const chatRes = await this.openai.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.2,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userPrompt },
      ],
    });

    const answer = chatRes.choices[0]?.message?.content ?? '';

    return { answer, sources };
  }

  async *generateAnswerStream(opts: {
    message: string;
    recentTurns: { role: 'user' | 'assistant'; content: string }[];
  }): AsyncGenerator<RagEvent> {
    const { message, recentTurns } = opts;

    if (!message || !message.trim()) {
      const safe = 'Message is required';
      yield { type: 'meta', sources: [] };
      yield { type: 'token', content: safe };
      yield { type: 'done', content: safe };
      return;
    }

    const retrievalQuery = this.buildRetrievalQuery(message, recentTurns);
    const embeddingRes = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: retrievalQuery,
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
    const sources: RagSource[] = matches.map((m) => ({
      id: m.id!,
      score: m.score,
      metadata: m.metadata,
    }));

    const bestScore = matches[0]?.score ?? 0;
    if (!matches.length || bestScore < 0.15) {
      const safeAnswer =
        "I’m not confident I can answer that from the loaded documents.";

      yield { type: 'meta', sources: [] };
      yield { type: 'token', content: safeAnswer };
      yield { type: 'done', content: safeAnswer };
      return;
    }

    const context = this.buildContextBlocks(matches);
    const historyMessages = this.formatHistory(recentTurns);

    const systemPrompt = `
      You are a helpful assistant that must answer using ONLY the provided context.
      If the context does not contain the answer, say you don't know.
      Always indicate which source(s) you used in your answer.
    `.trim();

    const userPrompt = `
      User question:
      ${message}

      Context:
      ${context}
    `.trim();

    yield { type: 'meta', sources };

    const stream = await this.openai.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0.2,
      stream: true,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: userPrompt },
      ],
    });

    let fullAnswer = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (!delta) continue;
      fullAnswer += delta;
      yield { type: 'token', content: delta };
    }

    yield { type: 'done', content: fullAnswer };
  }

  async retrieveContexts(opts: { query: string; topK?: number }): Promise<RagSource[]> {
    const { query, topK = 5 } = opts;

    const embeddingRes = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
    });

    const vector = embeddingRes.data[0].embedding;

    const index = this.pinecone.index(PINECONE_INDEX);
    const ns = index.namespace(PINECONE_NAMESPACE);

    const queryRes = await ns.query({
      topK,
      vector,
      includeMetadata: true,
    });

    const matches = queryRes.matches ?? [];

    const sources: RagSource[] = matches.map((m) => ({
      id: m.id!,
      score: m.score,
      metadata: m.metadata,
    }));

    return sources;
  }

  private buildRetrievalQuery(
    message: string,
    recentTurns: { role: 'user' | 'assistant'; content: string }[],
  ): string {

    const lastTurns = recentTurns.slice(-6);
    const historyText = lastTurns
      .map((t) =>
        t.role === 'user'
          ? `User: ${t.content}`
          : `Assistant: ${t.content}`
      )
      .join('\n');

    return `
      Conversation history:
      ${historyText}
      
      Current question:
      ${message}
      `.trim();
  }

  private buildContextBlocks(matches: any[]): string {
    const contextBlocks = matches.map((m, i) => {
      const meta: any = m.metadata || {};
      const title = meta.source_path || meta.doc_id || 'Unknown document';
      const pageFrom =
        meta.page_from ?? (meta.page_from === 0 ? 0 : undefined);
      const pageTo =
        meta.page_to ?? (meta.page_to === 0 ? 0 : undefined);
      const pageStr =
        pageFrom !== undefined && pageTo !== undefined
          ? ` (pages ${pageFrom}-${pageTo})`
          : '';

      const header = `Source ${i + 1}: ${title}${pageStr}`;
      const content = meta.text || '[no text stored in metadata]';

      return `${header}\n${content}`;
    });

    return contextBlocks.join('\n\n---\n\n');
  }

  private formatHistory(
    turns: { role: 'user' | 'assistant'; content: string }[],
  ) {
    return turns.map((t) => ({
      role: t.role,
      content: t.content,
    }));
  }
}
