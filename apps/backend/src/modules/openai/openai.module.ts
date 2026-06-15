import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { OpenAiResponsesService } from './openai-responses.service';
import { OpenAiEventsService } from './openai-events.service';
import { OpenAiEventsListener } from './openai-events.listener';

@Module({
  imports: [ToolsModule],
  providers: [OpenAiResponsesService, OpenAiEventsService, OpenAiEventsListener],
  exports: [OpenAiResponsesService, OpenAiEventsService],
})
export class OpenAiModule {}
