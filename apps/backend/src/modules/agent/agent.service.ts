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
          'You are an assistant that can use tools such as web_search when needed. ' +
          'Use tools for fresh / web-based information or when you lack enough knowledge.',
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