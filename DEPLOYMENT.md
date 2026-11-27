# Deployment
Target zero cost within quotas, not guaranteed. Frontend: Vercel or equivalent HTTPS host. Backend/worker: free host if runtime and queue constraints allow; otherwise local demo via HTTPS tunnel. Storage: Supabase free tier if available. Verify current terms and quotas before deployment. Do not enable billing automatically.

Environment examples: NEXT_PUBLIC_API_BASE_URL, PUBLIC_APP_URL, ALLOWED_ORIGINS, HF_TOKEN (optional), AI_PROVIDER, AI_SPACE_ID, DATABASE_URL, STORAGE_BUCKET, STORAGE credentials, SHARE_TTL_SECONDS. Keep secret values backend-only. Configure HTTPS, CORS, rate limits, cleanup and logs without sensitive image data. Validate deployed URLs on actual phone. Document startup and recovery steps. Free hosts may sleep or terminate jobs; use durable worker and persisted state or disclose demo limitations.


## Trusted edge and retention

Bind FastAPI privately with `--no-proxy-headers --no-access-log`. Without an explicit trust configuration, upload rate limiting uses the socket peer and ignores forwarded identities. For distinct client buckets, configure the trusted public edge to replace incoming `X-Vision3D-Client-IP` with the verified client IP (for example, Nginx `proxy_set_header X-Vision3D-Client-IP $remote_addr;` at the outermost edge). Forward it through Next.js and set FastAPI's `TRUSTED_PROXY_IPS` to the exact socket IPs of the immediate private proxy. Block public access to both the private proxy and FastAPI, so clients cannot bypass the header-replacing edge. Do not enable this option for a proxy that simply passes the client-supplied header. Verify the deployment with two separate client networks.

Retention maintenance prunes expired models, terminal history and shares on startup and each `PRUNE_INTERVAL_SECONDS` interval (default one hour), preserving active jobs. Set `NEXT_PUBLIC_PUBLIC_APP_URL` to the public HTTPS origin at production build time to emit HSTS. Keep HSTS enforced at the public TLS edge as well where available. The baseline CSP retains inline hydration scripts for static Next.js pages.
