import { Body, Controller, Post } from '@nestjs/common';
import { AgentService, AgentTurn } from './agent.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Post('chat')
  async chat(
    @Body()
    body: {
      message: string;
      history?: AgentTurn[];
    },
  ) {
    const { message, history = [] } = body;
    const { answer } = await this.agentService.runAgent({ message, history });
    return { answer };
  }
}