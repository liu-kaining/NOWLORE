# ADR-0001：采用模块化单体

日期：2026-09-01  
状态：Accepted

## 背景

NOWLORE 初期预算低，需要快速完成从采集到公开账本的闭环，同时未来可能把采集、API、追踪和签名拆开扩容。

## 决策

采用 Node.js + TypeScript 单 package、模块化单体。Fastify 同时服务 API 与 React 静态资源；内部通过 SourceAdapter、AiProvider、Store、AssetPublisher、LaunchAdapter 隔离。

## 结果

优点：部署简单、Cloud Run 成本低、端到端类型一致、容易本地运行。  
代价：后台任务与 API 初期共享进程；需要 lease 避免多实例重复；真正主网运营前建议拆独立 signer。
