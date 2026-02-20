export interface Env {
  IMAGE_BUCKET: R2Bucket;
  UPLOAD_API_KEY: string;
  // Optional: Set to restrict uploads to one origin (e.g. "https://yourdomain.com")
  // Leave empty or unset to allow any origin.
  ALLOWED_ORIGIN: string;
  // The public base URL for your R2 bucket.
  // e.g. "https://pub-abc123.r2.dev" (from Cloudflare R2 dashboard → Public Access)
  R2_PUBLIC_URL: string;
}

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter (resets when the Worker instance is recycled).
// For stricter rate limiting, enable Cloudflare Rate Limiting in your dashboard.
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 20;           // max uploads per IP per window
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }
  if (entry.count >= RATE_LIMIT_MAX) return true;
  entry.count++;
  return false;
}

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
function getAllowedOrigin(env: Env, requestOrigin: string | null): string {
  const configured = env.ALLOWED_ORIGIN?.trim();
  if (configured) return configured; // restrict to specific domain
  return requestOrigin ?? '*';       // allow any origin
}

function buildCorsHeaders(env: Env, requestOrigin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(env, requestOrigin),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Api-Key',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ---------------------------------------------------------------------------
// Allowed image MIME types → file extensions
// ---------------------------------------------------------------------------
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestOrigin = request.headers.get('Origin');
    const corsHeaders = buildCorsHeaders(env, requestOrigin);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Only POST allowed
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    // Origin check — only enforced if ALLOWED_ORIGIN is configured
    const configuredOrigin = env.ALLOWED_ORIGIN?.trim();
    if (configuredOrigin && requestOrigin !== configuredOrigin) {
      return jsonResponse({ error: 'Origin not allowed' }, 403, corsHeaders);
    }

    // API key check
    const apiKey = request.headers.get('X-Upload-Api-Key');
    if (!env.UPLOAD_API_KEY || apiKey !== env.UPLOAD_API_KEY) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);
    }

    // Rate limiting by IP
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (isRateLimited(ip)) {
      return jsonResponse(
        { error: 'Too many requests. Please wait a minute and try again.' },
        429,
        corsHeaders
      );
    }

    // Parse multipart form data
    let file: File;
    try {
      const formData = await request.formData();
      const uploaded = formData.get('file');
      if (!uploaded || !(uploaded instanceof File)) {
        throw new Error('No file provided');
      }
      file = uploaded;
    } catch {
      return jsonResponse(
        { error: 'Invalid request. Expected multipart/form-data with a "file" field.' },
        400,
        corsHeaders
      );
    }

    // Validate file type
    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return jsonResponse(
        {
          error: `Unsupported file type "${file.type}". Allowed types: ${Object.keys(ALLOWED_TYPES).join(', ')}`,
        },
        400,
        corsHeaders
      );
    }

    // Generate a unique storage key
    const key = `uploads/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // Upload to R2
    try {
      await env.IMAGE_BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type },
      });
    } catch (err) {
      console.error('R2 upload error:', err);
      return jsonResponse({ error: 'Upload to storage failed. Please try again.' }, 502, corsHeaders);
    }

    // Return the public URL
    const publicBaseUrl = env.R2_PUBLIC_URL.replace(/\/$/, '');
    return jsonResponse({ url: `${publicBaseUrl}/${key}` }, 200, corsHeaders);
  },
};
