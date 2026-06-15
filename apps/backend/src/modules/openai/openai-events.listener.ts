import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { OpenAiEventsService } from './openai-events.service';

@Injectable()
export class OpenAiEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpenAiEventsListener.name);
  private readonly disposers: Array<() => void> = [];

  constructor(
    private readonly openAiEvents: OpenAiEventsService,
    private readonly toolsService: ToolsService,
  ) {}

  onModuleInit(): void {
    const disposeReasoning = this.openAiEvents.onReasoning((event) => {
      this.logger.debug(
        `Reasoning update (response=${event.responseId}): ${event.summary}`,
      );
    });

    const disposeToolRequested = this.openAiEvents.onToolCallRequested(async (event) => {
      this.logger.log(`Tool requested: ${event.toolName} (call=${event.callId})`);

      try {
        const output = await this.toolsService.executeTool(
          event.toolName,
          event.parsedArguments,
        );
        this.openAiEvents.emitToolCallCompleted({ callId: event.callId, output });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Tool failed: ${event.toolName} (call=${event.callId}) - ${message}`,
        );
        this.openAiEvents.emitToolCallFailed({
          callId: event.callId,
          error: message,
        });
      }
    });

    this.disposers.push(disposeReasoning, disposeToolRequested);
  }

  onModuleDestroy(): void {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers.length = 0;
  }
}
