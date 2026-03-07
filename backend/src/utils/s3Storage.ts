import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import logger from './logger';

export type S3UploadResult = {
  bucket: string;
  key: string;
  uri: string;
  etag?: string;
};

let cachedClient: S3Client | null = null;

function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  cachedClient = new S3Client(region ? { region } : {});
  return cachedClient;
}

function safeKeyComponent(value: string): string {
  return (value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-()]/g, '_')
    .slice(0, 140);
}

/**
 * Uploads a local file to S3.
 *
 * - No-op (returns null) if `S3_BUCKET` is not set.
 * - Designed to be best-effort; callers can decide whether to await.
 */
export async function uploadFileToS3(params: {
  filePath: string;
  keyPrefix: string;
  contentType?: string;
  originalName?: string;
}): Promise<S3UploadResult | null> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) return null;

  const keyPrefix = (params.keyPrefix || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const originalBase = path.basename(params.originalName || params.filePath);
  const safeBase = safeKeyComponent(originalBase) || 'file';
  const rand = crypto.randomBytes(6).toString('hex');
  const key = [keyPrefix, `${Date.now()}-${rand}-${safeBase}`].filter(Boolean).join('/');

  const stat = fs.statSync(params.filePath);
  const body = fs.createReadStream(params.filePath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: params.contentType,
    ContentLength: stat.size,
  });

  try {
    const resp = await getS3Client().send(command);
    return {
      bucket,
      key,
      uri: `s3://${bucket}/${key}`,
      etag: resp.ETag,
    };
  } catch (err) {
    logger.warn('S3 upload failed (continuing without S3):', err);
    return null;
  }
}
