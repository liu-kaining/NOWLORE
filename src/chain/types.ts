import type { LaunchRecord, Project, SimulationResult } from "../domain/schemas.js";

export interface LaunchExecution {
  mint: string;
  creatorWallet: string;
  transactionSignature: string;
  simulation: SimulationResult;
  confirmed: boolean;
  confirmedAt?: string;
}

export interface ChainRefresh {
  transactionStatus: string;
  creatorWalletLamports: string;
  creatorVaultLamports: string;
  collectedCreatorFeesLamports: string;
}

export interface ChainAdapter {
  readonly name: string;
  creatorWallet(): string;
  simulate(project: Project): Promise<SimulationResult>;
  launch(project: Project): Promise<LaunchExecution>;
  refresh(launch: LaunchRecord): Promise<ChainRefresh>;
}
