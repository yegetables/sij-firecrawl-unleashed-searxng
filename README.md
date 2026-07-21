# Firecrawl Unleashed

**An unofficial Firecrawl fork for self-hosters who want more operator control: CloakBrowser instead of the stock browser path, and fewer upstream guardrails.**

> [!WARNING]
> This fork intentionally diverges from upstream Firecrawl behavior.
>
> It is **not affiliated with, endorsed by, or supported by** Firecrawl or the Firecrawl team.
>
> If you want the official managed product, cloud-only capabilities, or upstream support guarantees, use the upstream project at [`firecrawl/firecrawl`](https://github.com/firecrawl/firecrawl) and the hosted service at [firecrawl.dev](https://firecrawl.dev).

---

## What this repo is

Firecrawl Unleashed starts from the upstream Firecrawl codebase and preserves the familiar **scrape / crawl / map / search** workflow where practical, but is tuned for:

- **self-hosting**
- **operator control**
- **local experimentation**
- **harder scraping targets**
- **more permissive defaults for private or authorized use cases**

This fork keeps the Firecrawl API shape where possible, but makes different tradeoffs than upstream.

---

## Why this fork exists

Upstream Firecrawl is built to serve both open-source users and a hosted product.  
This fork exists for people who want a version that is easier to run locally, easier to patch, and less opinionated about what operators should or should not be allowed to do.

Goals:

- keep the Firecrawl API ergonomics where possible
- reduce friction for private/self-hosted deployments
- improve the browser scraping stack for anti-bot-heavy targets
- make local behavior easier to inspect and modify
- allow more aggressive customization than upstream is likely to accept

---

## Key differences from upstream

This fork currently differs from upstream in several important ways:

- **Swapped the stock browser backend for CloakBrowser**
- **Relaxed robots-related guardrails**
- **Relaxed some self-host feature gating**
- **Relaxed crawl path restrictions**
- **Bundled a local web UI service**
- **Prioritized operator control over upstream defaults**

This means upstream documentation is still a useful baseline, but **behavior in this fork may differ materially from upstream Firecrawl**.

---

## Browser stack

The browser microservice in this fork is built around **CloakBrowser**, rather than the stock upstream browser path.

Why that matters:

- better anti-bot posture for browser-driven scraping
- improved compatibility with harder targets
- no need to rely on Firecrawl’s cloud-only browser infrastructure
- preserves the existing Firecrawl microservice pattern instead of replacing it with a completely different browser API

This repo is therefore best thought of as:

```txt
Firecrawl API + Firecrawl worker model + CloakBrowser-backed browser service
```

rather than a stock upstream self-host.

---

## Included stack

The local compose stack currently includes:

- Firecrawl API
- CloakBrowser-backed browser microservice
- Redis
- RabbitMQ
- NuQ Postgres
- optional FoundationDB components
- a **community web UI** service for local browsing/inspection

---

## Quick start

### 1. Clone the repo

```bash
git clone <your-fork-url>
cd firecrawl-unleashed
```

### 2. Create or update `.env`

Set the values you care about, for example:

```bash
TEST_API_KEY=mykey
USE_DB_AUTHENTICATION=false
LOGGING_LEVEL=info
```

If your local patch set expects it, you may also use:

```bash
IGNORE_ROBOTS_TXT=true
```

If you use an upstream proxy:

```bash
PROXY_SERVER=http://host:port
PROXY_USERNAME=username
PROXY_PASSWORD=password
```

### 3. Start the stack

```bash
docker compose up --build -d
```

### 4. Useful local endpoints

- API: `http://localhost:3002`
- UI: `http://localhost:8080`

### 5. Smoke test

```bash
curl --request POST \
  --url http://localhost:3002/v2/scrape \
  --header 'Authorization: Bearer mykey' \
  --header 'Content-Type: application/json' \
  --data '{
    "url": "https://example.com",
    "formats": ["markdown"]
  }'
```

---

## What to expect

This fork is optimized for people who are comfortable running their own scraping infrastructure and making deliberate tradeoffs.

You should expect:

- more local control
- more divergence from upstream defaults
- more willingness to favor successful scraping over conservative policy enforcement
- more need to understand your own deployment

You should **not** expect:

- cloud parity with the official hosted product
- official Firecrawl support
- upstream compatibility guarantees for every rebase

---

## Upstream relationship

This repository is derived from the upstream Firecrawl project:

- Upstream repo: <https://github.com/firecrawl/firecrawl>
- Upstream docs: <https://docs.firecrawl.dev>
- Upstream hosted service: <https://firecrawl.dev>

This fork should preserve required attribution and licensing notices from upstream.

If you want the official product direction, official support, and cloud-only features, upstream is the right source of truth.

---

## Intended use

Firecrawl Unleashed is intended for:

- self-hosted scraping and crawling
- research and experimentation
- internal tools
- private or operator-authorized automation

It is **your responsibility** to comply with applicable laws, site terms, policies, and authorization requirements.

---

## Contributing

This is a fork optimized for local control rather than strict upstream compatibility.

Contributions are welcome, especially if they improve:

- self-host ergonomics
- observability
- browser reliability
- anti-breakage during upstream rebases
- documentation of local deviations

---

## Rebase strategy

If you track upstream, expect occasional merge pain in areas such as:

- `apps/api/src/controllers/auth.ts`
- `apps/api/src/scraper/WebScraper/crawler.ts`
- `apps/api/src/services/worker/scrape-worker.ts`
- `apps/playwright-service-ts/*`
- `docker-compose.yaml`

Document local deltas clearly and keep them small where possible.

---

## License

This fork remains subject to the upstream licensing terms unless explicitly stated otherwise in a given directory or component. See the repository `LICENSE` and per-directory notices where applicable.
