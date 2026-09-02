import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AppError } from "../domain/errors.js";
import type { AppConfig } from "../config/env.js";

export interface PublishedObject {
  url: string;
  key: string;
}

export interface ObjectPublisher {
  readonly name: string;
  put(key: string, body: string, contentType: string): Promise<PublishedObject>;
}

export class LocalObjectPublisher implements ObjectPublisher {
  readonly name = "local";
  constructor(private readonly root: string, private readonly publicBaseUrl: string) {}

  async put(key: string, body: string, _contentType: string): Promise<PublishedObject> {
    const safeKey = key.replace(/[^a-zA-Z0-9_./-]/g, "-").replace(/\.\./g, "-");
    const target = resolve(this.root, safeKey);
    const root = resolve(this.root);
    if (!target.startsWith(`${root}/`)) throw new AppError("INVALID_ASSET_KEY", "Asset key escapes storage root", 400);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, { encoding: "utf8", mode: 0o644 });
    return { key: safeKey, url: `${this.publicBaseUrl}/${safeKey}` };
  }
}

export class R2ObjectPublisher implements ObjectPublisher {
  readonly name = "r2";
  private readonly client: S3Client;

  constructor(private readonly bucket: string, endpoint: string, region: string, accessKeyId: string, secretAccessKey: string, private readonly publicBaseUrl: string) {
    this.client = new S3Client({ endpoint, region, credentials: { accessKeyId, secretAccessKey } });
  }

  async put(key: string, body: string, contentType: string): Promise<PublishedObject> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key, Body: body, ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return { key, url: `${this.publicBaseUrl}/${key}` };
  }
}

export function createObjectPublisher(config: AppConfig): ObjectPublisher {
  if (config.assets.driver === "local") return new LocalObjectPublisher(config.assets.localPath, config.assets.publicBaseUrl);
  const { r2Bucket, r2Endpoint, r2AccessKeyId, r2SecretAccessKey, r2PublicBaseUrl } = config.assets;
  if (!r2Bucket || !r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2PublicBaseUrl) {
    throw new AppError("R2_NOT_CONFIGURED", "R2 asset driver requires endpoint, bucket, credentials and public base URL", 500);
  }
  return new R2ObjectPublisher(r2Bucket, r2Endpoint, config.assets.r2Region, r2AccessKeyId, r2SecretAccessKey, r2PublicBaseUrl);
}
