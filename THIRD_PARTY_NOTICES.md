# Third-party components and provenance

项目选择 GPL-3.0-only 不会覆盖第三方权利，也不是所有文件均原创的证明。未发现已有独立 LICENSE/NOTICE 或逐文件上游版权声明可作为完整权属凭证；旧应用 README 曾写 private / all rights reserved，已根据权利人选择修改，未删除发现的第三方许可。Git 作者名不是权属证明。

## 清单与来源核实状态

| 范围 | 可核实的技术来源 | 公开前状态 |
| --- | --- | --- |
| 前端依赖 | `Mova/package.json`、`Mova/pnpm-lock.yaml` | 从 registry 安装的第三方组件，保留包内 LICENSE/NOTICE；锁文件不是分发许可审计结论 |
| Rust 依赖 | `Mova/src-tauri/Cargo.toml`、`Mova/src-tauri/Cargo.lock` | Cargo registry 组件；分发二进制前收集实际所含 crates 的许可证/NOTICE 并确认 GPL 兼容性 |
| pi agent runtime | `@earendil-works/pi-agent-core` / `pi-ai` 0.79.1，[包声明的上游](https://github.com/earendil-works/pi) | 元数据声明 MIT、作者 Mario Zechner；本次安装的 agent-core 包未发现独立 LICENSE，二进制分发前需从对应版本上游核实并补齐原文/版权声明，不能只靠 package.json |
| UI / desktop | React、Zustand、Konva/react-konva、Lucide、Tauri、Tailwind 等 | 主组件常见为 MIT/Apache-2.0/ISC 等，但必须以实际锁定版本 LICENSE 为准，不对全依赖树作笼统许可声明 |
| 外层辅助资源（排除） | `skills/generate2dmap`、`skills/generate2dsprite` 的 Python 脚本、技能提示词与关联辅助文档 | 来源不确定，本次不分发；从准备分支发布索引排除，原件在本地准备工作树及原主仓保留，不是已清权，不作为发布剩余自有产品的授权前提 |
| 品牌/图标 | `Mova/public/favicon.svg`、`Mova/src/components/brand/mova-logo.tsx`、`Mova/src-tauri/icons/*` | 权利人已明确确认这些品牌与图标有权开源；此处依据权利人确认，不是独立法律核实，不据此自动清除第三方来源的权利义务 |
| 其他项目源代码与文档 | 当前拟发布的源码树及其实际来源记录 | 权利人已确认有权按 GPL-3.0-only 发布自有代码；对无法核实的具体来源仍须逐项补证，不因缺少记录推定为自有 |
| 旧历史演示材料 | 旧历史 `ppt/` 中视频、截图/logo 等，当前树已无该目录 | 不纳入仅源码快照；保留在未改写的本地原仓库中，不随快照公开。不得从原仓库 push |

用户项目、提示词输入、模型输出、第三方模型与云服务均不因应用 GPL 而自动获得许可。品牌名称用于描述适配器/格式，不暗示官方认可。辅助提示词中引用游戏名称也不授予其角色、商标或美术使用权。

发布树不含外层 `skills/`，独立 Python/外部图像生成 CLI 辅助流程不随本次源码分发。主应用构建与运行时未发现对外层资源的引用；自有 `Mova/src/services/ai/skills/` 内嵌提示词、TypeScript provider 与原生工具保留，不能把外层排除误解为删除应用运行时技能。排除不构成来源核实，也不应复制未知来源脚本或凭据。

## 本次依赖元数据核查（不是法律清权）

`pnpm licenses list --json --prod` 收录 212 个生产依赖条目：MIT 148、Apache-2.0 43、BSD-3-Clause 12、ISC 4、0BSD 1、MIT/Apache 双许可表达式 4。Linux 目标 Cargo metadata 收录 504 个包（含 Mova），未发现缺失 license 字段；除常见 MIT/Apache 外还含 MPL-2.0、Unicode-3.0、CDLA-Permissive-2.0、LLVM exception 等，需要按实际分发路径保留对应义务。未由此认定所有声明准确或所有平台依赖兼容。

完整跨平台 Cargo metadata 在离线缓存中因缺少 Android 专用 crate 失败；随后限定 `x86_64-unknown-linux-gnu` 的元数据成功。其他平台许可证审查尚未完成。清单和脱敏汇总只留在仓库外证据目录；不把开发机绝对路径带入发布文件。

## 分发前操作

1. 本次不分发来源不确定的外层辅助脚本、提示词和关联文档；仅在以后拟重新分发时先核实来源与兼容许可，不将其补证作为发布剩余自有产品的阻碍。品牌/图标的权利人确认已记录，不能替代第三方来源核实，也不改写为独立法律清权结论。
2. 当前已选择只发布整理后的源码单提交快照，不发布旧历史；按[发布清单](docs/RELEASE_CHECKLIST.md)在仓库外生成并逐项复核候选。原仓库及其历史/WIP 保持完整，绝不从原仓库 push。
3. 源码分发与二进制依赖审查分开；若另行分发二进制，审查该目标实际包含的依赖、静态链接库、字体、图标、WebView/系统组件及其许可证/NOTICE，并提供适用的 GPL 对应源代码/构建说明。未完成全平台二进制验证不是源码候选本身的必修阻碍。
4. 本准备没有改写历史、删除原材料、推送或创建公开仓库。用户已授权验收后向 [CongliangK/mova](https://github.com/CongliangK/mova.git) 发布独立源码快照；后续执行者仍须完成 [发布清单](docs/RELEASE_CHECKLIST.md) 的人工路径、内容、单提交和有限秘密检查，不能把授权当成检查已通过。本文是风险台账，不是法律意见或权属担保。
