# ADR-0002：AI 协议与业务解耦

日期：2026-09-01  
状态：Accepted

## 背景

用户已有多种模型服务，要求 Base URL、model、API key 可配置，并同时支持 Claude 与 OpenAI 类型协议。

## 决策

实现 `openai-responses`、`openai-chat`、`anthropic` 与 `mock` 四种 provider。业务层只接收经过 Zod 校验的结构化结果；协议层不包含热点评分和风险政策。

## 结果

可以连接 OpenAI 官方、OpenAI-compatible 网关、Anthropic 官方或兼容网关。无 key 时系统仍可运行演示与测试。不同供应商的结构化输出差异由统一解析/重试层承担。
