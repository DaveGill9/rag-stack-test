import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Pinecone } from '@pinecone-database/pinecone';
import crypto from 'crypto';
import {
  createSession,
  getSession,
  getRecentTurns,
  upsertSessionTurn,
  Session,
  Turn,
} from './session-store';

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
  private readonly logger = new Logger(ChatService.name);

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

    const requestId = crypto.randomUUID();
    this.logger.log(`[${requestId}] Incoming message: "${message}"`);

    let session: Session | null = getSession(sessionId);
    if (!session) {
      session = createSession();
      this.logger.log(
        `[${requestId}] Created new session ${session.id}`
      );
    }

    const t0 = Date.now();

    const embeddingRes = await this.openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: message,
    });

    const tEmbed = Date.now();
    this.logger.log(
      `[${requestId}] Embed latency: ${tEmbed - t0} ms`
    );

    const queryVector = embeddingRes.data[0].embedding;
    const index = this.pinecone.index(PINECONE_INDEX);
    const ns = index.namespace(PINECONE_NAMESPACE);

    const queryRes = await ns.query({
      topK: 5,
      vector: queryVector,
      includeMetadata: true,
    });

    const tPinecone = Date.now();
    this.logger.log(
      `[${requestId}] Pinecone latency: ${tPinecone - tEmbed} ms`
    );

    const matches = queryRes.matches || [];
    const sources = matches.map((m) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata,
    }));

    this.logger.log(
      `[${requestId}] Retrieved chunks: ${matches
        .map((m) => `${m.id} (${m.score?.toFixed(3)})`)
        .join(', ')}`
    );

    const bestScore = matches[0]?.score ?? 0;
    if (!matches.length || bestScore < 0.15) {
      const safeAnswer =
        "I’m not confident I can answer that from the loaded documents. " +
        "Try rephrasing the question or adding more relevant documents.";

      upsertSessionTurn(session, { role: 'user', content: message });
      upsertSessionTurn(session, {
        role: 'assistant',
        content: safeAnswer,
        sources: [],
      });

      return {
        answer: safeAnswer,
        sources: [],
        sessionId: session.id,
        requestId,
      };
    }

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

    const context = contextBlocks.join('\n\n---\n\n');


    const recentTurns = getRecentTurns(session, 6);
    const historyMessages = recentTurns.map((t): OpenAI.Chat.Completions.ChatCompletionMessageParam => ({
      role: t.role,
      content: t.content,
    }));

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

    const tLlm = Date.now();
    this.logger.log(
      `[${requestId}] LLM latency: ${tLlm - tPinecone} ms`
    );

    const answer = chatRes.choices[0]?.message?.content ?? '';

    upsertSessionTurn(session, {
      role: 'user',
      content: message,
    });
    const updatedSession = upsertSessionTurn(session, {
      role: 'assistant',
      content: answer,
      sources,
    });

    this.logger.log(
      `[${requestId}] Session ${updatedSession.id} now has ${updatedSession.turns.length} turns`
    );

    return {
      answer,
      sources,
      sessionId: updatedSession.id,
      requestId,
    };
  }
}