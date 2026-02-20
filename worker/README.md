# Email Builder Upload Worker

A Cloudflare Worker that handles image uploads to Cloudflare R2 for the email builder.

## How it works

1. The email builder sends the image file to this Worker with a secret API key header
2. The Worker validates the key and rate limits the request
3. The file is uploaded to your R2 bucket
4. The Worker returns the public URL which is auto-populated in the image block

## Setup

### 1. Install dependencies

```bash
cd worker
npm install
```

### 2. Create your R2 bucket

In the Cloudflare dashboard:
- Go to **R2 Object Storage** → **Create bucket**
- Name it `email-builder-images` (or update `bucket_name` in `wrangler.toml`)
- Enable **Public Access** and copy the public bucket URL (e.g. `https://pub-abc123.r2.dev`)

### 3. Configure wrangler.toml

Update `wrangler.toml` with your bucket name. Optionally set `ALLOWED_ORIGIN` to restrict uploads to your domain:

```toml
[vars]
ALLOWED_ORIGIN = "https://yourdomain.com"  # leave empty to allow any origin
R2_PUBLIC_URL  = "https://pub-abc123.r2.dev"
```

### 4. Set secrets

Generate a strong random API key:
```bash
openssl rand -hex 32
```

Set it on the Worker (you'll be prompted to enter the value):
```bash
npx wrangler secret put UPLOAD_API_KEY
```

### 5. Deploy

```bash
npm run deploy
```

Copy the Worker URL from the output (e.g. `https://email-builder-upload.yourname.workers.dev`).

### 6. Configure the email builder

Copy `.env.example` to `.env` in the example app and fill in the values:

```bash
cd ../examples/vite-emailbuilder-mui
cp .env.example .env
```

```env
VITE_UPLOAD_WORKER_URL=https://email-builder-upload.yourname.workers.dev
VITE_UPLOAD_API_KEY=your-secret-key-from-step-4
```

## Security

- **API key**: Required on every request via the `X-Upload-Api-Key` header
- **Origin restriction**: Set `ALLOWED_ORIGIN` in `wrangler.toml` to lock uploads to your domain only. Leave empty to allow any origin.
- **Rate limiting**: Max 20 uploads per IP per minute (in-memory). For stricter limits, enable Cloudflare Rate Limiting rules in your dashboard (free tier available).
- **File type validation**: Only `image/jpeg`, `image/png`, `image/gif`, `image/webp`, and `image/svg+xml` are accepted.

## Local development

```bash
npm run dev
```

This starts the Worker locally at `http://localhost:8787`. Update `VITE_UPLOAD_WORKER_URL` in your `.env` to point there while developing.
