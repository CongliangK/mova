import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core"
import type { ToolCallResult, ToolDefinition, ToolResult } from "../../../types/ai"

export interface MovaPiAgentTool {
  name: string
  label: string
  description: string
  parameters: ToolDefinition["parameters"]
  execute: (toolCallId: string, rawArgs: unknown) => Promise<ToolCallResult>
}

const FORBIDDEN_GENERIC_TOOL_NAMES = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "shell",
  "run_command",
  "apply_patch",
  "rm",
  "mv",
  "cp",
  "mkdir",
  "rmdir",
  "chmod",
  "chown",
])

export function isAllowedMovaToolName(name: string): boolean {
  return !FORBIDDEN_GENERIC_TOOL_NAMES.has(name.trim().toLowerCase())
}

function parseToolArguments(rawArgs: unknown): { args: Record<string, unknown>; error?: string } {
  if (typeof rawArgs === "string") {
    try {
      const parsed = JSON.parse(rawArgs) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { args: parsed as Record<string, unknown> }
      }
      return { args: {}, error: "Tool arguments must be a JSON object" }
    } catch (err) {
      return {
        args: {},
        error: `Malformed JSON tool arguments: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  if (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)) {
    return { args: rawArgs as Record<string, unknown> }
  }

  return { args: {}, error: "Tool arguments must be an object" }
}

function failedResult(error: string): ToolResult {
  return { success: false, error }
}

export function adaptMovaToolToPiAgentTool(tool: ToolDefinition): MovaPiAgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (toolCallId, rawArgs) => {
      const parsed = parseToolArguments(rawArgs)
      if (parsed.error) {
        return {
          id: toolCallId,
          name: tool.name,
          arguments: parsed.args,
          result: failedResult(parsed.error),
        }
      }

      try {
        const result = await tool.execute(parsed.args)
        return {
          id: toolCallId,
          name: tool.name,
          arguments: parsed.args,
          result,
        }
      } catch (err) {
        return {
          id: toolCallId,
          name: tool.name,
          arguments: parsed.args,
          result: failedResult(err instanceof Error ? err.message : String(err)),
        }
      }
    },
  }
}

export function adaptMovaToolsToPiAgentTools(tools: ToolDefinition[]): MovaPiAgentTool[] {
  return tools.filter((tool) => isAllowedMovaToolName(tool.name)).map((tool) => adaptMovaToolToPiAgentTool(tool))
}

function toPiAgentCoreToolResult(result: ToolResult): AgentToolResult<ToolResult> {
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    details: result,
  }
}

export function adaptMovaToolToPiAgentCoreTool(tool: ToolDefinition): AgentTool {
  return {
    name: tool.name,
    label: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    prepareArguments: (rawArgs) => parseToolArguments(rawArgs).args,
    execute: async (_toolCallId, rawArgs) => {
      const args = rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs as Record<string, unknown> : {}
      try {
        const result = await tool.execute(args)
        return toPiAgentCoreToolResult(result)
      } catch (err) {
        return toPiAgentCoreToolResult(failedResult(err instanceof Error ? err.message : String(err)))
      }
    },
  }
}

export function adaptMovaToolsToPiAgentCoreTools(tools: ToolDefinition[]): AgentTool[] {
  return tools.filter((tool) => isAllowedMovaToolName(tool.name)).map((tool) => adaptMovaToolToPiAgentCoreTool(tool))
}

export async function executePiAgentToolCall(
  tools: MovaPiAgentTool[],
  toolCall: { id: string; name: string; arguments: unknown }
): Promise<ToolCallResult> {
  const tool = tools.find((candidate) => candidate.name === toolCall.name)
  if (!tool) {
    return {
      id: toolCall.id,
      name: toolCall.name,
      arguments: {},
      result: failedResult(`Unknown tool: ${toolCall.name}`),
    }
  }

  return tool.execute(toolCall.id, toolCall.arguments)
}
