import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { OpenAiResponsesService } from './openai-responses.service';

@Module({
  imports: [ToolsModule],
  providers: [OpenAiResponsesService],
  exports: [OpenAiResponsesService],
})
export class OpenAiModule {}
