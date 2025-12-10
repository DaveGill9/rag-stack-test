export type JsonSchema = {
    type: 'object';
    properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean';
        description?: string;
      }
    >;
    required?: string[];
  };
  
  export interface ToolDefinition {
    name: string;
    description: string;
    parameters: JsonSchema;
  }
  
  export interface ToolExecutionContext {
  }
  
  export interface Tool<TArgs = any> {
    definition: ToolDefinition;
  
    execute(args: TArgs, ctx?: ToolExecutionContext): Promise<string>;
  }