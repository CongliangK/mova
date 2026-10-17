# verify + AI smoke Stage 1 实施计划

创建时间：2026-06-12  
基于：`acceptance-gates-test-coverage.md` 及子报告  
工作区：`ai-smoke-worktree`（隔离 worktree）

## 目标

补齐 P0 门禁缺口第一批：统一 `verify` 脚本、Rust gate 可执行入口、AI/useAgent 普通对话与错误路径 smoke tests。

## 非目标

- 不引入 Playwright/Cypress/Tauri E2E 等重依赖
- 不调用真实 LLM/image provider，不需要 API key
- 不改 piAgent runtime 架构
- 不删除旧 AI 内核
- 不提交，不合并
- 不做大型 E2E 或真实外部 provider
- 不做性能基线/覆盖率门禁/CI（P1/P2）

## 交付物

| 序号 | 交付物 | 路径 | 优先级 |
|------|--------|------|--------|
| A | 计划文档 | `research/verify-ai-smoke-stage1-plan.md` | P0 |
| B1 | `test:rust` script | `Mova/package.json` scripts | P0 |
| B2 | `verify` script | `Mova/package.json` scripts | P0 |
| C1 | AgentOrchestrator 普通对话 + 错误路径测试 | `Mova/src/__tests__/agent-orchestrator.test.ts` 扩充 | P0 |
| C2 | useAgent legacy 默认路径不回归验证 | `Mova/src/__tests__/use-agent-runtime.test.tsx` 已有覆盖，确认 | P0 |
| C3 | AgentOrchestrator 无 provider/无 skill/stream error 测试 | `Mova/src/__tests__/agent-orchestrator.test.ts` 扩充 | P0 |
| D | Rust gate 跨平台可执行入口 | `Mova/package.json` scripts + 可选 helper | P0 |
| E | 验证运行 | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` + `pnpm test:rust` + `pnpm verify` | P0 |

## 现有测试覆盖分析

### 已有强覆盖（piAgent Stage 1 后）

| 测试文件 | 覆盖内容 |
|----------|----------|
| `use-agent-runtime.test.tsx` | useAgent hook：无 provider 错误、流式文本更新、加载状态、mock flag 切换、runtime 缓存重置、异常捕获 |
| `agent-runtime.test.ts` | Legacy + MockPiAgent 文本流、工具调用、错误路径、done-only stream、max rounds |
| `piagent-runtime-adapter.test.ts` | 事件适配器、工具适配器、MockPiAgentRuntime 全路径 |
| `agent-orchestrator.test.ts` | 仅工具调用上下文消息排序 |

### 需补缺口

1. **AgentOrchestrator 普通对话 happy path**：当前只测了 tool-call 场景，未测纯文本对话（无工具调用）
2. **AgentOrchestrator 错误路径**：无 provider、无 skill、provider stream error
3. **useAgent/AgentOrchestrator 组合路径**：provider config error 从 createLlmProvider 返回

### 已有不需补

- useAgent hook 层面的所有路径已由 `use-agent-runtime.test.tsx` 充分覆盖
- Legacy/piagent-mock runtime 路径已由 `agent-runtime.test.ts` 覆盖
- Tool adapter 和 event adapter 已由 `piagent-runtime-adapter.test.ts` 覆盖

## 门禁矩阵（已实现）

| 场景 | 命令 | 实际耗时 | 状态 |
|------|------|----------|------|
| 前端纯 UI/组件 | `pnpm verify`（lint+typecheck+test+build） | ~7s | ✅ 通过 |
| AI/chat 改动 | `pnpm verify` | ~7s | ✅ 通过 |
| Rust/Tauri 改动 | `pnpm verify:full`（含 `test:rust`） | ~2-5min | ⚠️ 需要 Rust 工具链 |

## package scripts 实际实现（根据 reviewer 建议调整）

### `test:rust`

```json
"test:rust": "cargo test --manifest-path src-tauri/Cargo.toml"
```

使用 `--manifest-path` 而非 `cd src-tauri &&`，跨平台更稳。

### `verify`

```json
"verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
```

纯前端门禁，不含 Rust（按 reviewer 建议拆分，避免前端开发者被 Rust 环境阻塞）。

### `verify:full`

```json
"verify:full": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:rust"
```

完整门禁含 Rust 测试。

## 实际改动文件

| 文件 | 改动类型 | 风险 | 状态 |
|------|----------|------|------|
| `Mova/package.json` | 新增 `test:rust`、`verify`、`verify:full` scripts | 低 | ✅ |
| `Mova/src/__tests__/agent-orchestrator.test.ts` | 新增 3 个 describe、6 个 it：普通对话 happy path、done-only、无 provider、无 skill、stream error；保留原 tool-call context 测试 | 低 | ✅ |
| `research/verify-ai-smoke-stage1-plan.md` | 新增文档 + 本次更新 | 低 | ✅ |

## AgentOrchestrator 新增测试详情

| describe | it | 覆盖场景 |
|---|---|---|
| `AgentOrchestrator plain text conversation` | streams text deltas, completes, and records conversation history with no tool calls | 纯文本流式对话：delta 回调、onComplete、conversationHistory 正确性 |
| `AgentOrchestrator plain text conversation` | handles a done-only stream (empty response) without hanging | 空流响应不挂起 |
| `AgentOrchestrator error paths` | calls onError when no provider is configured | 未 setProvider 时的 guard |
| `AgentOrchestrator error paths` | calls onError when no skill is selected (provider set but no skill) | 未 setSkill 时的 guard |
| `AgentOrchestrator error paths` | calls onError when the provider stream throws an exception | provider.streamChat 抛异常 → onError，onComplete 不触发 |
| `AgentOrchestrator tool-call context` | adds assistant tool-call context before tool-result follow-up messages | 保留原有测试（改为使用 ScriptedProvider） |

## 验证结果（2026-06-12）

| 命令 | 结果 | 详情 |
|------|------|------|
| `pnpm lint` | ✅ | 0 errors, 0 warnings |
| `pnpm typecheck` | ✅ | tsc -b 通过 |
| `pnpm test` | ✅ | 39 files, 255 tests passed |
| `pnpm build` | ✅ | Vite production build 通过（chunk 890kB 警告为已知） |
| `pnpm verify` | ✅ | 四步串联全部通过 |
| `pnpm test:rust` | ⚠️ | 脚本正确；此环境 Rust toolchain 因 `cookie`/`time` crate 上游冲突编译失败，非本变更引入 |
| `pnpm verify:full` | ⚠️ | 同上，Rust 步骤因环境问题失败 |

## 残余缺口（不在此阶段处理）

- E2E/Playwright/Cypress
- 真实 LLM/image provider 集成测试
- 性能基线/benchmark
- 覆盖率阈值/CI
- format/pre-commit
- 导出 PNG/WebP/GIF wizard 前端测试
- Canvas 视觉回归
- watcher/file-tree 真实集成
- AgentOrchestrator max tool rounds 测试（piAgent runtime 已有，legacy 未补）
- useAgent + 真实 LegacyAgentRuntime 全链路集成 smoke（当前分别有 hook 层和 runtime 层测试，但无合并测试）
- image generation LLM→tool→provider 闭环测试（工具层已有 mock，缺 orchestrator 级闭环）

## 是否建议独立 review

**建议**：改动量小（2 个文件），可合入主干。建议在实际合入前由另一位开发者确认 Rust 环境问题与本次变更无关，并运行 `pnpm verify:full` 确保 Rust gate 可用。
