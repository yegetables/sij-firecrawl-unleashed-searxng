# Firecrawl Unleashed

**An unofficial, self-host-first fork of Firecrawl with relaxed guardrails for operator-controlled deployments.**

Informally: **Firecrawl, but with some hosted-product constraints loosened for local use.**

> [!WARNING]
> This fork intentionally diverges from upstream Firecrawl behavior.
>
> It is **not affiliated with or endorsed by** Firecrawl or the Firecrawl team.
>
> If you want the official managed product, cloud-only capabilities, or upstream support guarantees, use the upstream project at [`firecrawl/firecrawl`](https://github.com/firecrawl/firecrawl) and the hosted service at [firecrawl.dev](https://firecrawl.dev).

---

## What this repo is

Firecrawl Unleashed starts from the upstream Firecrawl codebase and preserves the familiar **scrape / crawl / map / search** workflow where practical, but favors:

- **self-hosting**
- **operator control**
- **local experimentation**
- **more permissive defaults for authorized/private use cases**

This repository is best understood as an **operator-tuned Firecrawl fork**, not a promise of upstream parity.

---

## Why this fork exists

Upstream Firecrawl is built to serve both open-source users and a hosted product.  
This fork exists for people who want a version that is easier to run locally and easier to adapt to their own environment.

Goals:

- keep the Firecrawl API shape and ergonomics where possible
- reduce friction for private/self-hosted deployments
- make local behavior easier to reason about and modify
- allow more aggressive customization than upstream is likely to accept

---

## What differs from upstream

Depending on the current patch set, this fork may differ from upstream in areas such as:

- crawl filtering behavior
- robots handling
- self-host auth / feature gating
- browser-service behavior
- bundled services in `docker-compose.yaml`

Upstream documentation is still a useful baseline, but **this fork can diverge materially** from upstream behavior.

---

## Included stack

The local compose stack currently includes:

- Firecrawl API
- Playwright-based browser microservice
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

## Upstream relationship

This repository is derived from the upstream Firecrawl project:

- Upstream repo: <https://github.com/firecrawl/firecrawl>
- Upstream license: see `LICENSE`
- Upstream docs: <https://docs.firecrawl.dev>

This fork should preserve required attribution and licensing notices from upstream.

If you want the official product direction, official support, and cloud-only capabilities, upstream is the right source of truth.

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
- `docker-compose.yaml`

Document local deltas clearly and keep them small where possible.

---

## License

This fork remains subject to the upstream licensing terms unless explicitly stated otherwise in a given directory or component. See the repository `LICENSE` and per-directory notices where applicable.
