import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return value;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}, z.boolean());

const optionalString = z.preprocess((value) => value === "" ? undefined : value, z.string().optional());
const httpUrl = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "Only http and https URLs are allowed");
const optionalHttpUrl = z.preprocess((value) => value === "" ? undefined : value, httpUrl.optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  PUBLIC_BASE_URL: httpUrl.default("http://localhost:8080"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://localhost:8080"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  ADMIN_TOKEN: z.string().min(12).default("local-admin-change-me"),
  CRON_TOKEN: z.string().min(12).default("local-cron-change-me"),

  STORE_DRIVER: z.enum(["memory", "json", "firestore"]).default("json"),
  JSON_STORE_PATH: z.string().default("./data/nowlore.json"),
  FIRESTORE_PROJECT_ID: optionalString,
  FIRESTORE_DATABASE_ID: z.string().default("(default)"),

  AI_PROTOCOL: z.enum(["mock", "openai-responses", "openai-chat", "anthropic"]).default("mock"),
  AI_BASE_URL: optionalHttpUrl,
  AI_MODEL: z.string().default("mock-v1"),
  AI_API_KEY: optionalString,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(180_000).default(30_000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(32_000).default(3_000),
  AI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),

  RSS_FEEDS: z.string().default(""),
  POLYMARKET_ENABLED: booleanFromEnv.default(true),
  POLYMARKET_BASE_URL: httpUrl.default("https://gamma-api.polymarket.com"),
  HACKERNEWS_ENABLED: booleanFromEnv.default(true),
  HUGGINGFACE_ENABLED: booleanFromEnv.default(true),
  SOURCE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  SOURCE_MAX_ITEMS: z.coerce.number().int().min(1).max(200).default(30),

  ASSET_DRIVER: z.enum(["local", "r2"]).default("local"),
  ASSET_LOCAL_PATH: z.string().default("./data/assets"),
  ASSET_PUBLIC_BASE_URL: httpUrl.default("http://localhost:8080/assets"),
  R2_ENDPOINT: optionalHttpUrl,
  R2_REGION: z.string().default("auto"),
  R2_BUCKET: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_PUBLIC_BASE_URL: optionalHttpUrl,

  CHAIN_MODE: z.enum(["dry-run", "pump"]).default("dry-run"),
  SOLANA_NETWORK: z.enum(["devnet", "mainnet-beta"]).default("devnet"),
  SOLANA_RPC_URL: httpUrl.default("https://api.devnet.solana.com"),
  SOLANA_MAINNET_ENABLED: booleanFromEnv.default(false),
  SOLANA_COMMITMENT: z.enum(["processed", "confirmed", "finalized"]).default("confirmed"),
  SOLANA_SIMULATION_TTL_SECONDS: z.coerce.number().int().min(30).max(3_600).default(600),
  SIGNER_MODE: z.enum(["disabled", "local", "gcp-kms"]).default("disabled"),
  SOLANA_PRIVATE_KEY: optionalString,
  GCP_KMS_KEY_NAME: optionalString,
  GCP_KMS_PUBLIC_KEY: optionalString,
});

export type AppConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const env = EnvSchema.parse(environment);
  const aiBaseUrl = env.AI_BASE_URL ?? (
    env.AI_PROTOCOL === "anthropic" ? "https://api.anthropic.com/v1" : "https://api.openai.com/v1"
  );

  if (env.NODE_ENV === "production") {
    if (env.ADMIN_TOKEN.length < 32 || env.CRON_TOKEN.length < 32) {
      throw new Error("Production ADMIN_TOKEN and CRON_TOKEN must be at least 32 characters");
    }
    if (env.ADMIN_TOKEN === env.CRON_TOKEN) {
      throw new Error("Production ADMIN_TOKEN and CRON_TOKEN must be different");
    }
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    publicBaseUrl: env.PUBLIC_BASE_URL.replace(/\/$/, ""),
    corsOrigins: env.CORS_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean),
    logLevel: env.LOG_LEVEL,
    adminToken: env.ADMIN_TOKEN,
    cronToken: env.CRON_TOKEN,
    store: {
      driver: env.STORE_DRIVER,
      jsonPath: env.JSON_STORE_PATH,
      firestoreProjectId: env.FIRESTORE_PROJECT_ID,
      firestoreDatabaseId: env.FIRESTORE_DATABASE_ID,
    },
    ai: {
      protocol: env.AI_PROTOCOL,
      baseUrl: aiBaseUrl.replace(/\/$/, ""),
      model: env.AI_MODEL,
      apiKey: env.AI_API_KEY,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      temperature: env.AI_TEMPERATURE,
    },
    sources: {
      rssFeeds: env.RSS_FEEDS.split(",").map((item) => item.trim()).filter(Boolean),
      polymarketEnabled: env.POLYMARKET_ENABLED,
      polymarketBaseUrl: env.POLYMARKET_BASE_URL.replace(/\/$/, ""),
      hackerNewsEnabled: env.HACKERNEWS_ENABLED,
      huggingFaceEnabled: env.HUGGINGFACE_ENABLED,
      timeoutMs: env.SOURCE_TIMEOUT_MS,
      maxItems: env.SOURCE_MAX_ITEMS,
    },
    assets: {
      driver: env.ASSET_DRIVER,
      localPath: env.ASSET_LOCAL_PATH,
      publicBaseUrl: env.ASSET_PUBLIC_BASE_URL.replace(/\/$/, ""),
      r2Endpoint: env.R2_ENDPOINT,
      r2Region: env.R2_REGION,
      r2Bucket: env.R2_BUCKET,
      r2AccessKeyId: env.R2_ACCESS_KEY_ID,
      r2SecretAccessKey: env.R2_SECRET_ACCESS_KEY,
      r2PublicBaseUrl: env.R2_PUBLIC_BASE_URL?.replace(/\/$/, ""),
    },
    chain: {
      mode: env.CHAIN_MODE,
      network: env.SOLANA_NETWORK,
      rpcUrl: env.SOLANA_RPC_URL,
      mainnetEnabled: env.SOLANA_MAINNET_ENABLED,
      commitment: env.SOLANA_COMMITMENT,
      simulationTtlSeconds: env.SOLANA_SIMULATION_TTL_SECONDS,
      signerMode: env.SIGNER_MODE,
      privateKey: env.SOLANA_PRIVATE_KEY,
      gcpKmsKeyName: env.GCP_KMS_KEY_NAME,
      gcpKmsPublicKey: env.GCP_KMS_PUBLIC_KEY,
    },
  } as const;
}

export function publicCapabilities(config: AppConfig) {
  return {
    environment: config.env,
    storage: config.store.driver,
    ai: {
      protocol: config.ai.protocol,
      model: config.ai.model,
      configured: config.ai.protocol === "mock" || Boolean(config.ai.apiKey),
    },
    assets: {
      driver: config.assets.driver,
      configured: config.assets.driver === "local" || Boolean(config.assets.r2Endpoint && config.assets.r2Bucket),
    },
    chain: {
      mode: config.chain.mode,
      network: config.chain.network,
      signerMode: config.chain.signerMode,
      mainnetEnabled: config.chain.mainnetEnabled,
    },
  };
}
