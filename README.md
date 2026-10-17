# Mova

Mova 是一个 **实验性的 AI 辅助 2D 游戏素材与动画桌面编辑器**，使用 Tauri 2 / Rust、React 19 / TypeScript 6。它把项目文件树、画布、时间线、聊天工具与导出放在同一个工作区。当前版本为 0.1.1，**不承诺维护、响应时间、兼容性或生成质量，不适合直接信任为生产工具**。请先备份项目，审查 AI 的工具操作。

## 已实现与边界

- 目录式项目创建/打开/保存，文件浏览与文本预览、基础 Git 初始化/状态/暂存/提交/日志。
- 图像画布、基础栅格绘制/擦除/填充/形状、帧时间线和播放；PNG/WebP 精灵图、GIF、Godot SpriteFrames 导出。
- 聊天、工具调用与项目内素材操作；精灵生成、地图分层预览/道具包提取工具。模型输出可能不一致，不能保证可用游戏资产。
- LLM 适配器包含 OpenAI 兼容接口、Anthropic、Ollama；设置中的其他云厂商通过兼容接口接入，**存在适配器不等于已验证该厂商当前服务/模型可用**。
- 图像生成仅实现 SuChuang（速创）适配器，需要自行配置端点与密钥；DALL-E、Stability、Sedans Image 不可用。视频生成仍是提案占位，不是可用功能。不提供模型、免费额度或离线图像生成。
- 浏览器开发预览不是完整桌面应用：Tauri 原生文件系统、对话框、Git、导出等依赖桌面 IPC；浏览器演示/mock 不证明真实 API 或桌面功能工作。

## 平台与先决条件

开发/CI 基线：**Node.js 22.23.3、pnpm 11.28.5、Rust 1.96.0**。版本由根目录 `.node-version`、`rust-toolchain.toml` 和应用 `packageManager` 固定；不声称这些是最低版本。安装 Node 后，用 Corepack 激活 `pnpm@11.28.5`，或安装该精确版本的 pnpm。

Linux 是本次自动验证目标。Windows/macOS 是 Tauri 的目标平台，但本项目本次未验证其构建、签名或安装，不承诺支持；没有已验证的公开安装包。本仓库中的本地安装脚本不是首次使用的必要步骤。

完整桌面开发还需 Rust/Cargo、原生构建工具与 WebView，见 [Tauri 官方先决条件](https://v2.tauri.app/start/prerequisites/)：

- Ubuntu 24.04：`build-essential pkg-config libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf`。
- Windows：MSVC C++ build tools 与 WebView2；macOS：Xcode Command Line Tools。
- 前端检查/构建无需 Rust、系统 WebKit 或付费 API。完整桌面运行需要图形会话。

## 安装与运行

源码仓库：[CongliangK/mova](https://github.com/CongliangK/mova)。克隆后从仓库根目录开始：

```sh
cd Mova
pnpm install --frozen-lockfile
pnpm dev                  # 仅前端，http://localhost:5173，端口被占用则失败
pnpm tauri dev            # 完整桌面开发，另开终端或先停止前端 dev
```

Tauri 会自动启动前端；不要同时启动两个占用 5173 的实例。首次 Rust 编译可能较慢。Linux 渲染问题可参考 [性能诊断](Mova/docs/linux-ui-performance-debug.md)。产品目录结构保持不变：`Mova/src` 为前端，`Mova/src-tauri` 为桌面后端，`research` 为设计记录而非功能承诺。

外层 `skills/generate2dmap`、`skills/generate2dsprite` 的 Python 辅助脚本、技能提示词及关联辅助文档来源不确定，本次不分发；原件仅在本地保留，不随源码快照发布。这些独立 Python/外部 CLI 辅助流程不包含在公开产品中。主应用不引用这些外层资源，自有运行时 `Mova/src/services/ai/skills`、TypeScript provider 和原生工具保持不变；这不构成对端到端功能的新验证。详见 [来源与发布限制](THIRD_PARTY_NOTICES.md)。

## API 配置、隐私与费用

在 Settings 中选择 LLM、模型、端点、密钥。Ollama 需要自行运行本地服务及支持相应能力的模型。图像生成另行配置 SuChuang；请向服务商确认真实协议、模型、价格和数据政策。

**密钥保存在 WebView/browser 的 localStorage（`mova-settings`），不是系统密钥链，也没有加密。** 本机用户、调试工具或注入脚本可能读取它们；不应在共享设备存储长期密钥。不要上传 localStorage、设置导出、真实聊天或用户项目。项目聊天保存在项目文件中；本地路径、图片与提示词可能含隐私。

调用 AI 时，提示词、聊天上下文、工具结果和引用图片/URL可能发往所选服务商；远程图片下载也会访问相应主机。云 API 费用由用户承担，重试/多轮工具调用可能增加费用；本项目没有统一价格或预算保障。请使用受限额度密钥、仅配置可信 HTTPS 端点，不向未知代理发送秘密。Ollama 本地 LLM 不意味着图像生成也离线。

桌面允许较宽网络与本地素材访问，**不是不可信项目或 AI 工具的安全沙箱**。安全边界与报告方式见 [SECURITY](SECURITY.md)。

## 测试与构建

在 `Mova` 中运行：

```sh
pnpm lint
pnpm typecheck
pnpm test:release                # 发布文档链接、许可正文、版本/CI 一致性回归检查
pnpm test
pnpm build                       # 仅前端产物 dist，不是桌面程序
cargo check --manifest-path src-tauri/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build --no-bundle      # 本机桌面二进制；需完整原生环境
```

已提交 pnpm 与 Cargo 锁文件。GitHub CI 在 Ubuntu 上执行前端四项检查及 Rust check/test，最小只读权限，不签名、不发布、不安装用户程序；不代替桌面交互/真实模型验证。历史测试清单见 [test inventory](Mova/docs/test-inventory.md)，每次验证以实际日志为准。公开前人工检查见 [发布清单](docs/RELEASE_CHECKLIST.md)。

## 贡献与许可

请先阅读 [CONTRIBUTING](CONTRIBUTING.md)。这是实验性项目，没有维护或接受 PR 的承诺。

权利人授权的项目代码采用 **GPL-3.0-only**，完整官方正文见 [LICENSE](LICENSE)（来源：[GNU](https://www.gnu.org/licenses/gpl-3.0.txt)）。不要求贡献者转让版权；第三方组件保留自身许可。项目为实验性项目；权利人确认有权以 GPL 发布自有代码。权利人也已明确确认品牌/favicon/图标有权开源；这是权利人确认，不是独立法律核实，不自动清除第三方来源的权利义务。来源不确定的外层辅助资源本次不分发，不以其补证作为发布剩余自有产品的前提；仍适用的依赖与来源义务见 [第三方与来源说明](THIRD_PARTY_NOTICES.md)。发布形式已确定为整理后的源码独立快照，不携带旧历史；严格按[发布清单](docs/RELEASE_CHECKLIST.md)，由操作者明确指定源与仓外全新目录，从固定完整 OID 人工导出和复核候选；不提供自动快照工具。用户已授权验收后向上述真实仓库发布，准备工作本身不代表已发布。原仓库历史与 WIP 完整保留，绝不从原仓库 push。源码与二进制依赖审查分开；不得在未完成适用审查前分发二进制。
