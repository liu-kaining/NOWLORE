# 已知风险与上线前清单

最后更新：2026-09-02

## 1. 供应链审计

生产依赖执行 `npm audit --omit=dev` 后：0 critical、6 high、7 moderate。直接告警只剩：

- `@pump-fun/pump-sdk@1.36.0`：由其 Anchor、PumpSwap、SPL Token、Solana Web3 传递依赖形成。
- `@solana/web3.js@1.98.4`：其 JSON-RPC 依赖存在 moderate 告警。

其中 high 的具体根告警主要是 `bigint-buffer <=1.1.5` 的 `toBigIntLE` Buffer Overflow。NOWLORE 当前创建流程不把用户控制的任意 Buffer 交给该函数，但这仍是供应链风险。

npm 提议把 Pump SDK 降到 `1.1.0`、Solana Web3 降到 `0.0.3` 才能消警。这些版本不符合当前 Pump `create_v2`/Token-2022 集成，属于破坏性且不安全的“修复”，因此没有采用。

已经完成的修复：

- `@fastify/static` 从 8.x 升至 10.1.3，修复路径穿越/路由保护绕过告警。
- `@google-cloud/firestore` 升至 9.0.1，移除旧 google-gax 依赖链告警。
- 审计总数从 19（7 high/12 moderate）降至 13（6 high/7 moderate），无 critical。

## 2. 风险缓解

- `CHAIN_MODE=dry-run`、`SIGNER_MODE=disabled`、`SOLANA_MAINNET_ENABLED=false` 为默认值。
- Pump SDK 仅用于固定 program ID 的 `createV2Instruction`，NOWLORE 再次核对返回 program ID。
- 交易输入字段经过长度/格式、审批哈希和 HTTPS URI 校验；不解析用户上传的链上账户 Buffer。
- 发送前进行 RPC 模拟，preflight 不跳过，重试次数受限。
- 发送或确认结果不明时记录确定性交易签名并进入 submitted；tracker 确认最终状态前禁止重发。
- Pump/Solana 依赖固定在 lockfile；任何升级都必须重新运行测试、devnet 模拟和本审计。

## 3. 上线前必须完成

- 等待 Pump 官方工具链发布消除相关告警的兼容版本，并在 devnet 验证升级。
- 对签名器与 Pump 构建路径做独立安全审查。
- 使用专用、限额、可快速轮换的钱包；生产优先独立 KMS signer 服务。
- 获取目标运营辖区的法律意见，明确地域、税务、广告、消费者保护与知识产权政策。
- 先在 devnet 进行人工发行演练；主网不属于自动化测试范围。

## 4. 功能边界

- Creator Fee “累计”目前通过 creator-vault 当前余额快照观测；“已领取累计值”保持 0，直到接入链上领取事件索引器。公开 UI 不会把余额误称为历史累计收入。
- 微信公众号没有默认公共采集器，通过合法 RSS、签名 Webhook（后续）或人工信号导入。
- JSON Store 适合单实例本地环境；多实例生产使用 Firestore。
