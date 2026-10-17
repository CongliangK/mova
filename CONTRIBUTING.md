# Contributing

Mova 是实验性项目，不承诺维护、回复、合并 PR 或兼容性。请优先提交小而可审查的改动；提议大型改动前先讨论。公开仓库为 [CongliangK/mova](https://github.com/CongliangK/mova)。普通问题与小范围改动可使用该仓库的 Issues/PR；漏洞与秘密信息请按 [SECURITY](SECURITY.md) 私密报告。

## 本地开发

从根目录进入 `Mova`，按 [README](README.md) 安装固定版本运行时与原生依赖，再执行 `pnpm install --frozen-lockfile`。前端四项检查为 `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`；Rust 变更还需 `cargo check --manifest-path src-tauri/Cargo.toml --locked` 与 `cargo test --manifest-path src-tauri/Cargo.toml --locked`。不能运行的检查应注明具体原因，不写成通过。

- 增加或修复行为时添加对应回归测试；不把 mock 测试当成真实 API/桌面验证。
- 遵循现有 TypeScript/Rust 风格，避免不相关的全仓格式化或布局重构。
- 保留并同步更新锁文件；依赖变化说明来源、许可与必要性。
- 不运行安装/部署脚本作为例行验证，不要求贡献者安装用户级程序。
- 建议 Conventional Commits，如 `fix(export): validate frame dimensions`。

## 提交内容

PR 说明问题、改动范围、测试命令/exit code/测试计数、已知限制与 UI 截图（若适用）。删除截图、日志、路径中的个人信息；不得提交 API 密钥、真实用户项目、生成缓存或未经授权的素材。不要公开报告含漏洞利用或秘密的信息，见 [SECURITY](SECURITY.md)。

仅提交自己有权按 GPL-3.0-only 分发的原创改动，或明确标注来源、原许可并确认兼容的第三方改动。保留上游版权/许可，不把生成内容自动认定为拥有完整版权。不要求版权转让；提交即表示允许按项目许可分发该贡献。已有来源待确认不因新贡献而消失，见 [来源说明](THIRD_PARTY_NOTICES.md)。
