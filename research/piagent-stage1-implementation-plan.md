# piAgent 内核迁移 Stage 1 实施计划/TODO

日期：2026-06-12  
工作区：`piagent-stage-1`  
范围：规划 + 新运行时边界并行接入 + 验证；不删除旧内核、不 merge、不 commit。

## 1. 总目标

在不改变默认用户路径的前提下，为 Mova AI 链路建立可切换的运行时边界：

```text
useAgent -> MovaAgentRuntime
             ├─ LegacyAgentRuntime（默认，包装现有 AgentOrchestrator）
             └─ Mock/PiAgent-compatible Runtime（实验开关，验证 message/tool/event contract）
```

Stage 1 的目标是让 `use-agent.ts` 不再直接依赖具体内核，并提供 piAgent 适配层所需的消息、工具、事件映射与测试。旧 `AgentOrchestrator`、`ToolRunner`、providers、skills、tools 均保留。

## 2. 非目标

- 不删除或重写 `AgentOrchestrator` / `ToolRunner` / 现有 providers / tools / skills。
- 不默认启用 piAgent；legacy 必须仍是默认和回退路径。
- 不暴露 pi-coding-agent 的通用 `read/write/bash/edit/shell` 等工具。
- 不迁移 settings schema、聊天持久化格式或 Rust/Tauri commands。
- 不做 Node sidecar / CLI RPC / Rust port 集成。
- 不提交 git commit，不合入主干。

## 3. 分阶段 TODO checklist

### Phase A：输入调研和计划

- [x] 阅读主调研报告 `research/piagent-kernel-migration.md`。
- [x] 阅读独立评审报告 `piagent-migration-independent-review.md`。
- [x] 启动只读子智能体复核：实现计划、当前入口/测试、piAgent 依赖可行性、风险/测试清单。
- [x] 写出本实施计划/TODO。

### Phase B：运行时边界

- [x] 新增 `MovaAgentRuntime` 接口和 callback/config 类型。
- [x] 新增 `LegacyAgentRuntime`，只包装现有 `AgentOrchestrator`。
- [x] 新增 runtime factory / feature flag；默认 `legacy`，无效值回退 `legacy`。
- [x] 改造 `use-agent.ts` 通过 runtime 接口调用。

### Phase C：piAgent/mock contract 层

- [x] 新增 mock/piAgent-compatible event 类型和 event -> Mova callbacks 映射。
- [x] 新增 Mova tool -> piAgent-like tool adapter，保持 Mova 工具名和参数，不引入通用 coding tools。
- [x] 新增 `MockPiAgentRuntime` 作为实验 runtime：复用现有 `LLMProvider` 流，顺序执行 Mova tools，验证 piAgent 风格事件/工具结果映射。
- [x] 记录真实 `@earendil-works/pi-agent-core` 前端直接集成阻塞原因。

### Phase D：测试

- [x] 覆盖 feature flag 默认 legacy / 无效值回退 legacy。
- [x] 覆盖 `LegacyAgentRuntime` 行为与旧 orchestrator 一致。
- [x] 覆盖 mock runtime text stream、工具成功、工具错误/unknown/malformed args、provider error 映射。
- [x] 覆盖 tool adapter 不包含未注册通用工具。
- [x] 运行 `cd Mova && pnpm lint && pnpm typecheck && pnpm test`。

### Phase E：收尾审查

- [x] 汇总子智能体输出并处理 Stage 1 范围内 blocker。
- [x] 检查 diff，确认未做 Stage 2 删除/替换。
- [ ] 输出最终报告：changed files、TODO、验证、真实依赖状态、风险、是否建议独立 review、是否建议合入。

### Phase F：深度测试与修复（本轮）

