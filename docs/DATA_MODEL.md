# 数据模型

所有时间使用 ISO 8601 UTC；金额保存最小单位整数的十进制字符串，避免 JavaScript 浮点误差。公开对象不包含任何秘密。

## 1. Signal

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 内容指纹 |
| source | string | 适配器 ID |
| sourceType | enum | rss/polymarket/hn/huggingface/manual/webhook |
| externalId | string? | 来源内部 ID |
| title | string | 标题 |
| summary | string | 清洗后的摘要 |
| url | URL | 原始链接 |
| publishedAt | datetime | 来源发布时间 |
| observedAt | datetime | 首次发现时间 |
| metrics | object | volume/score/comments/downloads 等数值 |
| tags | string[] | 来源标签 |
| rawHash | string | 原始规范化数据哈希 |
| topicId | string? | 聚类后的主题 |

## 2. Topic

字段：`id, canonicalTitle, keywords[], signalIds[], sourceCount, heuristicScore, freshnessScore, engagementScore, diversityScore, velocityScore, status, createdAt, updatedAt`。

Topic 状态：`new | queued | evaluated | archived`。

## 3. Assessment

字段：

- `id, topicId, inputHash, promptVersion`
- `providerProtocol, providerName, model`
- `summary, narrative, audience[], supportingEvidence[], counterEvidence[]`
- `scores`: memeability/timeliness/verifiability/originality/controversy/legal/safety/brand（0–100）
- `expectedWindowHours, confidence`
- `riskFlags[]`
- `recommendation`: reject/watch/design
- `createdAt`

评估是不可变记录；重新评估新建版本。

## 4. Project

字段：

- 标识：`id, sequence, slug`
- 关联：`topicId, assessmentId, signalIds[]`
- 内容：`name, symbol, tagline, thesis, description, visualPrompt, websiteCopy, socialDrafts[]`
- 实验：`experimentStartsAt, experimentEndsAt, disclaimers[], riskDisclosures[]`
- 发行：`network, quoteMint, creatorWallet, teamAllocation, creatorInitialBuy`
- 状态：`status, revision, contentHash`
- 审批：`approvalId?`
- 资产：`assetBundle?`
- 时间：`createdAt, updatedAt, publishedAt?`

`teamAllocation` 和 `creatorInitialBuy` 默认字符串 `"0"`。非零时必须有披露文本，MVP 拒绝非零值。

## 5. Approval

`id, projectId, projectRevision, contentHash, decision, actor, reason, createdAt`。

审批不更新或删除；撤销是新的 Approval 记录。LaunchService 只接受最新决策为 approved 且 hash 一致的项目。

## 6. AssetBundle

`posterUrl, posterSha256, metadataUrl, metadataSha256, metadata, publishedAt, publisher`。

Metadata 包括 `name, symbol, description, image, external_url, attributes`。属性写入 NOWLORE project ID、实验周期与透明度声明。

## 7. LaunchRecord

`id, projectId, idempotencyKeyHash, adapter, network, mint, creatorWallet, transactionSignature?, simulation, status, errorCode?, errorMessage?, createdAt, updatedAt, confirmedAt?`。

状态：`simulated | launching | submitted | confirmed | failed`。

`submitted` 表示 RPC 已返回签名或发送结果不确定但签名可知。该状态是防重复发行闸门：相同幂等键只返回原记录，不构造第二笔交易；tracker 按签名查询后转为 `confirmed` 或 `failed`。

## 8. MetricSnapshot

`id, projectId, launchId, observedAt, transactionStatus, creatorWalletLamports, creatorVaultLamports, collectedCreatorFeesLamports, source`。

快照只追加；公开页按时间排序并展示最近值。

## 9. AuditEvent

`id, sequence, occurredAt, actorType, actorId, action, entityType, entityId, requestId?, runId?, previousHash, payloadHash, details`。

AuditEvent 使用哈希链：`payloadHash = sha256(canonical(event without payloadHash))`，`previousHash` 指向前一事件。发现篡改时就绪检查进入 degraded。

## 10. JobRun

`id, kind, status, startedAt, finishedAt?, counters, errors[], leaseOwner?, leaseExpiresAt?`。

任务类型：`discover | evaluate | design | pipeline | track`。

## 11. DatabaseState

本地 JSON 结构：

```json
{
  "schemaVersion": 1,
  "signals": {},
  "topics": {},
  "assessments": {},
  "projects": {},
  "approvals": {},
  "launches": {},
  "metricSnapshots": {},
  "auditEvents": [],
  "jobRuns": {}
}
```

Firestore 使用对应集合，审计序列由事务内 counter 文档分配。
