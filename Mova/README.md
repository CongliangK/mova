# Mova application

项目介绍、实验性状态、真实能力与限制、平台先决条件、API 隐私和费用、许可及贡献入口，以 [仓库根 README](../README.md) 为准。

本目录是可运行应用，保持 Tauri + React 的现有布局。常用命令：

```sh
pnpm install --frozen-lockfile
pnpm dev                  # browser frontend only; no native IPC
pnpm tauri dev            # full desktop, starts frontend automatically
pnpm lint
pnpm typecheck
pnpm test
pnpm build                # frontend only
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build --no-bundle
```

Node 22.23.3、pnpm 11.28.5、Rust 1.96.0；完整桌面需要系统原生依赖。无需运行 `update:local` 来验证贡献；该脚本会安装/替换用户程序，属于另行选择的本地操作。

- [测试清单（历史快照，当前结果以日志为准）](docs/test-inventory.md)
- [Linux UI 性能诊断](docs/linux-ui-performance-debug.md)
- [素材注册 schema](docs/asset-registry-schema-v1.md)
- [贡献说明](../CONTRIBUTING.md) / [安全说明](../SECURITY.md)
- [GPL-3.0-only 许可](../LICENSE) / [第三方与来源待确认事项](../THIRD_PARTY_NOTICES.md)

不再把过时的开发机安装记录、历史测试通过声明或 Tauri 平台能力当作当前产品支持保证。
