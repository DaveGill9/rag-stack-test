import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

const REASONING_EVENT = 'openai.reasoning';
const TOOL_CALL_REQUESTED_EVENT = 'openai.tool_call.requested';
const TOOL_CALL_COMPLETED_EVENT = 'openai.tool_call.completed';
const TOOL_CALL_FAILED_EVENT = 'openai.tool_call.failed';

export type OpenAiReasoningEvent = {
  responseId: string;
  summary: string;
};

export type OpenAiToolCallRequestedEvent = {
  callId: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: Record<string, unknown>;
};

export type OpenAiToolCallCompletedEvent = {
  callId: string;
  output: string;
};

export type OpenAiToolCallFailedEvent = {
  callId: string;
  error: string;
};

@Injectable()
export class OpenAiEventsService {
  private readonly emitter = new EventEmitter();

  onReasoning(listener: (event: OpenAiReasoningEvent) => void): () => void {
    this.emitter.on(REASONING_EVENT, listener);
    return () => this.emitter.off(REASONING_EVENT, listener);
  }

  emitReasoning(event: OpenAiReasoningEvent): void {
    this.emitter.emit(REASONING_EVENT, event);
  }

  onToolCallRequested(
    listener: (event: OpenAiToolCallRequestedEvent) => void | Promise<void>,
  ): () => void {
    this.emitter.on(TOOL_CALL_REQUESTED_EVENT, listener);
    return () => this.emitter.off(TOOL_CALL_REQUESTED_EVENT, listener);
  }

  emitToolCallCompleted(event: OpenAiToolCallCompletedEvent): void {
    this.emitter.emit(TOOL_CALL_COMPLETED_EVENT, event);
  }

  emitToolCallFailed(event: OpenAiToolCallFailedEvent): void {
    this.emitter.emit(TOOL_CALL_FAILED_EVENT, event);
  }

  async requestToolCall(event: OpenAiToolCallRequestedEvent): Promise<string> {
    if (this.emitter.listenerCount(TOOL_CALL_REQUESTED_EVENT) === 0) {
      throw new Error('No listeners registered for openai.tool_call.requested');
    }

    return new Promise<string>((resolve, reject) => {
      const onCompleted = (completed: OpenAiToolCallCompletedEvent) => {
        if (completed.callId !== event.callId) return;
        cleanup();
        resolve(completed.output);
      };

      const onFailed = (failed: OpenAiToolCallFailedEvent) => {
        if (failed.callId !== event.callId) return;
        cleanup();
        reject(new Error(failed.error));
      };

      const cleanup = () => {
        this.emitter.off(TOOL_CALL_COMPLETED_EVENT, onCompleted);
        this.emitter.off(TOOL_CALL_FAILED_EVENT, onFailed);
      };

      this.emitter.on(TOOL_CALL_COMPLETED_EVENT, onCompleted);
      this.emitter.on(TOOL_CALL_FAILED_EVENT, onFailed);
      this.emitter.emit(TOOL_CALL_REQUESTED_EVENT, event);
    });
  }
}
