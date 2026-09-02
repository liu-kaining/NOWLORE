# 部署与运维设计

## 1. 环境

`development`：JSON 存储、local assets、mock AI、dry-run chain。  
`staging`：独立 Firestore/R2、可选真实 AI、Solana devnet、签名额度极低。  
`production`：独立 GCP 项目/服务账号、Firestore/R2、Solana mainnet；主网开关默认 false。

## 2. 配置分组

```dotenv
NODE_ENV=development
PORT=8080
PUBLIC_BASE_URL=http://localhost:8080
CORS_ORIGINS=http://localhost:8080
ADMIN_TOKEN=replace-me
CRON_TOKEN=replace-me-too

STORE_DRIVER=json
JSON_STORE_PATH=./data/nowlore.json
FIRESTORE_PROJECT_ID=

AI_PROTOCOL=mock
AI_BASE_URL=
AI_MODEL=mock-v1
AI_API_KEY=
AI_TIMEOUT_MS=30000

RSS_FEEDS=
POLYMARKET_ENABLED=true
HACKERNEWS_ENABLED=true
HUGGINGFACE_ENABLED=true

ASSET_DRIVER=local
ASSET_PUBLIC_BASE_URL=http://localhost:8080/assets
R2_ENDPOINT=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_PUBLIC_BASE_URL=

CHAIN_MODE=dry-run
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_MAINNET_ENABLED=false
SIGNER_MODE=disabled
SOLANA_PRIVATE_KEY=
GCP_KMS_KEY_NAME=
```

实际 `.env.example` 是配置 Schema 的可复制示例；秘密值不得提交。

## 3. GCP

推荐资源：

- Cloud Run：最小实例 0，按需扩容；API 与前端同容器。
- Firestore Native：区域尽量与 Cloud Run 一致。
- Secret Manager：AI、R2、管理员、cron 与 signer 分离秘密。
- Cloud Scheduler：发现每 5 分钟、pipeline 每 10 分钟、track 每 2 分钟；以 OIDC 或 cron token 调用。
- Artifact Registry / Cloud Build：构建固定 digest 镜像。
- Cloud Logging：JSON 日志与错误率告警。

服务账号最小权限：运行 API 的账号只能访问其 Firestore 数据库、指定秘密和日志；签名服务账号不具备数据库管理权限。

## 4. Cloudflare

- DNS：`nowlore.thetamind.ai` 指向 Cloud Run 自定义域或 Load Balancer。
- CDN：缓存 `/assets/*` 和 GET `/api/public/*`；管理与 jobs 不缓存。
- WAF/Rate Limit：保护登录和写接口；阻止明显扫描。
- Access：`/ops` 与 `/api/admin/*` 仅团队身份；应用 token 仍保留。
- R2：公开 bucket 通过独立 custom domain；写凭证只在 Cloud Run。
- Turnstile：未来若开放公众投稿再启用。

## 5. 部署步骤

1. 执行 lint、typecheck、test、build。
2. 构建 Docker 镜像并记录 Git SHA、依赖 lock hash。
3. 部署到 staging，执行 smoke 与 devnet 模拟。
4. 更新 WORKLOG/CHANGELOG，审核配置 diff。
5. 部署 production，但保持 `SOLANA_MAINNET_ENABLED=false`。
6. 检查公开账本、审计链、任务和资产访问。
7. 只有运营审批时短时启用主网能力；发行后可再次关闭。

## 6. 备份与恢复

- Firestore 每日导出到版本化 GCS bucket，保留 30 天。
- R2 资产使用内容寻址 key，启用 object versioning。
- 审计事件每日导出并记录末端哈希。
- 恢复演练：新项目导入 Firestore → 校验审计链 → 对账链上 mint/交易 → 切换只读流量。

链上记录不可恢复或删除；数据库恢复后必须以链上状态为最终依据补齐快照。

## 7. 成本控制

- Cloud Run min instances=0；采集器限制并发与超时。
- 先启用低成本/免费公开数据源。
- 启发式评分过滤后才调用 AI；同 inputHash 缓存。
- 先小模型评估，只有高分候选进入设计。
- R2 存储内容寻址资产，避免重复。

不将“节省成本”作为降低签名安全、跳过模拟或缩短审计保留的理由。
