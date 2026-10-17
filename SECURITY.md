# Security

## 状态与边界

实验性项目，没有受支持版本、修复 SLA 或持续维护承诺。不要用于处理高敏感资料；先备份项目，不打开不可信目录，不把 AI 工具当成安全沙箱。

- 设置（含 API 密钥）持久化在 localStorage，未加密、未使用 OS keychain。
- 桌面 HTTP capability 允许 HTTP/HTTPS，CSP 允许 HTTPS、localhost 和 inline 脚本/样式；asset scope 包含 HOME/TEMP。原生文件和 AI 工具需要谨慎授权；不能声称完全隔离。
- 聊天/工具结果可能包含项目内容、路径及图像并发送至配置的外部端点。不要向未知端点提供密钥；优先 HTTPS、低额度、可撤销密钥。
- 依赖与模型可能产生安全或隐私风险；离线测试不证明云服务安全。

## 报告漏洞

**不要在公开 Issue、PR、截图或日志中发布密钥、私人文件、完整利用步骤。** 真实仓库为 [CongliangK/mova](https://github.com/CongliangK/mova)，拟使用 GitHub 的[私密漏洞报告入口](https://github.com/CongliangK/mova/security/advisories/new)（Security → Report a vulnerability）。**是否启用尚需核实，不能保证该入口可用或已开启。** 当前没有确认的备用私密联系地址/报告邮箱。

如私密入口不可用，不要猜测邮箱或公开敏感细节；先仅以不含细节的普通咨询请求权利人提供私密通道，或等待通道建立。发布前必须由权利人确定真实报告渠道，见 [发布清单](docs/RELEASE_CHECKLIST.md)。

报告尽量包含受影响 commit/版本、平台、最小复现、影响与脱敏日志。不承诺回复时限。凭据意外暴露时，先由凭据持有人撤销/轮换，再评估历史清理；仅删除当前文件不能撤回已公开的秘密。本次准备不重写历史。
