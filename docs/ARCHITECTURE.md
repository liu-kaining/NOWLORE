# 系统架构

## 1. 技术基线

- Node.js 22、TypeScript strict、单仓库单 package。
- Fastify 提供 API、静态站点和任务入口。
- React + Vite 提供公开账本与运营控制台。
- Zod 作为环境、API 和 AI 结构化输出的共同校验层。
- 本地使用原子 JSON 存储；生产使用 Firestore 适配器。
- Vitest 覆盖领域、适配器、API 与安全状态机。
- Docker 单镜像部署到 GCP Cloud Run，Cloudflare 位于公网入口。

选择单 package 是为了低预算和快速迭代；领域模块仍通过 TypeScript 接口隔离，未来可按负载拆为 worker、API 与 signer 服务。

## 2. 目录规划

```text
src/
  config/       环境解析与能力检查
  domain/       实体、Schema、状态机、错误
  lib/          日志、HTTP、哈希、时间、重试
  storage/      Memory / JSON / Firestore 存储
  sources/      RSS / Polymarket / HN / HF / Manual
  ai/           OpenAI Responses / Chat / Anthropic / Mock
  pipeline/     discovery / scoring / evaluation / design
  assets/       SVG 与 metadata 生成、Local / R2 发布
  chain/        DryRun / Pump SDK、Signer、Tracker
  services/     用例编排与审计
  server/       Fastify 插件和路由
  web/          React UI
  cli/          初始化、pipeline、追踪命令
tests/
docs/
```

## 3. 运行拓扑

```text
Browser
   │ HTTPS
Cloudflare DNS/CDN/WAF/Access
   │
Cloud Run: NOWLORE API + Web
   ├── Firestore
   ├── R2 (S3 API)
   ├── Configured AI provider
   ├── Public data sources
   └── Solana RPC

Cloud Scheduler ── OIDC/cron secret ──► /api/jobs/*
```

生产签名建议最终拆成私有 Cloud Run `signer`，只接受来自 API 服务账号的已审批交易摘要。MVP 内置签名接口和本地/GCP KMS 实现边界；默认禁用真实签名。

## 4. 领域边界

### 4.1 SourceAdapter

```ts
interface SourceAdapter {
  id: string;
  fetch(context: FetchContext): Promise<RawSignal[]>;
}
```

适配器不写数据库；发现服务统一归一化、去重和审计。

### 4.2 AiProvider

```ts
interface AiProvider {
  descriptor(): PublicAiDescriptor;
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}
```

Provider 只负责协议转换与解析。业务提示词、Schema 和风险门槛属于 Oracle/Forge 服务。

### 4.3 Store

```ts
interface Store {
  transact<T>(mutation: (state: DatabaseState) => T | Promise<T>): Promise<T>;
  snapshot(): Promise<Readonly<DatabaseState>>;
}
```

JSON 实现串行化事务并原子替换。Firestore 实现使用事务和集合；业务层不依赖具体数据库。

### 4.4 AssetPublisher

接收不可变 asset bundle，返回公开 URL 与 SHA-256。`local` 仅供开发；`r2` 使用 S3 兼容 API和内容寻址 key。

### 4.5 LaunchAdapter

```ts
interface LaunchAdapter {
  simulate(input: LaunchInput): Promise<SimulationResult>;
  launch(input: LaunchInput): Promise<LaunchResult>;
  refresh(launch: LaunchRecord): Promise<ChainSnapshot>;
}
```

DryRun 生成确定性伪 mint/签名供端到端测试。Pump 实现只能接收已批准、已发布且内容哈希一致的项目。

## 5. 关键序列

### 5.1 自动发现至草稿

```text
Scheduler → DiscoveryService → SourceAdapters
DiscoveryService → Store: signals/topics/run/audit
Scheduler → EvaluationService → AiProvider
EvaluationService → Store: assessment/audit
[recommendation=design && risk below gate]
Scheduler → DesignService → AiProvider → Validator
DesignService → Store: project(draft)/audit
```

### 5.2 主网发行

```text
Operator → approve(project, expectedContentHash)
Operator → publishAssets(project)
Operator → simulate(project)
Operator → launch(project, idempotencyKey)
LaunchService → validate state/config/hash/balance
LaunchService → Pump SDK: createV2Instruction
LaunchService → Solana RPC: simulateTransaction
LaunchService → Signer: sign approved message
LaunchService → RPC: sendRawTransaction + confirm
LaunchService → Store: launch + immutable audit
```

## 6. 并发、幂等与失败恢复

- Signal ID 使用规范化来源 URL/标题的内容哈希，天然幂等。
- Topic 和 Project 使用随机 ID，关联对象使用显式外键。
- 周期任务使用 lease；过期 lease 可被接管。
- AI 调用保存 prompt version、provider、model 与输入哈希；同一输入可复用结果。
- 资产 key 包含内容 SHA-256，重复发布不重复上传。
- `launch` 要求客户端幂等键；相同项目与键返回已有结果。
- 发送交易前保存 `launching` 记录；发送/确认超时则保存预先可计算的签名并进入 `submitted`，由 tracker 按签名归并为 confirmed/failed，禁止盲目双发。
- 每个外部适配器有超时和受限重试；不可重试错误直接进入 run error。

## 7. 可观测性

结构化 JSON 日志字段：`time, level, requestId, runId, actor, action, entityType, entityId, durationMs, outcome, errorCode`。禁止记录 token、私钥、完整提示词中的潜在隐私或外部响应正文。

`/healthz` 只报告进程健康；`/readyz` 返回各能力 `configured | disabled | degraded`，不返回密钥或 URL 中凭证。

## 8. 协议依据与变化策略

- OpenAI 适配器使用官方 Responses `/v1/responses`；OpenAI-compatible 单独支持 `/v1/chat/completions`，避免假设所有兼容服务支持 Responses。
- Anthropic 使用 Messages `/v1/messages` 和相应版本头。
- Pump 发行使用官方 `@pump-fun/pump-sdk`，当前官方文档的 `create_v2` 要求 Token-2022 mint，name ≤32、symbol ≤13、URI ≤200，并提供 SOL/非原生 quote mint路径。
- Solana 发送前执行模拟，发送时配置 preflight commitment 与有限 `maxRetries`。
- 外部协议版本固定在 lockfile；升级必须更新 ADR、契约测试和工作日志。

参考：

- https://developers.openai.com/api/docs/guides/text
- https://docs.anthropic.com/en/api/messages
- https://solana.com/docs/rpc/http/sendtransaction
- https://github.com/pump-fun/pump-public-docs
