import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { Tool } from './tool.types';
import { createWebSearchTool } from './web-search.tool';
import { RagService } from '../rag/rag.service';
import { createRagQueryTool } from './rag-query.tool';

@Injectable()
export class ToolsService {
    private readonly openai: OpenAI;
    private readonly tools: Tool[];

    constructor(private readonly ragService: RagService) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY is not set');
        }

        this.openai = new OpenAI({ apiKey });

        this.tools = [
            createWebSearchTool(this.openai),
            createRagQueryTool(this.ragService),
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