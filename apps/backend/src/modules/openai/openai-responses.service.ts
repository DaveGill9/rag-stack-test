import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ToolsService } from '../tools/tools.service';
import { RagSource } from '../rag/rag.service';

type Role = 'user' | 'assistant' | 'system';

export type AgentTurn = {
  role: Role;
  content: string;
};

export type AgentStreamEvent =
  | { type: 'meta'; sources: RagSource[] }
  | { type: 'token'; content: string }
  | { type: 'done' };

@Injectable()
export class OpenAiResponsesService {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly toolsService: ToolsService) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    this.client = new OpenAI({ apiKey });
    this.model = process.env.LLM_MODEL || 'gpt-4.1-mini';
  }

  async generateResponse(args: {
    message: string;
    history?: AgentTurn[];
  }): Promise<{ answer: string; sources: RagSource[] }> {
    const { message, history = [] } = args;

    const input = this.buildInput(message, history);
    const tools = this.buildResponseTools();

    const first = await this.client.responses.create({
      model: this.model,
      input,
      tools,
      tool_choice: 'auto',
    });

    const toolCalls = first.output.filter((item) => item.type === 'function_call');
    const aggregatedSources: RagSource[] = [];

    if (toolCalls.length > 0) {
      const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];

      for (const call of toolCalls) {
        const toolName = call.name;
        const rawArgs = call.arguments ?? '{}';

        let parsedArgs: any;
        try {
          parsedArgs = JSON.parse(rawArgs);
        } catch {
          parsedArgs = {};
        }

        const rawResult = await this.toolsService.executeTool(toolName, parsedArgs);
        const { contentForModel, sources } = this.parseToolResult(rawResult);
        if (sources.length > 0) {
          aggregatedSources.push(...sources);
        }

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: contentForModel,
        });
      }

      const second = await this.client.responses.create({
        model: this.model,
        previous_response_id: first.id,
        input: toolOutputs,
      });

      return {
        answer: second.output_text?.trim() ?? '',
        sources: aggregatedSources,
      };
    }

    return {
      answer: first.output_text?.trim() ?? '',
      sources: [],
    };
  }

  async *generateResponseStream(args: {
    message: string;
    history?: AgentTurn[];
  }): AsyncGenerator<AgentStreamEvent> {
    const { answer, sources } = await this.generateResponse(args);
    yield { type: 'meta', sources };

    // We keep the SSE contract as token events, even though Responses call is non-streaming here.
    for (const token of this.chunkForSse(answer)) {
      yield { type: 'token', content: token };
    }

    yield { type: 'done' };
  }

  private buildInput(message: string, history: AgentTurn[]): OpenAI.Responses.ResponseInput {
    const instruction = [
      'You are an assistant with access to function tools.',
      '',
      'ROUTING RULES:',
      '- First, decide whether the user question is about LOCAL DOCUMENTS or GENERAL/WORLD knowledge.',
      '- Questions about courses, lab sheets, PDFs, internal notes, assignments, or anything likely in indexed knowledge -> use rag_query.',
      '- Questions about news, sports, world events, geography, pop culture, or generic facts -> do not call rag_query.',
      '- Use web_search for current or recent information that is not in local docs.',
      '',
      'SOURCES:',
      '- Only treat RAG results as sources when they actually support the answer.',
      '- Do not cite unrelated RAG chunks.',
      '',
      'When a tool can help, call the tool instead of guessing.',
    ].join('\n');

    const items: OpenAI.Responses.ResponseInput = [
      {
        role: 'system',
        content: instruction,
      },
      ...history.map((t) => ({
        role: t.role as 'user' | 'assistant' | 'system',
        content: t.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    return items;
  }

  private buildResponseTools(): OpenAI.Responses.Tool[] {
    return this.toolsService.getToolDefinitions().map((tool) => ({
      type: 'function' as const,
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
      strict: false,
    }));
  }

  private parseToolResult(rawResult: string): {
    contentForModel: string;
    sources: RagSource[];
  } {
    let contentForModel = rawResult;
    let sources: RagSource[] = [];

    try {
      const parsed = JSON.parse(rawResult);

      if (
        parsed &&
        (parsed.__rag_type === 'rag_query_result' ||
          parsed.__rag_type === 'web_query_result')
      ) {
        if (typeof parsed.content === 'string') {
          contentForModel = parsed.content;
        }
        if (Array.isArray(parsed.sources)) {
          sources = parsed.sources;
        }
      }
    } catch {
      // Ignore parse errors and pass raw string to model.
    }

    return { contentForModel, sources };
  }

  private chunkForSse(text: string): string[] {
    if (!text) return [];
    const chunks: string[] = [];
    const maxChunkSize = 80;

    for (let i = 0; i < text.length; i += maxChunkSize) {
      chunks.push(text.slice(i, i + maxChunkSize));
    }

    return chunks;
  }
}
