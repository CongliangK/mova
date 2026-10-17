import type { LLMChunk, LLMProvider, LLMRequest } from "../types/ai"

const DEMO_TOOL_NAME = "get_project_info"
const DEMO_TOOL_CALL_ID = "browser-demo-project-info"

function hasDemoToolResult(request: LLMRequest) {
  return request.messages.some(
    (message) => message.role === "tool" && message.toolCallId === DEMO_TOOL_CALL_ID,
  )
}

function canCallDemoTool(request: LLMRequest) {
  return request.tools?.some((tool) => tool.name === DEMO_TOOL_NAME) === true
}

async function* streamText(text: string): AsyncGenerator<LLMChunk> {
  const chunks = text.match(/.{1,18}/g) ?? [text]
  for (const chunk of chunks) {
    yield { type: "text", delta: chunk }
  }
}

export class BrowserDemoMockLlmProvider implements LLMProvider {
  async *streamChat(request: LLMRequest): AsyncGenerator<LLMChunk> {
    if (canCallDemoTool(request) && !hasDemoToolResult(request)) {
      yield* streamText("Browser demo mock: checking the in-memory project before replying. ")
      yield {
        type: "tool_call",
        id: DEMO_TOOL_CALL_ID,
        name: DEMO_TOOL_NAME,
        arguments: "{}",
      }
      yield { type: "done" }
      return
    }

    yield* streamText(
      "Browser demo mock response: AI send is wired correctly, streaming text reached the chat panel, and no real provider or API key was used.",
    )
    yield { type: "done" }
  }

  async validateConnection(): Promise<boolean> {
    return true
  }

  async listModels(): Promise<string[]> {
    return ["browser-demo-mock"]
  }
}

export function createBrowserDemoMockProvider(): LLMProvider {
  return new BrowserDemoMockLlmProvider()
}
