/* ═══════════════════════════════════════════════════════════════════════════
   csvStorage.server.js

   Cloudflare R2 (S3-compatible) wrapper for bulk verification CSV input
   and output files. Uses AWS SDK v3 - the standard, well-maintained
   client; works against R2, S3, Backblaze B2, MinIO, anything S3-API.

   Why R2:
     - Zero egress fees (huge for CSV downloads at scale)
     - S3-compatible API (one env change to switch providers)
     - Free tier covers launch volume
     - Hetzner Object Storage and Backblaze B2 are drop-in replacements
       if R2 ever has issues

   Why presigned URLs for downloads:
     - User cannot share permanent links (1-hour expiry)
     - We don't have to proxy the bytes through our Remix server
     - Cloudflare CDN serves the file with zero ops cost

   Path convention:
     jobs/{jobId}/input.csv    - the user's uploaded list (preserved for
                                  48h so support can re-run a botched job)
     jobs/{jobId}/output.csv   - the categorized result
     jobs/{jobId}/clean.csv    - convenience: only valid emails, for users
                                  who just want a clean list to send to

   All operations follow the never-throw contract:
     { ok: true, ... } on success
     { ok: false, code, error } on failure

   Lazy client init: missing env vars surface as R2_NO_CREDENTIALS on first
   call rather than a boot crash. The route maps that to a 503 with a clear
   "storage not configured" message.
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const DEFAULT_DOWNLOAD_TTL_SECONDS = 60 * 60; // 1 hour

let _client = null;
let _bucket = null;

class StorageConfigError extends Error {
  constructor(code, msg) {
    super(msg || code);
    this.code = code;
  }
}

function getClient() {
  if (_client) return { client: _client, bucket: _bucket };

  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  const region = process.env.S3_REGION || 'auto';

  if (!endpoint || !accessKey || !secretKey || !bucket) {
    throw new StorageConfigError('R2_NO_CREDENTIALS',
      'CSV storage is not configured. Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET.');
  }

  _client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    forcePathStyle: true, // R2 and most S3-compatible services prefer this
  });
  _bucket = bucket;
  return { client: _client, bucket: _bucket };
}

/**
 * Build a canonical key for a job artifact. Centralised so route, worker,
 * and cleanup all agree on the path scheme.
 *
 * @param {string} jobId - UUID
 * @param {'input'|'output'|'clean'} role
 */
export function jobKey(jobId, role) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/i.test(jobId)) {
    throw new Error('jobId must be a UUID');
  }
  if (!['input', 'output', 'clean'].includes(role)) {
    throw new Error(`unknown role: ${role}`);
  }
  return `jobs/${jobId}/${role}.csv`;
}

/**
 * Upload CSV content. Body can be a string or a Buffer.
 *
 * @param {string} key - canonical key (use jobKey() to build)
 * @param {string|Buffer} body
 * @param {object} [opts]
 * @param {object} [opts.metadata] - small {key:value} object for diagnostics
 * @returns {Promise<{ok: true, key, size}> | Promise<{ok: false, code, error}>}
 */
export async function uploadCsv(key, body, opts = {}) {
  if (typeof key !== 'string' || !key) {
    return { ok: false, code: 'INVALID_KEY', error: 'key is required' };
  }
  if (body == null) {
    return { ok: false, code: 'INVALID_BODY', error: 'body is required' };
  }

  let cli;
  try {
    cli = getClient();
  } catch (err) {
    return { ok: false, code: err.code || 'R2_CONFIG_ERROR', error: err.message };
  }

  const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body, 'utf-8');

  try {
    await cli.client.send(new PutObjectCommand({
      Bucket: cli.bucket,
      Key: key,
      Body: body,
      ContentType: 'text/csv; charset=utf-8',
      Metadata: opts.metadata && typeof opts.metadata === 'object'
        ? Object.fromEntries(
            Object.entries(opts.metadata)
              .filter(([k, v]) => typeof k === 'string' && (typeof v === 'string' || typeof v === 'number'))
              .map(([k, v]) => [k, String(v)])
          )
        : undefined,
    }));
    return { ok: true, key, size };
  } catch (err) {
    return mapAwsError(err, 'R2_UPLOAD_FAILED');
  }
}

