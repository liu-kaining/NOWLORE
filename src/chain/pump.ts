import { createRequire } from "node:module";
import { Connection, Keypair, Transaction, type Commitment } from "@solana/web3.js";
import bs58 from "bs58";
import type { LaunchRecord, Project, SimulationResult } from "../domain/schemas.js";
import { AppError } from "../domain/errors.js";
import { sha256 } from "../lib/hash.js";
import { fetchWithLimits } from "../lib/http.js";
import type { TransactionSigner } from "./signer.js";
import type { ChainAdapter, ChainRefresh, LaunchExecution } from "./types.js";

// Pump publishes both ESM and CommonJS entry points. Its current ESM graph
// contains a transitive named import from Anchor's CommonJS build that fails on
// Node 22. Loading Pump's documented CommonJS export keeps the SDK unmodified
// while using the package's own compatible dependency path.
const loadCommonJs = createRequire(import.meta.url);
const { creatorVaultPda, PUMP_PROGRAM_ID, PUMP_SDK } = loadCommonJs("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");

export class PumpChainAdapter implements ChainAdapter {
  readonly name = "pump-sdk";
  private readonly connection: Connection;

  constructor(
    rpcUrl: string,
    private readonly network: "devnet" | "mainnet-beta",
    private readonly signer: TransactionSigner,
    private readonly commitment: Commitment,
    private readonly simulationTtlSeconds: number,
  ) {
    this.connection = new Connection(rpcUrl, commitment);
  }

  creatorWallet(): string {
    return this.signer.publicKey.toBase58();
  }

