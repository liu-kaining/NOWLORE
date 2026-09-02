# NOWLORE

> **Mint the moment. Keep the record.**  
> 把正在发生的，变成链上传说。

NOWLORE 是 ThetaMind 旗下的 AI 原生链上文化实验室。系统从公开信息源发现热点，使用可配置的大模型评估叙事与风险，生成 Meme 文化实验方案，在明确审批后通过 Solana / Pump 发行，并把来源、判断、钱包、交易与创作者费用持续写入公开账本。

本项目坚持：短周期文化实验、不承诺投资价值、公平发行、公开创作者身份与费用、禁止虚假交易和市场操纵。

## 文档入口

- [文档罗盘](docs/COMPASS.md)
- [产品需求](docs/PRD.md)
- [系统架构](docs/ARCHITECTURE.md)
- [数据模型](docs/DATA_MODEL.md)
- [API 契约](docs/API.md)
- [安全与合规边界](docs/SECURITY.md)
- [部署与运维](docs/DEPLOYMENT.md)
- [测试与验收](docs/TEST_PLAN.md)
- [已知风险与上线清单](docs/KNOWN_RISKS.md)
- [工作日志](docs/WORKLOG.md)
- [架构决策](docs/adr/)

## 当前状态

完整 MVP 已实现：公开档案、运营台、四类热点源、AI 双协议、审批工作流、资产发布、dry-run/Pump 发行适配和公开账本。工程实现与验证状态以 [工作日志](docs/WORKLOG.md) 和 [CHANGELOG](CHANGELOG.md) 为准。

## 本地运行

要求 Node.js 22+：

```bash
cp .env.example .env.local
npm ci
npm run dev
```

- Web 开发地址：`http://localhost:5173`
- API：`http://localhost:8080`
- 运营台：`http://localhost:5173/ops`

默认使用 `mock` AI、JSON 存储、本地资产和 `dry-run` 链，**不会发送真实交易**。

## 配置 AI

OpenAI Responses：

```dotenv
AI_PROTOCOL=openai-responses
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=<your-model>
AI_API_KEY=<your-key>
```

OpenAI-compatible Chat Completions：

```dotenv
AI_PROTOCOL=openai-chat
AI_BASE_URL=https://your-provider.example/v1
AI_MODEL=<your-model>
AI_API_KEY=<your-key>
```

Anthropic Messages：

```dotenv
AI_PROTOCOL=anthropic
AI_BASE_URL=https://api.anthropic.com/v1
AI_MODEL=<your-claude-model>
AI_API_KEY=<your-key>
```

## 验证

```bash
npm run check
```

该命令执行 lint、TypeScript strict、自动化用例、production build 和无网络/无密钥的端到端 smoke。

## 真实发行

真实 Pump 发行保持默认关闭。上线前依次配置 R2/HTTPS metadata、Solana RPC、隔离签名器，并显式设置 `CHAIN_MODE=pump`。Mainnet 还要求 `SOLANA_NETWORK=mainnet-beta` 和 `SOLANA_MAINNET_ENABLED=true`；每个项目仍必须经过内容哈希审批、资产发布和成功模拟。

依赖 Pump/Solana v1 工具链的供应链告警与上线前事项见 [已知风险](docs/KNOWN_RISKS.md)。
