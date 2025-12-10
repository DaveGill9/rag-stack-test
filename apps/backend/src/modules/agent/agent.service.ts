import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ToolsService } from '../tools/tools.service';
import type { ChatCompletionMessageToolCall } from "openai/resources/index.js";

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
  }): Promise<{ answer: string }> {
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

    // First call
    const first = await this.openai.chat.completions.create({
      model: this.model,
      messages: baseMessages,
      tools,
      tool_choice: 'auto',
    });

    const firstChoice = first.choices[0];
    const toolCalls = firstChoice.message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      return { answer: firstChoice.message.content ?? '' };
    }

    // Execute requested tool
    const toolMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
      
        const toolName = toolCall.function.name;
        const rawArgs = toolCall.function.arguments ?? "{}";

      let parsedArgs: any;
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        parsedArgs = {};
      }

      const resultText = await this.toolsService.executeTool(toolName, parsedArgs);

      toolMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultText,
      });
    }

    // 3) Second call
    const second = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        ...baseMessages,
        firstChoice.message,
        ...toolMessages,
      ],
    });

    const finalChoice = second.choices[0];
    return { answer: finalChoice.message.content ?? '' };
  }
}