- [x] 重新检查 TODO/diff，确认 Stage 1 边界和 legacy 默认约束。
- [x] 启动只读子智能体做 runtime/风险和测试缺口复核。
- [x] 补齐 hook/useAgent 层测试：legacy 默认路径、loading=false、assistant placeholder、runtime error。
- [x] 补齐/加强 mock runtime 收敛测试：tool failure、done-only、max tool rounds。
- [x] 重新运行 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`。
- [x] 汇总深度测试证据和残余风险。

## 4. 预计改动文件

新增：

- `Mova/src/services/ai/runtimes/agent-runtime.ts`
- `Mova/src/services/ai/runtimes/legacy-agent-runtime.ts`
- `Mova/src/services/ai/runtimes/agent-runtime-config.ts`
- `Mova/src/services/ai/runtimes/agent-runtime-factory.ts`
- `Mova/src/services/ai/runtimes/piagent-message-adapter.ts`
- `Mova/src/services/ai/runtimes/piagent-tool-adapter.ts`
- `Mova/src/services/ai/runtimes/mock-piagent-runtime.ts`
- `Mova/src/__tests__/agent-runtime.test.ts`
- `Mova/src/__tests__/piagent-runtime-adapter.test.ts`

修改：

- `Mova/src/hooks/use-agent.ts`
- `research/piagent-stage1-implementation-plan.md`

不预计修改：

- `Mova/src-tauri/**`
- `Mova/package.json` / `pnpm-lock.yaml`（除非真实依赖 PoC 明确可行；当前预计不引入）

## 5. 风险与回滚策略

| 风险 | 缓解/回滚 |
| --- | --- |
| 新边界影响默认 AI 行为 | feature flag 默认 legacy；`use-agent.ts` 默认创建 `LegacyAgentRuntime`；测试覆盖默认值 |
| mock runtime 被误认为已完成真实 piAgent 集成 | 命名和报告明确 `mock/contract`，真实依赖阻塞单列 |
| 工具权限扩大 | adapter 只接收 `Skill.tools`，不注册通用 read/write/bash/edit/shell 工具 |
| 双重工具循环 | 每个 runtime 独立拥有 loop；legacy wrapper 只调用 `AgentOrchestrator`，mock runtime 不调用 `AgentOrchestrator` |
| piAgent core 浏览器兼容不明 | 不把真实包导入 renderer；记录 Node built-in re-export 风险，后续由 main 决定 sidecar/exports 策略 |
| 测试不足 | 新增 runtime/adapter focused tests，并运行 lint/typecheck/test |

回滚方式：删除新增 `runtimes/` 和相关测试，将 `use-agent.ts` 恢复直接持有 `AgentOrchestrator`。由于默认仍为 legacy，运行时回滚也可通过清理 localStorage feature flag 完成。

## 6. 验收命令

必须运行：

```bash
cd Mova && pnpm lint
cd Mova && pnpm typecheck
cd Mova && pnpm test
```

建议但非本 Stage 1 强制（如时间允许）：

```bash
cd Mova && pnpm build
```

本阶段不改 Rust/Tauri commands，因此不要求 `cargo test`；若后续意外修改 `src-tauri/**`，需补跑。

## 7. Stage 2 删除旧内核前置条件

Stage 2 才能考虑删除旧内核或把 piAgent 设为默认，前置条件至少包括：

- 真实 piAgent 目标包、版本、运行位置和打包策略由 main/用户确认。
- `@earendil-works/pi-agent-core` 或 sidecar/RPC PoC 通过 Vite build/Tauri dev/build 验证。
- provider/settings/API key 迁移策略明确且有测试。
- 文件/图片类工具具备 project-root sandbox、参数范围校验和 Rust 兜底。
- sprite/map/image generation 等复杂工具在新 runtime 下完成端到端验证。
- legacy 与 piAgent contract tests 均通过，并有独立 review worktree 审核。
- 至少一个稳定版本保留 legacy 回滚或明确迁移回退方案。

## 8. 真实 piAgent core 依赖初步结论

`@earendil-works/pi-agent-core@0.79.1` 存在，声明 Node `>=22.19.0`，依赖 `@earendil-works/pi-ai`、`typebox` 等。包 root export 会 re-export `./node`，其 dist 中包含 `node:child_process`、`node:fs`、`node:os`、`node:path`、`node:readline` 等 Node-only imports。Mova 当前 AI runtime 位于 Tauri React/Vite renderer，直接把 root package 引入前端存在浏览器打包风险。

因此 Stage 1 先实现 mock/contract 层，不新增真实依赖；已通过 intercom 向疑似 main/orchestrator 说明该阻塞和当前回退策略。
