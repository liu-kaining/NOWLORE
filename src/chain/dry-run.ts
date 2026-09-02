import { Keypair } from "@solana/web3.js";
import type { LaunchRecord, Project, SimulationResult } from "../domain/schemas.js";
import { sha256 } from "../lib/hash.js";
import type { ChainAdapter, ChainRefresh, LaunchExecution } from "./types.js";

export class DryRunChainAdapter implements ChainAdapter {
  readonly name = "dry-run";
  private readonly creator = deterministicKeypair("NOWLORE_DRY_RUN_CREATOR");
  constructor(private readonly simulationTtlSeconds: number) {}

  creatorWallet(): string {
    return this.creator.publicKey.toBase58();
  }

  async simulate(project: Project): Promise<SimulationResult> {
    const now = new Date();
    return {
      ok: true,
      simulatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.simulationTtlSeconds * 1_000).toISOString(),
      unitsConsumed: 84_000,
      logs: ["NOWLORE dry-run", `Validated project ${project.id}`, "No transaction was sent"],
      mint: deterministicKeypair(`mint:${project.id}:${project.contentHash}`).publicKey.toBase58(),
    };
  }

  async launch(project: Project): Promise<LaunchExecution> {
    const simulation = await this.simulate(project);
    const signature = sha256(`dry-run:${project.id}:${project.contentHash}`).padEnd(88, "0").slice(0, 88);
    return {
      mint: simulation.mint,
      creatorWallet: this.creatorWallet(),
      transactionSignature: signature,
      simulation,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
    };
  }

  async refresh(_launch: LaunchRecord): Promise<ChainRefresh> {
    return {
      transactionStatus: "dry-run-confirmed",
      creatorWalletLamports: "0",
      creatorVaultLamports: "0",
      collectedCreatorFeesLamports: "0",
    };
  }
}

function deterministicKeypair(seed: string): Keypair {
  return Keypair.fromSeed(Buffer.from(sha256(seed), "hex").subarray(0, 32));
}
