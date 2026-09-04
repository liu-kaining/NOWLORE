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

## 2026-09-02

### Node 22 / Pump 发行边界

- 延续 Docker 生产验证。定点打包 Pump SDK 后，专项 Pump 模式先暴露动态 `require("buffer")`，注入 ESM require bridge 后又暴露 SDK 内部 `exports` 语义冲突；两次均为模块加载失败，没有签名或网络交易。
- 最终不修改第三方包，使用 Node `createRequire` 显式选择 Pump 包公开的 CommonJS export；server 仍为 ESM，Pump 只在 `CHAIN_MODE=pump` 时动态加载。Node 22 镜像已能完整加载 SDK，并按预期停在 `SIGNER_DISABLED` 门禁。
- Pump 构建增加项目/配置网络一致性校验，并在构建交易前通过公开 HTTPS 重新读取 SVG/metadata，校验真实响应大小、content type、SHA-256 以及 metadata 的 name/symbol/image。
- 重构发送异常语义：签名完成后预先得到确定性交易签名；发送或确认结果不明时进入 submitted，不允许新交易覆盖。tracker 按签名将项目归并为 launched/failed，并追加审计事件。自动测试验证相同幂等键只调用一次链适配器。

### 安全与可靠性加固

- 外部采集 URL 增加 HTTP(S)-only、禁止 URL credential、私网/link-local/metadata/示例网段、DNS A/AAAA 校验、逐跳重定向验证、跨协议拒绝、跨域认证头移除、内容类型白名单及流式真实字节上限。
- 首次真实源复测被本地受控网络的 `198.18.0.0/15` 出站映射全部拦截；该区段不是 RFC1918/metadata，且此环境以它承载受控公网代理，因此不再作为应用层硬阻断。生产仍要求 VPC egress/防火墙作为最终 DNS 重绑定边界。
- Discovery 现在保留失败来源的真实 ID；有效 lease 返回结构化 409 `JOB_ALREADY_RUNNING`，新增故障隔离与 lease 测试。
- 所有外部链接字段限制为 HTTP(S)，避免人工信号把 `javascript:` 等 scheme 带入档案；无效单条 RSS/HN 项目会被丢弃而不会拖垮整个来源。
- 启用限制性 CSP。新增无效 URL API 测试时发现 Fastify 错误处理器注册晚于路由会把 ZodError 返回为 500；将处理器前置后稳定返回脱敏 400。
- 新增独立于模型的证据敏感词政策；死亡/暴力、灾难、未成年人、仇恨骚扰、政治冲突会强制 recommendation=reject，并抬高 legal/safety/brand 风险，防止模型漏判绕过。
- Project 编辑时同步实验窗口，结束时间必须为开始后的 1–720 个整小时。

### 产品与运维完善

- 运营台增加手工信号表单、项目证据/风险/来源展开；reviewed 项目必须主动勾选已核对证据、风险和内容哈希才能点击批准。
- 管理 overview 返回项目关联的 assessment、signals、launches、metrics，支持审核上下文。
- Cloud Build 默认部署配置改为实际可启动的安全 dry-run（Firestore/mock/local assets/disabled signer/devnet/mainnet off），管理员和 cron token 强制来自 Secret Manager；文档说明正式发行前再配置 R2/AI/RPC/signer。
- 增加 JSON Store 20 路并发写、0600 文件权限与重启恢复测试。

### 验证进度

- `npm run check` 全部通过：10 个测试文件、33 个用例；lint、TypeScript strict、production Web/Server build、离线端到端 smoke 均成功。
- 最终真实低量契约测试：Polymarket、Hacker News、Hugging Face 3/3 成功，共 9 条信号、6 个主题；评估 5 个，其中 design 1、watch 3、deterministic reject 1，生成 1 个草稿，无链上交易。
- 生产依赖审计保持 0 critical、6 high、7 moderate；全部剩余项属于已记录的 Pump/Solana v1 传递依赖链。
- 最终 Node 22 production 镜像构建成功；容器 `/healthz`、`/readyz`、公开 API、HTML/CSP 头均通过。镜像内直接调用官方 `createV2Instruction` 成功，program ID 为固定 Pump program，生成 16 个 account metas/106 bytes data；原生 bigint 可选 binding 缺失时 SDK 明确回退 pure JS，不影响该指令构建验证。
- 通过应用内浏览器复查最终 production 容器：公开首页正确加载统计/空档案，运营台 token 认证成功，新增手工信号表单可见，桌面布局正常；临时浏览器页和 `--rm` 验证容器均已关闭/移除，本地保留 `nowlore:local-check` 镜像便于复验。
- 将 Markdown 相对链接检查器加入 `npm run check`。首次纳入后 ESLint 指出脚本未显式声明 Node `process` 全局；改为 `node:process` 显式导入后复验。
- 文档检查脚本纳入工程配置后再次从零构建 `nowlore:local-check`，Node 22 build/runtime 两阶段镜像成功。首次探针复验误用了不存在的 `/api/health` 与 `/api/ready`，均按预期返回 404；随即依据源码改用正式 `/healthz`、`/readyz`，并连同 `/api/public/stats`、CSP/安全响应头全部验证通过。临时 `--rm` 容器已停止并自动移除。
