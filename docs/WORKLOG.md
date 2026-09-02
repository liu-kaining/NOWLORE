# NOWLORE 工作日志

规则：记录所有有意义的研究、决策、实现、验证和失败；不记录密钥、私钥或其他秘密。时间为 Asia/Shanghai。

## 2026-09-01

### 需求确认

- 项目正式命名 NOWLORE，Git 仓库位于当前目录。
- 用户要求文档先行、文档落盘、全程留痕、无需逐项确认。
- AI 配置不绑定供应商：支持 Anthropic 与 OpenAI 两类协议，Base URL、model、API key 均可配置；当前不创建密钥。

### 仓库检查

- 初始仓库只有 `README.md` 和 `LICENSE`，main 跟踪 origin/main，无工作区改动。
- 未发现仓库级或父级 `AGENTS.md`。
- 未发现可用 `OPENAI_API_KEY`；已由用户决定暂不创建，使用配置适配器与 mock 测试。

### 协议研究

- OpenAI 官方文本生成文档确认 Responses 路径 `/v1/responses` 及 Bearer 认证；另为通用兼容服务设计 Chat Completions 适配器。
- Anthropic 官方 Messages 文档确认 `/v1/messages`、model、max_tokens 和版本头模式。
- Solana 官方 RPC 文档确认 `sendTransaction` 的 preflight 与 `maxRetries`；设计要求发送前模拟且禁止 skip preflight。
- Pump 官方 `pump-public-docs` 和 npm 元数据确认使用 `@pump-fun/pump-sdk`；当前 `create_v2` 文档约束 name 32、symbol 13、URI 200，支持 SOL 与其他 quote mint。MVP 选择 SOL 配对、mayhem=false、cashback=false、无创建者首购。
- Hugging Face Hub API 可作为公开模型趋势信号；Polymarket 只读 Gamma 市场数据，不进行预测市场交易。

### 文档基线

- 创建文档罗盘、PRD、架构、数据模型、API、安全、部署、测试计划。
- 创建三个 ADR：单体模块化架构、供应商可替换 AI、主网人工审批。
- 完成本地 Markdown 链接检查，未发现断链；文档基线共 989 行。

### 工程骨架

- 增加 Node/TypeScript/Vite/Fastify 工程配置、环境变量模板、Docker 与 Cloud Build 基线。
- 首次 `npm install` 失败：用户级 npm cache 存在权限异常，使 TypeScript 元数据读取失败并表现为 peer dependency 冲突。未使用 `--force` 或 `--legacy-peer-deps`；改为仓库内被忽略的 `.npm-cache`，保证安装可复现且不破坏用户全局缓存。
- 下一步：完成依赖安装、领域模型与存储实现。

### 核心实现

- 完成严格领域 Schema、项目状态机、公平发行校验、内容哈希与只追加审计哈希链。
- 完成 Memory、原子 JSON 与 Firestore 集合存储适配器。
- 完成 RSS、Polymarket、Hacker News、Hugging Face 数据源和人工信号入口。
- 完成去重、主题聚类、启发式评分、任务 lease 和来源失败隔离。
- 完成 OpenAI Responses、OpenAI-compatible Chat Completions、Anthropic Messages 与 deterministic mock 适配器。
- 完成 Oracle 风险评估、Forge 发行包、审批/撤销、SVG/metadata、本地/R2 资产发布。
- 完成 dry-run 与 Pump 官方 SDK `create_v2` 适配、Local/GCP KMS 签名接口、模拟、发送、确认、幂等和 creator vault 追踪。
- 完成 Fastify 公共/管理/调度 API、认证、限流、脱敏错误与 React 公共档案/运营控制台。
- TypeScript strict 首次检查已通过。

### 测试记录

- 首次 Vitest 执行未找到测试：Vite 的前端 `root=src/web` 被 Vitest 继承。新增独立 `vitest.config.ts`，把测试 root 明确固定为仓库根目录；不是业务测试失败。
- 修复配置后 7 个测试文件、16 个用例全部通过，覆盖领域、AI 响应解析、SSRF、审计、完整工作流和 HTTP 认证。
- ESLint 首次发现 3 个静态问题（两个未使用声明与 control-regex 规则），已逐项修复；随后 lint、typecheck 和前后端 production build 全部通过。
- 离线 smoke 完成 discovery → assessment → design → review → approve → assets → simulate → launch → track，审计链 11 个事件有效。
- 构建产物实际入口为 `dist/server/server/index.js`；已同步修正 npm start 与 Docker CMD，避免部署后入口偏差。

### 实际运行验证

- 用三个真实公开端点进行低量契约测试：Polymarket、Hacker News、Hugging Face 均成功；3 个来源共返回 9 条信号，聚合成 5 个主题，mock AI 生成 5 份评估和 3 个草稿。未发送链上交易。
- 启动 production build，通过应用内浏览器检查公开首页与运营台；统计 API、管理认证和空档案状态均正常，控制台无 browser error/warning。
- 检查 390×844 手机视口，Hero、Radar、中文文案与 CTA 无横向溢出；测试后已恢复浏览器视口并关闭临时标签页。
- 首次 Docker build 检查发现构建上下文为 521 MB：仓库级 npm cache 虽已 Git ignore，但漏加到 `.dockerignore`。主动中止该次构建，补充 `.npm-cache` 排除后重新验证，避免 CI 上传无用缓存。
- 镜像成功构建后，Node 22 容器启动暴露 Pump 1.36 的 CJS/ESM 兼容问题：其 agent-payments 依赖从 Anchor CommonJS 读取具名 `BN`，在本机 Node 25 可运行、Node 22 失败。改为动态加载 Pump 边界，并由 tsup 定点打包官方 Pump SDK，既保证 dry-run 不加载链依赖，也统一 Node 22 模块互操作；随后重建验证。

### 依赖安全审计

- 首次生产依赖审计：19 条（7 high、12 moderate、0 critical）。
- 升级 `@fastify/static` 至 10.1.3，消除路径穿越/路由守卫绕过；升级 `@google-cloud/firestore` 至 9.0.1，移除旧 Google 依赖链告警。
- 复审计降至 13 条（6 high、7 moderate、0 critical）。剩余告警来自当前官方 Pump/Solana v1 工具链；npm 只提供会破坏 `create_v2` 兼容性的降级建议，因此未强行消警。
- 新增 `docs/KNOWN_RISKS.md`，记录具体风险、可达性、缓解措施和主网上线前清单；主网能力继续默认关闭。
