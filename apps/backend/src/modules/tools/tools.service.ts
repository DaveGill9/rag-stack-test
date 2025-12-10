import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Tool } from './tool.types';
import { createWebSearchTool } from './web-search.tool';

@Injectable()
export class ToolsService {
  private readonly openai: OpenAI;
  private readonly tools: Tool[];

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    this.openai = new OpenAI({ apiKey });

    // Register tools here
    this.tools = [
      createWebSearchTool(this.openai),
    ];
  }

  getToolDefinitions() {
    return this.tools.map((tool) => ({
      type: 'function' as const,
      function: tool.definition,
    }));
  }

  async executeTool(name: string, args: any): Promise<string> {
    const tool = this.tools.find((t) => t.definition.name === name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(args);
  }
}