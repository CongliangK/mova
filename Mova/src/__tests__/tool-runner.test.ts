import { describe, it, expect, vi } from "vitest"
import { ToolRunner } from "../../src/services/ai/tool-runner"

describe("ToolRunner malformed JSON handling", () => {
  it("returns a failed visible tool-call result without executing the tool", async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, data: "should not run" })
    const runner = new ToolRunner()
    runner.registerTool({
      name: "generate_image",
      description: "Generate an image",
      parameters: { type: "object", properties: {} },
      execute,
    })

    const [result] = await runner.executeToolCalls([
      { id: "call-1", name: "generate_image", arguments: "{not valid json" },
    ])

    expect(execute).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      id: "call-1",
      name: "generate_image",
      result: { success: false },
    })
    expect(result.result?.error).toContain("Malformed JSON")
  })
})
