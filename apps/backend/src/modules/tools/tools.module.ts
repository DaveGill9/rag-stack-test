import { Module } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { RagModule } from '../rag/rag.module';

@Module({
    imports: [RagModule],
    providers: [ToolsService],
    exports: [ToolsService],
})
export class ToolsModule { }