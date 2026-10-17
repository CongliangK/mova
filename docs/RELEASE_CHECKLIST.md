# Public release checklist

状态：**用户已授权验收后将独立源码快照推送到 [CongliangK/mova](https://github.com/CongliangK/mova.git)**。本准备任务只修改文档与静态契约，不制作正式快照、不推送。实际导出、复核和推送由后续发布执行者完成。项目为实验性项目，不承诺维护或生产适用性。**绝不从原仓库 push**：准备分支有祖先，直接 push 会带入旧历史。不 force、不 mirror、不改原仓历史、WIP 或原资料。

## 已决决定与待核实项

- [x] GPL-3.0-only；实验性项目；权利人确认有权以 GPL 发布自有代码。这不是独立法律核实。
- [x] 只发布整理后的源码单提交快照，不携带旧历史。
- [x] 权利人已明确确认这些品牌/favicon/图标也有权开源；不自动清除第三方来源的权利义务。见[来源台账](../THIRD_PARTY_NOTICES.md)。
- [x] 来源不确定的外层 `skills/generate2dmap`、`skills/generate2dsprite` Python 辅助脚本、提示词及关联文档本次不分发。原件在本地旧准备工作树与原主仓保留。应用内自有 `Mova/src/services/ai/skills` 运行时不改，不把排除外层资源当作端到端功能验证。
- [x] 真实目标仓库为 `https://github.com/CongliangK/mova.git`；此前只读确认远端无 refs，推送前仍须重新确认。
- [ ] 核实[私密漏洞报告入口](https://github.com/CongliangK/mova/security/advisories/new)是否已启用；未知或不可用时遵循 [SECURITY](../SECURITY.md)，不公开敏感细节、不虚构邮箱。
- [ ] 按实际源码分发范围复核依赖许可义务。二进制分发另行审查实际所含依赖、NOTICE/版权声明及 GPL 对应源码与构建说明；未验证所有平台二进制不自动阻塞仅源码发布。

## 人工确定源与仓外目录

本流程依赖操作者对**这台机器**的路径与 Git 配置逐项核验，不自动判断任意 Git 拓扑。使用受控的干净 shell；先检查并清除继承的 `GIT_*` 环境影响，确认无对象替换、外部 filters、额外 attributes 或 hooks 等干扰。以下均为可替换变量的短命令示例，按阶段执行并保存命令、完整输出和 exit code；失败即停止，不用 `|| true` 吞错。不要整页盲目执行。

明确填入准备工作树的绝对路径和验收完成后的**完整最终 commit OID**，不用移动分支名。读取源信息：

```bash
SOURCE_REPO='/绝对路径/准备工作树'
SOURCE_OID='填入最终源码commit的完整40位OID'
git -C "$SOURCE_REPO" rev-parse --show-toplevel
git -C "$SOURCE_REPO" rev-parse --absolute-git-dir
git -C "$SOURCE_REPO" rev-parse --path-format=absolute --git-common-dir
git -C "$SOURCE_REPO" worktree list --porcelain
git -C "$SOURCE_REPO" cat-file -t "$SOURCE_OID"
git -C "$SOURCE_REPO" rev-parse "$SOURCE_OID^{tree}"
git -C "$SOURCE_REPO" ls-tree -r --full-tree "$SOURCE_OID"
```

操作者必须确认 OID 是预期 commit，保存源 tree OID 和公开文件清单；复核不存在子模块、符号链接、特殊条目或归档属性造成的意外导出行为。不能确认时停止。清单不得含外层 `skills/`、旧演示材料、用户项目、秘密、缓存、日志、构建产物或新增自动快照工具；不要排除原有产品测试。

逐个解析并记录所有已知工作树（原 main、旧 prep、新 simple 及枚举到的其他工作树）、各自 git-dir、共享 common-dir、独立 metadata 根和软链接别名的实际绝对路径；不能只检查当前源。选择一个**不在上述任何根内**的仓外受控父目录，解析父目录软链接并人工比较包含关系，确认目标不是根目录、未存在（也不是悬空软链接），父目录不会被并发替换。不要在任何原资料目录内创建、覆盖、删除或移动内容。路径不明或存在额外 Git 布局时先调查，不猜测安全。

## 导出固定树并建立独立提交

仅在上述人工路径验收完成后，明确填入全新的目标绝对路径；父目录须已存在且受操作者控制。`mkdir` 不带 `-p`，已有目标即停止。`git archive` 只读取固定 OID 的跟踪树，不复制 `.git`、未提交或未跟踪文件。

```bash
SNAPSHOT_DIR='/绝对路径/受控仓外父目录/全新源码候选'
mkdir -- "$SNAPSHOT_DIR"
set -o pipefail
git -C "$SOURCE_REPO" archive --format=tar "$SOURCE_OID" | tar -xf - -C "$SNAPSHOT_DIR"
```

若导出失败，保留部分目录供调查，不发布、不覆盖、不清理原资料。导出后逐文件人工复核内容和模式；确认目标没有 `.git`，且环境与配置已核验，再初始化。以下命令忽略系统/全局配置、禁用模板/hooks 和签名；不更改全局配置。若 shell 中仍有 Git 环境覆盖，先停止处理。

```bash
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null
export GIT_AUTHOR_NAME='Mova contributors' GIT_COMMITTER_NAME='Mova contributors'
export GIT_AUTHOR_EMAIL='mova-contributors@example.invalid' GIT_COMMITTER_EMAIL='mova-contributors@example.invalid'
git -C "$SNAPSHOT_DIR" init --template= --initial-branch=main
git -C "$SNAPSHOT_DIR" -c core.hooksPath=/dev/null add --all --force
git -C "$SNAPSHOT_DIR" -c core.hooksPath=/dev/null -c commit.gpgSign=false commit -m 'Initial public source snapshot'
```

`example.invalid` 是匿名保留域，不代表 GitHub 账号或可联系邮箱。核验并记录：

```bash
git -C "$SNAPSHOT_DIR" rev-list --count HEAD
git -C "$SNAPSHOT_DIR" rev-list --parents -n 1 HEAD
git -C "$SNAPSHOT_DIR" rev-parse 'HEAD^{tree}'
git -C "$SNAPSHOT_DIR" show -s --format=fuller HEAD
git -C "$SNAPSHOT_DIR" for-each-ref --format='%(refname)'
git -C "$SNAPSHOT_DIR" remote -v
git -C "$SNAPSHOT_DIR" status --porcelain=v1 --untracked-files=all
git -C "$SNAPSHOT_DIR" ls-files
```

必须由人工确认：提交数恰为 1；parents 输出只有候选自身 OID；候选 tree 与已记录源 tree 完全相同；author/committer 均为上述匿名身份；唯一 ref 为 `refs/heads/main`，无旧 refs、无 remote，工作区干净。tree 不同（例如 export-ignore/export-subst、filters 或文件模式变化）就停止调查，不能接受近似一致。

用已获准的离线秘密扫描工具检查候选跟踪内容，再人工复核文件清单与命中；关注凭据、私钥、个人路径/邮箱、真实聊天与用户资料。记录工具版本、扫描范围、跳过文件、exit code 与脱敏结论，证据留在仓外；不得记录命中秘密值。测试 mock 假值要区分，真凭据先撤销/轮换。有限扫描及人工复核不是完整审计，零命中不证明无秘密，二进制/非 UTF-8 等未覆盖范围须明确。不要在发布文档中嵌入复杂秘密正则或新增扫描工具。

## 验收后的网络发布交接

- [ ] 保存源 OID/tree、候选 OID/tree、单提交/身份/refs/无 remote/clean 证据，以及内容与有限秘密检查结果。
- [ ] 独立红队复核发布边界，独立产品验证者记录实际测试结果；不因静态契约通过就宣称产品或真实 API 已验证。
- [ ] 后续执行者只读重新检查目标 `https://github.com/CongliangK/mova.git` 仍无 refs，核对所有权和用户授权。若已有 refs，停止请用户决策，不 force、不 mirror。
- [ ] 仅在全部验收通过后，从仓外独立候选将唯一 `main` 分支普通推送至该明确 URL，不推 tags、不推其他 refs；绝不从原仓库 push。推送后核对远端 OID 与候选一致。此处不执行推送，也不声称已发布。

## 技术门禁与证据边界

- [ ] 固定 `.node-version`、应用 `packageManager`、`rust-toolchain.toml`；干净环境 frozen install / Cargo `--locked` 不修改锁文件。
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test:release` / `pnpm test` / `pnpm build`，保存 exit code 和测试计数，不缩减原有产品测试。
- [ ] Linux 桌面构建/交互另行验证；其他平台未原生验证不得标注支持保证。二进制审查仅在分发二进制时适用。
- [ ] 用专门测试项目验证文件、画布/帧、导出、Git、工具写文件。真实 LLM/图像 API 需单独授权与预算，不用生产秘密，无凭据不假称端到端通过。
- [ ] CI 保持最小 `contents: read`，仅验证，不签名、发布、部署或安装用户程序。

旧历史可能包含当前树已无的演示或私人材料；忽略规则不清除旧对象，所以不得从原仓推送。本轮不重写历史、不扫描或保证全部历史/外部副本无秘密。最终发布验收以实际候选与证据为准，不能以文档步骤代替执行结果。
