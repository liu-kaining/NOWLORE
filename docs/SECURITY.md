# 安全、合规与风险边界

## 1. 威胁模型

关键资产：Solana 签名权、管理员/cron token、AI API key、R2 凭证、未发布创意、审计记录和发行幂等状态。

主要威胁：密钥泄露、提示注入、恶意 RSS/URL、SSRF、重复发行、审批后篡改、供应链升级、RPC 欺骗、日志泄密、虚假市场活动和违法/侵权内容。

## 2. 密钥规则

- `.env*`、keypair、GCP credential 文件全部 Git ignore。
- 禁止在 UI、数据库、审计 payload、异常消息或日志中返回秘密。
- 生产使用 Secret Manager；AI/R2/管理员凭证分别授权。
- 签名器默认 `disabled`。本地 key 仅开发使用；生产优先独立服务或 GCP KMS Ed25519。
- 创建者钱包只保留必要 SOL，不与团队金库或个人主钱包复用。
- 每次 launch 前检查网络、fee payer、公钥、余额与批准内容哈希。

## 3. 不可逆动作闸门

必须同时满足：

1. Project 状态至少 reviewed；
2. 最新 Approval 为 approved；
3. approval.contentHash 等于当前 project.contentHash；
4. 资产 HTTPS 可访问且哈希匹配；
5. `CHAIN_MODE=pump`；
6. 若 mainnet，`SOLANA_MAINNET_ENABLED=true`；
7. Signer configured 且公钥等于公开 creator wallet；
8. 最近模拟成功且未过期；
9. 幂等键存在且没有冲突；
10. 风险门槛仍通过。

任一条件失败都不得签名。

## 4. 内容与市场行为政策

系统禁止：

- 虚假陈述来源、伪造人物背书或冒充官方组织；
- 利用死亡、灾难、未成年人、仇恨或针对个人的骚扰牟利；
- 承诺回报、内部消息、价格目标或“稳赚”；
- 隐瞒团队持仓、关联钱包、首购或创作者费用；
- wash trading、对刷、刷量、抢跑、捆绑钱包、虚假社区人数；
- 规避 Pump、Solana、云平台、数据源或辖区规则；
- 在明确版权/商标风险下自动发布受保护资产。

政治、重大公共安全、人物健康/死亡、未决犯罪指控默认 require manual legal review，MVP 直接阻止主网发行。

## 5. 外部内容安全

- RSS/网页文字视为不可信数据，不作为系统指令。
- AI prompt 明确分隔 evidence；忽略 evidence 内的指令。
- URL 只允许 http/https，阻止 URL 凭据、localhost、私网、link-local、文档示例网段和 GCP metadata 地址；请求前解析全部 A/AAAA 结果，每次重定向重新校验。生产环境仍需用 VPC egress/防火墙作为 DNS 重绑定的最终边界。
- 采集器不跟随跨协议重定向，最多跟随 4 次经重新校验的重定向；跨域时移除 Authorization/Cookie，并对流式响应执行真实字节上限和内容类型白名单。
- SVG 由本地模板生成，不嵌入外部脚本、foreignObject 或任意 HTML。

## 6. API 安全

- Helmet 安全头与限制性 CSP：脚本、样式和连接仅同源，图片允许同源/data/HTTPS，禁止 object、内联事件与第三方 framing。
- 严格 CORS allowlist、256 KiB body limit。
- 管理 token 恒定时间比较，写接口限流。
- 错误响应不含堆栈；日志自动脱敏 authorization/api-key/private-key/cookie。
- 后续若启用 webhook，必须使用 HMAC-SHA256 + timestamp 防止重放；当前版本不开放 webhook 路由。
- 审计日志使用哈希链并只追加。

## 7. 链上安全

- 只使用固定 Pump program ID 与官方 SDK lockfile 版本。
- 交易构建后检查所有 program IDs、fee payer、mint signer、creator、metadata URI 和指令数量。
- 模拟失败、日志出现自定义程序错误或 blockhash 过期时不发送。
- `sendRawTransaction` 开启 preflight，不使用 `skipPreflight=true`。
- 发送超时时保存并查询已签名交易的确定性签名，状态保持 submitted，禁止直接创建第二个 mint 作为“重试”。
- 系统不保存助记词；本地私钥支持 base58/JSON 但永不输出。

## 8. 法律提醒

软件的透明设计不等于满足任何特定辖区的证券、消费者保护、广告、知识产权、制裁、税务或数据保护要求。生产发行前应取得针对目标用户与运营主体所在地的专业法律意见，并配置地域与内容政策。该提醒不构成法律意见。

## 9. 事件响应

疑似泄密：关闭 mainnet 开关 → 撤销 API/R2/admin 凭证 → 转移签名钱包余额 → 禁用 signer → 保全审计日志 → 复盘并轮换全部关联秘密。

疑似重复/错误发行：立即停止任务和 signer；不得删除记录；公开标记 incident；查询链上最终状态并发布更正。

## 10. 当前供应链状态

Pump/Solana v1 依赖链仍存在 npm advisory，兼容修复尚不可用。详细审计、不可采用的降级建议和上线前要求见 [KNOWN_RISKS.md](KNOWN_RISKS.md)。在该风险被独立复核前，不应把默认主网开关改为 true。
