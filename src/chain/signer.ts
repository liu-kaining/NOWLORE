import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import bs58 from "bs58";
import type { AppConfig } from "../config/env.js";
import { AppError } from "../domain/errors.js";

export interface TransactionSigner {
  readonly publicKey: PublicKey;
  sign(transaction: Transaction): Promise<void>;
}

export class LocalTransactionSigner implements TransactionSigner {
  readonly publicKey: PublicKey;
  private readonly keypair: Keypair;

  constructor(encoded: string) {
    const secret = parseSecret(encoded);
    this.keypair = Keypair.fromSecretKey(secret);
    this.publicKey = this.keypair.publicKey;
  }

  async sign(transaction: Transaction): Promise<void> {
    transaction.partialSign(this.keypair);
  }
}

export class GcpKmsTransactionSigner implements TransactionSigner {
  readonly publicKey: PublicKey;
  private readonly client = new KeyManagementServiceClient();

  constructor(private readonly keyName: string, publicKeyBase58: string) {
    this.publicKey = new PublicKey(publicKeyBase58);
  }

  async sign(transaction: Transaction): Promise<void> {
    const message = transaction.serializeMessage();
    const [response] = await this.client.asymmetricSign({ name: this.keyName, data: message });
    if (!response.signature) throw new AppError("KMS_EMPTY_SIGNATURE", "GCP KMS returned no signature", 502);
    const signature = Buffer.from(response.signature as Uint8Array);
    if (signature.length !== 64) throw new AppError("KMS_INVALID_SIGNATURE", "GCP KMS did not return an Ed25519 signature", 502);
    transaction.addSignature(this.publicKey, signature);
  }
}

export function createTransactionSigner(config: AppConfig): TransactionSigner {
  switch (config.chain.signerMode) {
    case "disabled": throw new AppError("SIGNER_DISABLED", "Transaction signer is disabled", 503);
    case "local": {
      if (!config.chain.privateKey) throw new AppError("SIGNER_NOT_CONFIGURED", "Local signer key is not configured", 503);
      return new LocalTransactionSigner(config.chain.privateKey);
    }
    case "gcp-kms": {
      if (!config.chain.gcpKmsKeyName || !config.chain.gcpKmsPublicKey) {
        throw new AppError("SIGNER_NOT_CONFIGURED", "GCP KMS key name and Solana public key are required", 503);
      }
      return new GcpKmsTransactionSigner(config.chain.gcpKmsKeyName, config.chain.gcpKmsPublicKey);
    }
  }
}

function parseSecret(input: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = input.trim().startsWith("[") ? Uint8Array.from(JSON.parse(input) as number[]) : bs58.decode(input.trim());
  } catch {
    throw new AppError("INVALID_PRIVATE_KEY", "Local Solana private key encoding is invalid", 500);
  }
  if (bytes.length !== 64) throw new AppError("INVALID_PRIVATE_KEY", "Local Solana private key must contain 64 bytes", 500);
  return bytes;
}
