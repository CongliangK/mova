import type { ToolDefinition, ToolCallResult, ToolResult } from "../../types/ai"

/**
 * Tool Runner executes tool calls made by the LLM.
 * Each tool is a function with typed input/output schemas.
 */
export class ToolRunner {
  private tools: Map<string, ToolDefinition> = new Map()

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool)
  }

  registerTools(tools: ToolDefinition[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool)
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      execute: tool.execute,
    }))
  }

  getToolSchemasForLLM(): { name: string; description: string; parameters: ToolDefinition["parameters"] }[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }))
  }

  async executeToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` }
    }

    try {
      return await tool.execute(args)
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async executeToolCalls(
    toolCalls: { id: string; name: string; arguments: string }[]
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = []

    for (const tc of toolCalls) {
      let parsedArgs: Record<string, unknown>
      try {
        parsedArgs = JSON.parse(tc.arguments)
      } catch (err) {
        results.push({
          id: tc.id,
          name: tc.name,
          arguments: {},
          result: {
            success: false,
            error: `Malformed JSON tool arguments: ${err instanceof Error ? err.message : String(err)}`,
          },
        })
        continue
      }

      const result = await this.executeToolCall(tc.name, parsedArgs)
      results.push({
        id: tc.id,
        name: tc.name,
        arguments: parsedArgs,
        result,
      })
    }

    return results
  }

  clear() {
    this.tools.clear()
  }
}
