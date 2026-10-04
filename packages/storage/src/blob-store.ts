import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";

export interface BlobStore {
  put(
    key: string,
    body: Buffer | Readable,
    contentType: string,
    contentLength?: number,
  ): Promise<void>;
  presignGet(key: string, ttlSeconds: number): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

export function createS3BlobStore(opts: {
  bucket: string;
  region: string;
  client?: S3Client;
}): BlobStore {
  const client = opts.client ?? new S3Client({ region: opts.region });
  return {
    async put(key, body, contentType, contentLength) {
      if (Buffer.isBuffer(body)) {
        await client.send(
          new PutObjectCommand({
            Bucket: opts.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
          }),
        );
        return;
      }
      await new Upload({
        client,
        params: {
          Bucket: opts.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          ...(contentLength ? { ContentLength: contentLength } : {}),
        },
        queueSize: 2,
        partSize: 8 * 1024 * 1024,
      }).done();
    },
    presignGet: (key, ttlSeconds) =>
      getSignedUrl(client, new GetObjectCommand({ Bucket: opts.bucket, Key: key }), {
        expiresIn: ttlSeconds,
      }),
    async head(key) {
      try {
        const r = await client.send(new HeadObjectCommand({ Bucket: opts.bucket, Key: key }));
        return { size: r.ContentLength ?? 0 };
      } catch (e) {
        const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
        if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}