  async simulate(project: Project): Promise<SimulationResult> {
    const { transaction, mint } = await this.buildSignedTransaction(project);
    const response = await this.connection.simulateTransaction(transaction);
    const now = new Date();
    return {
      ok: response.value.err === null,
      simulatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.simulationTtlSeconds * 1_000).toISOString(),
      unitsConsumed: response.value.unitsConsumed ?? undefined,
      logs: (response.value.logs ?? []).slice(0, 200),
      ...(response.value.err ? { error: JSON.stringify(response.value.err).slice(0, 2_000) } : {}),
      transactionBase64: transaction.serialize({ requireAllSignatures: true }).toString("base64"),
      mint: mint.publicKey.toBase58(),
    };
  }

  async launch(project: Project): Promise<LaunchExecution> {
    const { transaction, mint, blockhash } = await this.buildSignedTransaction(project);
    const simulationResponse = await this.connection.simulateTransaction(transaction);
    const now = new Date();
    const simulation: SimulationResult = {
      ok: simulationResponse.value.err === null,
      simulatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.simulationTtlSeconds * 1_000).toISOString(),
      unitsConsumed: simulationResponse.value.unitsConsumed ?? undefined,
      logs: (simulationResponse.value.logs ?? []).slice(0, 200),
      ...(simulationResponse.value.err ? { error: JSON.stringify(simulationResponse.value.err).slice(0, 2_000) } : {}),
      mint: mint.publicKey.toBase58(),
    };
    if (!simulation.ok) throw new AppError("SOLANA_SIMULATION_FAILED", "Pump create transaction simulation failed", 409, { error: simulation.error });
    const transactionSignature = transaction.signature;
    if (!transactionSignature) throw new AppError("MISSING_TRANSACTION_SIGNATURE", "Signed Pump transaction has no fee-payer signature", 500);
    const expectedSignature = bs58.encode(transactionSignature);
    let signature = expectedSignature;
    try {
      signature = await this.connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: this.commitment,
        maxRetries: 3,
      });
    } catch {
      const observed = await this.connection.getSignatureStatus(expectedSignature, { searchTransactionHistory: true }).catch(() => null);
      if (!observed?.value) {
        throw new AppError("SOLANA_SUBMISSION_UNKNOWN", "Pump transaction submission outcome is unknown; do not retry with a new key", 503, {
          transactionSignature: expectedSignature,
        });
      }
      if (observed.value.err) throw new AppError("SOLANA_SUBMISSION_FAILED", "Pump transaction was rejected", 502);
    }
    let confirmation;
    try {
      confirmation = await this.connection.confirmTransaction({
        signature,
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      }, this.commitment);
    } catch {
      return {
        mint: mint.publicKey.toBase58(), creatorWallet: this.creatorWallet(), transactionSignature: signature,
        simulation, confirmed: false,
      };
    }
    if (confirmation.value.err) throw new AppError("SOLANA_CONFIRMATION_FAILED", "Pump create transaction failed confirmation", 502);
    return {
      mint: mint.publicKey.toBase58(), creatorWallet: this.creatorWallet(), transactionSignature: signature,
      simulation, confirmed: true, confirmedAt: new Date().toISOString(),
    };
  }

  async refresh(launch: LaunchRecord): Promise<ChainRefresh> {
    const [status, walletBalance, vaultBalance] = await Promise.all([
      launch.transactionSignature ? this.connection.getSignatureStatus(launch.transactionSignature, { searchTransactionHistory: true }) : null,
      this.connection.getBalance(this.signer.publicKey, this.commitment),
      this.connection.getBalance(creatorVaultPda(this.signer.publicKey), this.commitment),
    ]);
    return {
      transactionStatus: status?.value?.err ? "failed" : status?.value?.confirmationStatus ?? "unknown",
      creatorWalletLamports: String(walletBalance),
      creatorVaultLamports: String(vaultBalance),
      collectedCreatorFeesLamports: "0",
    };
  }

  private async buildSignedTransaction(project: Project) {
    if (!project.assetBundle) throw new AppError("ASSETS_REQUIRED", "Published assets are required", 409);
    if (project.network !== this.network) throw new AppError("SOLANA_NETWORK_MISMATCH", "Project and configured Solana networks do not match", 409);
    if (!project.assetBundle.metadataUrl.startsWith("https://")) throw new AppError("PUBLIC_HTTPS_ASSETS_REQUIRED", "Real Pump launches require an HTTPS metadata URL", 409);
    if (project.name.length > 32 || project.symbol.length > 13 || project.assetBundle.metadataUrl.length > 200) {
      throw new AppError("PUMP_METADATA_LIMIT", "Project exceeds Pump create_v2 metadata limits", 409);
    }
    await verifyPublishedAssets(project);
    const mint = Keypair.generate();
    const instruction = await PUMP_SDK.createV2Instruction({
      mint: mint.publicKey,
      name: project.name,
      symbol: project.symbol,
      uri: project.assetBundle.metadataUrl,
      creator: this.signer.publicKey,
      user: this.signer.publicKey,
      mayhemMode: false,
      cashback: false,
    });
    if (!instruction.programId.equals(PUMP_PROGRAM_ID)) throw new AppError("UNEXPECTED_PUMP_PROGRAM", "Pump SDK returned an unexpected program ID", 500);
    const blockhash = await this.connection.getLatestBlockhash(this.commitment);
    const transaction = new Transaction({ recentBlockhash: blockhash.blockhash, feePayer: this.signer.publicKey }).add(instruction);
    transaction.partialSign(mint);
    await this.signer.sign(transaction);
    if (!transaction.verifySignatures()) throw new AppError("INVALID_TRANSACTION_SIGNATURE", "Constructed Pump transaction signatures are invalid", 500);
    return { transaction, mint, blockhash };
  }
}

async function verifyPublishedAssets(project: Project): Promise<void> {
  const bundle = project.assetBundle!;
  if (!bundle.posterUrl.startsWith("https://")) throw new AppError("PUBLIC_HTTPS_ASSETS_REQUIRED", "Real Pump launches require an HTTPS poster URL", 409);
  const [posterResponse, metadataResponse] = await Promise.all([
    fetchWithLimits(bundle.posterUrl, { maxBytes: 1_000_000, allowedContentTypes: /^image\/svg\+xml(?:\s*;|$)/i }),
    fetchWithLimits(bundle.metadataUrl, { maxBytes: 250_000, allowedContentTypes: /^application\/(?:json|[a-z0-9.+-]*\+json)(?:\s*;|$)/i }),
  ]);
  const [poster, metadataText] = await Promise.all([posterResponse.text(), metadataResponse.text()]);
  if (sha256(poster) !== bundle.posterSha256 || sha256(metadataText) !== bundle.metadataSha256) {
    throw new AppError("ASSET_HASH_MISMATCH", "Published Pump assets do not match the approved asset bundle", 409);
  }
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(metadataText) as Record<string, unknown>;
  } catch {
    throw new AppError("INVALID_ASSET_METADATA", "Published Pump metadata is not valid JSON", 409);
  }
  if (metadata.name !== project.name || metadata.symbol !== project.symbol || metadata.image !== bundle.posterUrl) {
    throw new AppError("ASSET_METADATA_MISMATCH", "Published Pump metadata does not match the approved project", 409);
  }
}
