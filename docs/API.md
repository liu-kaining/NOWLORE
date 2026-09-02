# HTTP API 契约

前缀：`/api`。请求和响应为 JSON；错误统一为：

```json
{
  "error": {
    "code": "PROJECT_NOT_APPROVED",
    "message": "Project must have a matching approval",
    "requestId": "req_...",
    "details": {}
  }
}
```

## 1. 公共接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 存活检查 |
| GET | `/readyz` | 脱敏能力检查 |
| GET | `/api/public/stats` | 工作室统计 |
| GET | `/api/public/projects` | 已公开项目列表，支持 status/cursor/limit |
| GET | `/api/public/projects/:idOrSlug` | 项目、来源、评估摘要、发行和快照 |
| GET | `/api/public/ledger` | 审计账本公开视图 |
| GET | `/api/public/signals` | 已公开且被项目引用的信号 |

公开接口隐藏：内部风险推理、管理员 ID、请求头、错误堆栈、未发布项目和所有秘密。

## 2. 管理认证

管理接口请求头：`Authorization: Bearer <ADMIN_TOKEN>`。定时任务使用 `Authorization: Bearer <CRON_TOKEN>`。使用恒定时间比较；失败统一返回 401，避免泄露 token 是否接近正确。

Cloudflare Access 可作为公网第一层，但不能替代应用 token。

## 3. 管理接口

| 方法 | 路径 | 输入/行为 |
|---|---|---|
| GET | `/api/admin/capabilities` | 返回脱敏配置状态 |
| GET | `/api/admin/overview` | 控制台需要的信号、主题、项目、发行与任务聚合视图 |
| GET | `/api/admin/signals` | 全部候选信号和主题 |
| POST | `/api/admin/signals` | 人工导入 `{title,summary,url,publishedAt,tags}` |
| POST | `/api/admin/discover` | 运行发现任务 |
| POST | `/api/admin/topics/:id/evaluate` | 创建不可变 Assessment |
| POST | `/api/admin/topics/:id/design` | 由最新合格评估创建 Project |
| PATCH | `/api/admin/projects/:id` | 编辑 draft/reviewed 项目，revision +1 |
| POST | `/api/admin/projects/:id/review` | 标为 reviewed |
| POST | `/api/admin/projects/:id/approve` | `{expectedContentHash, reason}` |
| POST | `/api/admin/projects/:id/reject` | `{reason}` |
| POST | `/api/admin/projects/:id/revoke` | `{reason}` |
| POST | `/api/admin/projects/:id/assets` | 生成并发布 SVG/metadata |
| POST | `/api/admin/projects/:id/simulate` | 模拟发行，不发送 |
| POST | `/api/admin/projects/:id/launch` | 头 `Idempotency-Key`，执行已批准发行 |
| POST | `/api/admin/projects/:id/refresh` | 刷新链上状态和费用快照 |
| POST | `/api/admin/pipeline/run` | `{maxTopics, autoDesign}` 完整运行至 draft |
| GET | `/api/admin/runs` | 任务运行与错误 |
| GET | `/api/admin/audit/verify` | 验证审计哈希链 |

`PATCH project` 允许字段白名单：name、symbol、tagline、thesis、description、visualPrompt、websiteCopy、socialDrafts、实验时间和披露。不得通过 API 修改 creator wallet、team allocation、network 或历史记录。

## 4. Job 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/jobs/discover` | cron token；采集并聚类 |
| POST | `/api/jobs/pipeline` | cron token；评估新主题并生成草稿 |
| POST | `/api/jobs/track` | cron token；刷新已发行项目 |

若已有同类有效 lease，返回 409 `JOB_ALREADY_RUNNING`。

## 5. 幂等与并发

- 服务端为每个请求生成独立 requestId；客户端请求 ID 不作为权限或幂等依据。
- Project 编辑需要 `If-Match: <contentHash>`，冲突返回 412。
- Launch 必须带 8–128 字符 `Idempotency-Key`。服务端只保存其哈希。
- 相同 project + idempotency key 返回原 LaunchRecord；不同 key 在已提交后返回 409。

## 6. 限制

- JSON body 256 KiB。
- API 默认按代理解析后的客户端地址每分钟 200 次；生产再由 Cloudflare WAF 对登录、admin 与 jobs 设置更严格规则。
- manual summary 最大 4,000 字符；URL 2,048；project description 4,000。
- 列表 limit 默认 20，最大 100。
