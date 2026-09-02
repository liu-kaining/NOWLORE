import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";
import { DryRunChainAdapter } from "./dry-run.js";
import type { ChainAdapter } from "./types.js";

export async function createChainAdapter(config: AppConfig): Promise<ChainAdapter> {
  if (config.chain.mode === "dry-run") return new DryRunChainAdapter(config.chain.simulationTtlSeconds);
  if (config.chain.network === "mainnet-beta" && !config.chain.mainnetEnabled) {
    throw new AppError("MAINNET_DISABLED", "Pump mode on mainnet requires SOLANA_MAINNET_ENABLED=true", 503);
  }
  const [{ PumpChainAdapter }, { createTransactionSigner }] = await Promise.all([import("./pump.js"), import("./signer.js")]);
  const signer = createTransactionSigner(config);
  return new PumpChainAdapter(
    config.chain.rpcUrl,
    config.chain.network,
    signer,
    config.chain.commitment,
    config.chain.simulationTtlSeconds,
  );
}

export type { ChainAdapter, ChainRefresh, LaunchExecution } from "./types.js";