/**
 * Generate a presigned download URL with TTL. The URL embeds the key and a
 * cryptographic signature; opening it streams the bytes directly from the
 * provider's CDN. No bytes flow through our server.
 *
 * @param {string} key
 * @param {object} [opts]
 * @param {number} [opts.ttlSeconds] - default 3600 (1 hour)
 * @param {string} [opts.downloadFilename] - sets Content-Disposition for
 *   nice browser download names. Sanitized: alphanumerics, dashes,
 *   underscores, dots only.
 */
export async function presignedDownloadUrl(key, opts = {}) {
  let cli;
  try {
    cli = getClient();
  } catch (err) {
    return { ok: false, code: err.code || 'R2_CONFIG_ERROR', error: err.message };
  }

  const ttl = Number.isFinite(opts.ttlSeconds) && opts.ttlSeconds > 0
    ? Math.floor(opts.ttlSeconds)
    : DEFAULT_DOWNLOAD_TTL_SECONDS;

  let responseContentDisposition;
  if (opts.downloadFilename) {
    const safe = String(opts.downloadFilename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    responseContentDisposition = `attachment; filename="${safe}"`;
  }

  try {
    const url = await getSignedUrl(
      cli.client,
      new GetObjectCommand({
        Bucket: cli.bucket,
        Key: key,
        ResponseContentDisposition: responseContentDisposition,
      }),
      { expiresIn: ttl },
    );
    return { ok: true, url, expiresInSeconds: ttl };
  } catch (err) {
    return mapAwsError(err, 'R2_PRESIGN_FAILED');
  }
}

/**
 * Hard-delete an object. Idempotent: deleting a missing key returns ok.
 */
export async function deleteCsv(key) {
  let cli;
  try {
    cli = getClient();
  } catch (err) {
    return { ok: false, code: err.code || 'R2_CONFIG_ERROR', error: err.message };
  }

  try {
    await cli.client.send(new DeleteObjectCommand({
      Bucket: cli.bucket,
      Key: key,
    }));
    return { ok: true };
  } catch (err) {
    // R2/S3 returns success even if the key didn't exist, so most "errors"
    // here are real (auth, network, etc).
    return mapAwsError(err, 'R2_DELETE_FAILED');
  }
}

/**
 * HEAD check: does the object exist?
 *
 * Returns:
 *   { ok: true, exists: true,  size, lastModified } - object is there
 *   { ok: true, exists: false }                    - object is not there
 *   { ok: false, code, error }                     - storage failed
 */
export async function csvExists(key) {
  let cli;
  try {
    cli = getClient();
  } catch (err) {
    return { ok: false, code: err.code || 'R2_CONFIG_ERROR', error: err.message };
  }

  try {
    const head = await cli.client.send(new HeadObjectCommand({
      Bucket: cli.bucket,
      Key: key,
    }));
    return {
      ok: true,
      exists: true,
      size: head.ContentLength,
      lastModified: head.LastModified,
    };
  } catch (err) {
    if (err && (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404)) {
      return { ok: true, exists: false };
    }
    return mapAwsError(err, 'R2_HEAD_FAILED');
  }
}

/**
 * Map AWS SDK errors to our internal code shape. Never leaks the raw error
 * message to user-facing responses (it can contain endpoint URLs and
 * occasionally request IDs); keep it server-log only via the .error
 * field which the route filters out before responding.
 */
function mapAwsError(err, fallbackCode) {
  const httpStatus = err?.$metadata?.httpStatusCode;
  const name = err?.name;

  if (name === 'CredentialsProviderError' || httpStatus === 401 || httpStatus === 403) {
    return { ok: false, code: 'R2_AUTH_FAILED', error: 'Storage authentication failed' };
  }
  if (httpStatus === 404 || name === 'NoSuchKey' || name === 'NotFound') {
    return { ok: false, code: 'R2_NOT_FOUND', error: 'Object not found' };
  }
  if (httpStatus === 429) {
    return { ok: false, code: 'R2_RATE_LIMITED', error: 'Storage rate limit exceeded' };
  }
  if (httpStatus >= 500 && httpStatus < 600) {
    return { ok: false, code: 'R2_SERVER_ERROR', error: 'Storage backend error' };
  }
  if (err?.code === 'ETIMEDOUT' || err?.code === 'ECONNRESET') {
    return { ok: false, code: 'R2_NETWORK', error: 'Storage network error' };
  }

  return {
    ok: false,
    code: fallbackCode,
    error: err?.message || 'Storage operation failed',
  };
}
