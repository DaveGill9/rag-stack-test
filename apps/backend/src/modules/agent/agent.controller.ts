import { Body, Controller, Post } from '@nestjs/common';
import { AgentService, AgentTurn } from './agent.service';

@Controller('agent')
export class AgentController {
    constructor(private readonly agentService: AgentService) { }

    @Post('chat')
    async chat(
        @Body()
        body: {
            message: string;
            sessionId?: string;
        },
    ) {
        const { message, sessionId } = body;

        const { sessionId: finalSessionId, answer, sources } =
            await this.agentService.runAgentWithSession({ message, sessionId });

        return {
            sessionId: finalSessionId,
            answer,
            sources,
        };
    }
}