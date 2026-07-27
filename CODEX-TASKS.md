# Remaining code changes — EnterpriseResilienceAgent

**Written 2026-07-27**, after actually deploying this repo with `docker-compose.prod.yml` on Ubuntu
24.04 (Docker Engine 29.6.2, Compose v5.3.1). Every task below was verified against the code as it
stands at commit `9d9cd9d` — nothing here is copied from a template or guessed from reading.

**The headline:** `docker compose -f docker-compose.prod.yml up -d` **cannot serve a working app today.**
Two defects stop it, and neither is environment-specific — they reproduce on any host following
`DEPLOYMENT_UBUNTU.md`. Tasks 1 and 2 fix them. Everything after that is real but not blocking.

> ✅ **Tasks 1 and 2 have been applied and verified end to end**, using your own `Dockerfile.api` (not a
> workaround). Result: the `api` container reached `Nest application successfully started`,
> `/api/platform/status` went from `500` to `200` with a valid JSON body, and every route listed below
> returned `200`. The patches were then reverted, so this file is a description of work still to do — but
> the two code changes in it are known-good, not proposed.

What *does* work once Tasks 1–2 land: the SPA and all its routes, `/api/services`, `/api/incidents`,
`/api/runbooks`, `/api/auth/session`, `/api/auth/users`, `/api/mlops/frameworks`, schema self-creation
(all 9 tables) and demo seeding. Confirmed on a real deploy.

**Tasks 10–15 come from a second pass**, a whole-repo review rather than a deploy, run the same day. That
pass also **ran your test suite** — see Task 10, because it does not currently pass.

**How to use this file.** Each task is self-contained: the exact file, the current code, the replacement
code, why it matters, and how to check it. Apply them one at a time, in order, one commit each.

**Severity:** 🔴 blocks a working deploy, or leaves the test suite red · 🟠 deployment/security ·
🟡 correctness/docs

| Task | | Summary |
|---|---|---|
| 1 | 🔴 | `contracts` has no build — the API container cannot start |
| 2 | 🔴 | Invalid SQL — `/api/platform/status` always returns 500 |
| 3 | 🟠 | `.env` never reaches the containers, so the documented config is inert |
| 4 | 🟠 | No restart policy and no readiness gating |
| 5 | 🟡 | A failed DB init is cached forever |
| 6 | 🟠 | MCP HTTP defaults to `0.0.0.0` and can start unauthenticated |
| 7 | 🟠 | Identity is a request header — anyone can claim `admin` |
| 8 | 🟡 | The documented backup/restore commands cannot work |
| 9 | 🟡 | `DEPLOYMENT_UBUNTU.md` fixes (firewall, volumes, stale steps) |
| 10 | 🔴 | Seeded metric samples displace real ones — and the test suite is red because of it |
| 11 | 🟠 | No test ever executes SQL, which is how Task 2's bug shipped |
| 12 | 🟡 | Breach evaluation duplicated 228 tokens inside one file |
| 13 | 🟡 | `fallbackMetricValue` exists twice with identical bodies |
| 14 | 🟡 | Five README links point at a local `/Users/rudan/…` path |
| 15 | 🟡 | *(optional, do last)* AWS/GCP adapters share synthetic-metric shaping |

---

## Task 1 — Give `@enterprise-resilience/contracts` a real build 🔴 blocker

**Files:** `packages/contracts/package.json`, new `packages/contracts/tsconfig.json`, `Dockerfile.api`

### Why

The `api` container exits immediately, every time:

```
Error: Cannot find package '/app/node_modules/@enterprise-resilience/contracts/src/index.ts'
  imported from /app/apps/api/dist/common/store.service.js
  code: 'ERR_MODULE_NOT_FOUND'
```

Three things combine:

1. `packages/contracts/package.json` declares **`"main": "./src/index.ts"`** — a TypeScript entry point.
   There is no `build` script and no `dist/`.
2. `apps/api/tsconfig.json` has `"include": ["src/**/*.ts"]`, so `nest build` compiles only the API's own
   sources. `@enterprise-resilience/contracts` is resolved for *types* via the `paths` mapping in
   `tsconfig.base.json` but is **never emitted**, and the compiled JS keeps the bare specifier
   `from "@enterprise-resilience/contracts"`.
3. At runtime Node resolves that specifier through the workspace symlink to `main` → a `.ts` file it
   cannot execute. `Dockerfile.api`'s runner stage copies only `packages/contracts/package.json`, so the
   file is not even in the image.

This is **not** a types-only package — it exports runtime values that `StoreService` needs:
`seedServices`, `seedRunbooks`, `seedIncidents`, `seedAuditEvents`, `seedMlopsCapabilityProfile`,
`seedLlmopsCapabilityProfile`, `seedToolLayerFits`. It works in development only because `nest start`
executes TypeScript directly.

`Dockerfile.web` is unaffected — Vite bundles the source at build time, so nothing is resolved at
runtime.

### Change 1 of 3 — `packages/contracts/package.json`

```json
{
  "name": "@enterprise-resilience/contracts",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "devDependencies": {
    "typescript": "^5.7.2"
  }
}
```

### Change 2 of 3 — new `packages/contracts/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true
  },
  "include": ["src/**/*.ts"]
}
```

The root `build` script already runs `--workspaces --if-present`, so it picks this up with no further
change. Leaving the `paths` mapping in `tsconfig.base.json` as-is is deliberate: editors and
`typecheck` keep resolving to source, which is the nicer development experience, while Node resolves to
`dist/` at runtime.

### Change 3 of 3 — `Dockerfile.api`

In the **builder** stage, build contracts before the API:

```dockerfile
RUN npm ci
RUN npm run build --workspace @enterprise-resilience/contracts
RUN npm run build --workspace @enterprise-resilience/api
```

In the **runner** stage, ship the compiled output alongside the API's:

```dockerfile
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
```

### Check

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # api must be Up, not restarting
docker compose -f docker-compose.prod.yml logs api | tail -3
```

Expect the logs to end with `Nest application successfully started`.

**Verified 2026-07-27:** with exactly these three changes and the unmodified `Dockerfile.api`, the api
container started cleanly and stayed `Up`. The `contracts` build adds ~4s to the image build.

---

## Task 2 — Fix the SQL in `listMetricHistory` 🔴 blocker

**File:** `apps/api/src/common/store.service.ts`

### Why

`GET /api/platform/status` returns `500` on every call:

```
severity: 'ERROR', code: '42703', routine: 'errorMissingColumn', position: '403'
  at StoreService.listMetricHistory
  at buildMetricAlert (platform.service.js:116)
  at PlatformService.getStatus (platform.service.js:167)
```

This is the endpoint `DEPLOYMENT_UBUNTU.md` tells the reader to `curl` to verify a deployment, and it
backs the `/platform` page — so the documented verification step fails on a *correct* deployment.

In `listMetricHistory` the inner subquery selects only `payload` and `row_rank`, but the outer
`ORDER BY` references `created_at`, which is not a column of the derived table `ranked`:

```sql
select payload
from (
  select
    payload,                       -- created_at is not projected
    row_number() over (
      partition by metric_name
      order by created_at desc
    ) as row_rank
  from metric_history
  where service_id = $1 and metric_name = any($2::text[])
) ranked
where row_rank <= $3
order by (payload->>'metricName') asc, created_at asc     -- ← 42703 here
```

`created_at` exists on `metric_history`, but the outer query can only see what `ranked` exposes. This is
invalid in every Postgres version, and it fails at **parse** time — so it breaks even when
`metric_history` is empty, which is why it reproduces on a first-boot deploy.

### Change

Project the column through the subquery:

```sql
select payload
from (
  select
    payload,
    created_at,
    row_number() over (
      partition by metric_name
      order by created_at desc
    ) as row_rank
  from metric_history
  where service_id = $1 and metric_name = any($2::text[])
) ranked
where row_rank <= $3
order by (payload->>'metricName') asc, created_at asc
```

### Check

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/platform/status   # expect 200
curl -s http://localhost:8080/api/platform/status | head -c 300                      # expect JSON
```

Then open `/platform` in the browser.

**Verified 2026-07-27:** adding the single `created_at,` line took `/api/platform/status` from `500` to
`200`, returning `{"productName":"Enterprise Resilience Agent","deploymentMode":"container",…}`. No other
change was needed.

Worth a regression test. `apps/api/test/store.persistence.test.js` stubs the query layer, so it cannot
catch this class of bug — the SQL is only validated by a real Postgres. One test that runs
`listMetricHistory` against a live database would have caught it.

---

## Task 3 — Make `.env` actually reach the containers 🟠 deployment

**Files:** `docker-compose.prod.yml`, `DEPLOYMENT_UBUNTU.md`

### Why

`docker-compose.prod.yml` has **no `env_file:` key and no `${VAR}` interpolation**. It hardcodes:

```yaml
POSTGRES_DB/USER/PASSWORD: resilience
DATABASE_URL: postgresql://resilience:resilience@postgres:5432/resilience
APP_BASE_URL: http://localhost:8080
API_PUBLIC_URL: http://localhost:8080/api
```

`--env-file .env` passes the file to Compose for *variable substitution inside the compose file* — of
which there is none. So every one of the ~25 values `DEPLOYMENT_UBUNTU.md` asks the reader to fill in has
no effect whatsoever. Three consequences:

- The Security Checklist item **"change the default Postgres password"** is impossible by following the
  guide. The password stays `resilience`.
- `APP_BASE_URL` and `API_PUBLIC_URL` stay `localhost:8080` on any real deployment, and both are surfaced
  on the `/platform` page (`apps/api/src/platform/platform.service.ts:30-31`) — so the app misreports its
  own configuration.
- `ERA_ENABLED_CLOUD_PROVIDERS`, `METRIC_POLL_INTERVAL_MS` and the alert-tuning variables are unreachable.

### Change

```yaml
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: resilience
      POSTGRES_USER: resilience
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    env_file: .env
    environment:
      PORT: 3000
      DATABASE_URL: postgresql://resilience:${DB_PASSWORD:?set DB_PASSWORD in .env}@postgres:5432/resilience
      REDIS_URL: redis://redis:6379
```

The `:?` form fails loudly with a readable message instead of silently falling back to a default — worth
keeping for anything credential-shaped. Note that keys in `environment:` still win over `env_file:`, so
leave `DATABASE_URL` in `environment:` only if you want it derived; otherwise drop it and let `.env`
provide it.

Then update `DEPLOYMENT_UBUNTU.md` so its `.env` block uses `DB_PASSWORD` and drops the values that no
longer do anything.

### Check

```bash
# change DB_PASSWORD in .env, then:
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate postgres api
docker compose -f docker-compose.prod.yml exec -T postgres psql -U resilience -d resilience -c 'select 1'
curl -s http://localhost:8080/api/platform/status | grep -o '"url":"[^"]*"'
```

`APP_BASE_URL` and `API_PUBLIC_URL` are not returned as fields of their own — they appear inside the
`components[]` entries as `` `${appBaseUrl}/overview` `` and `apiBaseUrl`
(`platform.service.ts:278` and `:285`). So the last command should show your configured host, not
`localhost:8080` / `localhost:3000`.

---

## Task 4 — Add restart policies and gate on readiness 🟠 deployment

**File:** `docker-compose.prod.yml`

### Why

Two gaps that combine badly with Task 5:

- **No `restart:` key on any of the four services.** Any crash is permanent until a human intervenes.
- **`depends_on: [postgres, redis]`** is the short list form: it orders *startup* and waits only for the
  container to start, **not** for Postgres to accept connections. On a cold `up -d` with a fresh volume,
  Postgres runs `initdb` for several seconds while the API is already trying to connect.

### Change

```yaml
  postgres:
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U resilience -d resilience"]
      interval: 5s
      timeout: 5s
      retries: 20

  redis:
    restart: unless-stopped

  api:
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started

  web:
    restart: unless-stopped
```

### Check

```bash
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs api | tail -3
```

The startup log should show `postgres Waiting → postgres Healthy → api Starting`, and
`/api/platform/status` should answer on the first attempt. Repeat the cycle a few times — it should be
deterministic, which it is not today.

---

## Task 5 — Stop caching a rejected initialisation promise 🟡 correctness

**File:** `apps/api/src/common/store.service.ts`

### Why

```ts
private async ensureInitialized() {
  this.initPromise ??= this.initialize();
  await this.initPromise;
}
```

If the first `initialize()` rejects — Postgres not ready, wrong password, anything transient —
`initPromise` is left holding a **rejected** promise, and every subsequent call re-awaits that same
rejection. The API never recovers, even after the database becomes healthy. It needs a process restart,
and today there is no `restart:` policy to provide one (Task 4).

Task 4 removes the common trigger; this removes the permanence. Both are worth having.

### Change

```ts
private async ensureInitialized() {
  if (!this.initPromise) {
    this.initPromise = this.initialize().catch((error) => {
      this.initPromise = undefined;   // let the next caller retry
      throw error;
    });
  }
  await this.initPromise;
}
```

### Check

```bash
docker compose -f docker-compose.prod.yml stop postgres
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/services   # expect 500
docker compose -f docker-compose.prod.yml start postgres
sleep 5
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/api/services   # expect 200
```

The last call must succeed **without restarting the api container**. Today it does not.

---

## Task 6 — Don't let the MCP HTTP transport default to `0.0.0.0` 🟠 security

**Files:** `apps/api/src/mcp/http.ts`, `.env.example`, `DEPLOYMENT_UBUNTU.md`

### Why

- `apps/api/src/mcp/http.ts:8` — `const host = process.env.ERA_MCP_HTTP_HOST ?? "0.0.0.0"`. The default
  binds every interface.
- `:10` — `ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED === "true"` exists as an escape hatch.
- `.env.example` ships **every** `ERA_MCP_OIDC_*` value empty.

`DEPLOYMENT_UBUNTU.md`'s "Reverse Proxy For MCP HTTP" section recommends `127.0.0.1`, which is right —
but someone who copies the nginx block along with the `.env.example` values ends up with an MCP control
plane on a public hostname and no configured verification. For a service that can scale and restart ECS
services, the default should be the safe one.

### Change

```ts
const host = process.env.ERA_MCP_HTTP_HOST ?? "127.0.0.1";
```

and fail closed at startup:

```ts
const hasAuth = Boolean(bearerToken || oidcIssuer);
if (!hasAuth && !allowUnauthenticated) {
  throw new Error(
    "MCP HTTP refuses to start without auth. Set ERA_MCP_HTTP_BEARER_TOKEN or " +
      "ERA_MCP_OIDC_ISSUER, or set ERA_MCP_HTTP_ALLOW_UNAUTHENTICATED=true to override."
  );
}
```

Then state that requirement in `DEPLOYMENT_UBUNTU.md` next to the nginx block.

### Check

Start the MCP HTTP transport with no auth variables set — it should refuse with the message above rather
than listen. With `ERA_MCP_HTTP_BEARER_TOKEN` set, it should start and bind `127.0.0.1` unless
`ERA_MCP_HTTP_HOST` says otherwise.

---

## Task 7 — Identity is a request header 🟠 security · needs a decision, not just a patch

**File:** `apps/api/src/auth/auth.service.ts`

### Why

`getSession` (`auth.service.ts:19-42`) reads the `x-era-user` and `x-era-role` headers and, if the pair
appears in the demo directory, **becomes that user**. No password, no token, no signature:

```bash
curl -H 'x-era-user: admin.demo' -H 'x-era-role: admin' http://localhost:8080/api/platform/status
```

The directory is six hardcoded demo users (`viewer.demo` … `admin.demo`) unless `ERA_DEMO_USERS`
overrides it — so the valid pairs are readable in the source. With no headers at all, the caller silently
becomes `ERA_DEFAULT_USER_ID ?? "manager.demo"`, an incident-manager.

For a demo this is a reasonable role-switcher. The reason it is listed here is that this service exists to
scale, restart and roll back real ECS services, and `AWS_ECS_LIVE_EXECUTION=false` is currently the only
thing between an anonymous HTTP request and live infrastructure — one environment variable.

Note that a CDN or reverse proxy in front does not help: if the origin stays reachable by its own
hostname, the app's own auth is the only real protection.

### Change — the minimum that makes this safe

This is a design decision, so two smaller steps rather than one prescription:

1. **Gate the header path on demo mode.** Wrap the `headerUser || headerRole` branch in
   `process.env.APP_ENVIRONMENT === "demo"`, so header impersonation cannot be used in production.
2. **Refuse to boot in production without auth**, instead of defaulting to `manager.demo`.

The fuller fix is to verify a real token on the API. The plumbing already exists for MCP —
`ERA_MCP_OIDC_ISSUER`, `_AUDIENCE`, `_JWKS_URL`, `_ROLE_CLAIM`, `_ROLE_MAP_JSON` are all read in
`apps/api/src/mcp/http.ts:12-19`, and `jose` is already a dependency. Reusing that verification for the
API is much less work than introducing a second scheme, and keeps one role model.

### Check

With `APP_ENVIRONMENT=production` and no auth configured, the API should refuse to start. With auth
configured, `-H 'x-era-role: admin'` must **not** elevate, and a valid token must be accepted.

---

## Task 8 — Fix the documented backup and restore commands 🟡 docs

**File:** `DEPLOYMENT_UBUNTU.md`

### Why

The guide says:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres enterprise_resilience_agent > backup.sql
```

`docker-compose.prod.yml` creates user **`resilience`** and database **`resilience`**. Both the user and
the database name are wrong, so the backup *and* the restore fail as written. The `.env` naming
(`enterprise_resilience_agent`) never reaches the container — see Task 3.

### Change

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U resilience resilience > backup.sql
```

```bash
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U resilience resilience
```

`-T` matters on both: without it `exec` allocates a TTY and the command fails from any script, cron job or
systemd timer. If Task 3 lands first, drive both names from `.env` so the documented names are the real
ones.

### Check

Run the dump, confirm the file is non-empty and ends with `-- PostgreSQL database dump complete`, then
restore it into a scratch database and compare row counts against the live one.

---

## Task 9 — `DEPLOYMENT_UBUNTU.md` corrections 🟡 docs

**File:** `DEPLOYMENT_UBUNTU.md`

### Why and change

- **`sudo ufw enable` prompts `y/n`**, so it breaks unattended. Use `sudo ufw --force enable`.
- **`sudo ufw allow OpenSSH` opens port 22 only.** On any host whose SSH is on a different port, this
  sequence locks the operator out of their own server. Say "your actual SSH port", and verify before
  enabling. Worth a warning that enabling a default-deny firewall on a host reached through a VPN or
  tunnel can cut that path too.
- **The named volumes are outside the backup the guide describes.** `postgres_data` and `redis_data` live
  under `/var/lib/docker/volumes`, so a reader who backs up their app directory or home directory has
  *nothing*. Say so explicitly next to the Backups section, and prefer a scheduled dump over the manual
  one.
- **`git checkout main && git pull` immediately after `git clone` is a no-op** — drop both lines.
- **The systemd unit hardcodes `WorkingDirectory=/home/deploy/apps/EnterpriseResilienceAgent`** while the
  clone step uses `~/apps/`. They disagree, and the unit sets no `User=`.
- **"Recommended server: 2 vCPU / 4 GB" is a runtime figure.** Two `npm ci` runs over a five-workspace
  monorepo need materially more than serving does. Either split build from run requirements, or document
  building one service at a time (`docker compose build api`, then `... build web`).

### Check

Follow the guide top to bottom on a fresh VM. Every command should succeed in the order written, and
after Tasks 1–2 the four verification URLs and the `curl` of `/api/platform/status` should all pass.

---

## Task 10 — Seeded metric samples displace real ones, and the suite is red 🔴

**Files:** `apps/api/src/common/store.service.ts`

### Why

**Your test suite does not pass on `main`.** On a clean checkout of `9d9cd9d` with dependencies from the
committed lockfile, Node 22.20.0:

```
# tests 36    # pass 35    # fail 1
not ok 4 - persists and retains recent metric history per service and metric
   apps/api/test/store.persistence.test.js:458
   Expected values to be strictly equal:  648.38 !== 902
```

Deterministic — five consecutive runs gave identical output. The test is right about what it wants; the
product does something else, and the mechanism is worth fixing regardless of the test.

Three pieces combine:

1. **`initialize()` inserts fabricated history.** `store.service.ts:685-690` loops every seeded service and
   metric calling `buildSeedMetricPoints(service, metric.metricName, now)`, which
   (`store.service.ts:755-770`) produces **6 synthetic points** valued from `fallbackMetricValue` × a
   severity multiplier and timestamped `now - step * 5 * 60 * 1000` — i.e. anchored to **first-boot
   wall-clock time**.
2. **Real samples are timestamped by the caller.** `appendMetricSample` writes
   `created_at` from `record.timestamp`, not from insertion time.
3. **`listMetricHistory` orders `by created_at desc`** and keeps `limitPerMetric`.

So fabricated points and real ones live in one `metric_history` table with **nothing distinguishing
them**, and any real sample older than first boot is silently outranked and dropped from the window. The
test demonstrates it precisely: it appends 8 real `queue_depth` samples dated `2026-07-26T23:0x`, asks for
6, and gets seeded values back — the first being `648.38`, which is exactly `checkout-api`'s
`health.saturation × 10`. It never sees its own data.

**Why this matters beyond the test:** that same window is what `platform.service.ts:148-160` consumes to
compute `breachedMetrics`, requiring 3 consecutive breached samples — which is what opens an incident. So
fabricated values can **raise a breach no real metric supports**, or **mask one that real metrics do**.
For an incident-response tool that is the core function.

### Change — pick one

**Option A, preferred — mark seeded rows and prefer real data.** Add to the `metric_history` DDL in
`initialize()`:

```sql
synthetic boolean not null default false
```

Set it `true` on the seeding path only, then in `listMetricHistory` prefer real rows, falling back to
synthetic only when a metric has no real samples. This keeps the empty-dashboard-avoidance the seeding
exists for, while guaranteeing real data always wins.

**Option B, cheaper — anchor seeded timestamps in the past.** Base `buildSeedMetricPoints` on a fixed past
epoch instead of `now`, so any real sample outranks it. Less code, but it only postpones the collision
rather than removing the ambiguity.

### Check

```bash
npm run test:api        # expect: # fail 0, exit 0
```

The test at `store.persistence.test.js:458` should pass **unchanged** — if it does, the fix matches the
original intent. Then confirm against a real database that appended samples come back in preference to
seeded ones.

---

## Task 11 — No test ever executes SQL 🟠

**Files:** `apps/api/test/store.persistence.test.js`, plus one new integration test

### Why

`FakePostgresService` dispatches on **exact lowercased query text**. `store.persistence.test.js:28`
normalises the SQL:

```js
const sql = text.trim().replace(/\s+/g, " ").toLowerCase();
```

and `:298-300` hardcodes the entire `listMetricHistory` statement as a string literal to compare against.
No SQL in this repo is ever parsed or executed by a test.

**This is exactly how Task 2 shipped.** The invalid `ORDER BY created_at` was matched as a *string* and
answered by JavaScript, so five suites passed green while the production query could not parse at all
against Postgres.

There is a second, quieter failure mode: change a query's whitespace or a column and its `if` silently
stops matching. The fake falls through, and that branch's coverage disappears with no warning.

### Change

Keep the fake for pure logic tests — it is fast and fine for that. Add **one** integration test that uses
a real database:

```bash
docker compose up -d postgres
```

```js
// apps/api/test/store.integration.test.js — runs only when DATABASE_URL is set
import { PostgresService } from "../dist/common/postgres.service.js";
import { StoreService } from "../dist/common/store.service.js";

test("appendMetricSample then listMetricHistory returns the appended samples", async (t) => {
  if (!process.env.DATABASE_URL) return t.skip("set DATABASE_URL to run");
  const store = new StoreService(new PostgresService());
  await store.onModuleInit();
  // append a few samples, read them back, assert values and ordering
});
```

Gate it on `DATABASE_URL` so it skips rather than fails for anyone without Postgres running, and document
the one-liner in the README next to the dev instructions.

### Check

Point `DATABASE_URL` at a real Postgres and run the suite. Then deliberately reintroduce Task 2's bug —
delete `created_at,` from the subquery — and confirm the integration test **fails**. That is the property
worth having: it would have caught a `42703` that string matching could not.

---

## Task 12 — Breach evaluation duplicated inside one file 🟡

**File:** `apps/api/src/platform/platform.service.ts`

### Why

The largest duplicated block in the repo — **228 tokens**, and both copies are in this one file:

- `platform.service.ts:135-161`
- `platform.service.ts:511-536`

Byte-identical apart from indentation. Both compute `definitions` → `metricHistory` → `collectedAt` →
`breachedMetrics` → `warningMetrics`, including the same `samples.length === 3` gate, the same
`getThresholdStatus(...) === "breached"` test, and the same rule that a warning excludes an
already-breached metric.

**Failure path:** this is breach-detection logic feeding incident creation. Tighten the window from 3
samples to 5, or change the warning/breach precedence, in one copy and the two code paths silently
disagree about whether the same service is breached — so two endpoints report different states for one
service, and only one of them opens an incident.

### Change

Extract one private method and call it from both sites:

```ts
private async summarizeMetricState(
  provider: CloudProvider,
  targetService: string
): Promise<{
  definitions: MetricDefinition[];
  metricHistory: Map<string, StoredMetricSample[]>;
  collectedAt: number;
  breachedMetrics: string[];
  warningMetrics: string[];
}>
```

Both call sites become one `await` plus a destructure, and the bare `3` becomes a single named constant
(`BREACH_CONSECUTIVE_SAMPLES`) instead of a magic number written twice.

### Check

`npm run typecheck` clean, `npm run test:api` still green, and `/api/platform/status` plus the
per-target endpoint both return the same breach/warning state for the same service as before the change.

---

## Task 13 — `fallbackMetricValue` exists twice 🟡

**Files:** `apps/api/src/common/store.service.ts`, `apps/api/src/services/metric-policy.ts`

### Why

The same function, twice, with identical bodies:

- `store.service.ts:773-785` — `private fallbackMetricValue(service, metricName)`
- `metric-policy.ts:106-117` — `export function fallbackMetricValue(health, metricName)`

Same six-key map (`queue_depth`, `cpu_utilization`, `p95_latency_ms`, `request_error_rate`,
`request_latency_p95_ms`, `revision_health_score`), same `?? 0`. They differ only in signature — one takes
a `CloudService` and reads `.health`, the other takes `ServiceHealth`.

**They have not diverged yet, which is the reason to act now rather than later.** Two sets of consumers
read from different copies: `store.service.ts` uses the private one in `buildSeedMetricPoints` (`:756`),
while `metrics-collector.service.ts:71` and `services.service.ts:82` use the exported one. Change
`revision_health_score`'s formula, or add a metric, in one place and seeded history is computed on a
different scale than live collection **for the same metric name** — which is very hard to spot, because
both numbers look plausible.

### Change

Delete the private copy and import the exported one:

```ts
// apps/api/src/common/store.service.ts
import { fallbackMetricValue } from "../services/metric-policy.js";
// …in buildSeedMetricPoints:
const currentValue = fallbackMetricValue(service.health, metricName);
```

**This does not create a circular import,** which is the obvious worry given `services/` already imports
`common/`. `metric-policy.ts` imports only *types* from `@enterprise-resilience/contracts` and nothing
from `common/`, so `common/ → services/metric-policy` adds no cycle. Verified with `madge`, which reports
0 cycles across `apps/api/src` both before and after.

### Check

`npx madge apps/api/src --circular` still reports none, `npm run typecheck` clean, `npm run test:api`
green.

---

## Task 14 — Five README links point at a local path 🟡

**File:** `README.md`

### Why

Five links target your own machine, so they 404 for everyone reading the repo on GitHub:

| Line | Link text | Current target |
|---|---|---|
| 114 | `docs/user-guide.md` | `/Users/rudan/Documents/hobby_projects/EnterpriseResilienceAgent/docs/user-guide.md` |
| 148 | `.vscode/mcp.json.example` | same local prefix |
| 174 | `.env.example` | same local prefix |
| 211 | `DEPLOYMENT_UBUNTU.md` | same local prefix |
| 217 | `.vscode/mcp.json.example` | same local prefix |

The README is the repo's front door, and line 114 is where it sends non-technical readers for the full
business guide — the audience least able to work around a broken link. Secondary: it publishes your local
username and directory layout.

### Change

Make them repo-relative:

```markdown
[docs/user-guide.md](docs/user-guide.md)
[.vscode/mcp.json.example](.vscode/mcp.json.example)
[.env.example](.env.example)
[DEPLOYMENT_UBUNTU.md](DEPLOYMENT_UBUNTU.md)
```

### Check

```bash
grep -n "/Users/" README.md          # expect no output
```

Then view the README on GitHub and click all five.

---

## Task 15 — AWS and GCP adapters share synthetic-metric shaping 🟡 *(optional, do last)*

**Files:** `apps/api/src/cloud-adapters/providers/aws-operations.adapter.ts`,
`apps/api/src/cloud-adapters/providers/gcp-operations.adapter.ts`

### Why

Five duplicated blocks between the two adapters:

| AWS | GCP | tokens |
|---|---|---|
| `:54-61` | `:44-51` | 52 |
| `:83-100` | `:68-85` | 76 |
| `:102-114` | `:87-99` | 50 |
| `:116-130` | `:101-115` | 63 |
| `:167-178` | `:137-149` | 62 |

**The scope here is deliberately narrow, and most of these two files should stay separate.** AWS already
talks to `@aws-sdk/client-ecs` while GCP is still a stub; real provider code has no business being
unified, and forcing a shared abstraction over two clouds would be worse than the duplication. This is
listed only because a third provider would copy it a third time.

What is genuinely shared is the **demo-mode synthetic metric shaping**: look a value up, choose `"percent"`
vs `"count"` based on whether the metric name contains `"rate"`, attach a timestamp.

### Change

Extract just that into `apps/api/src/cloud-adapters/providers/synthetic-metrics.ts` and have both adapters
call it. Leave the provider-specific log strings (`"ECS service saturation detected…"` vs
`"Cloud Run serving logs confirm…"`) and every future real-SDK call exactly where they are.

**Not worth changing:** `aws-operations.adapter.ts:15-40` ↔ `gcp-operations.adapter.ts:5-30` is also
flagged by duplication detectors, but it is the identical 22-line `import type { … }` block. Real, and not
extractable — ignore it.

### Check

`npm run typecheck` clean and `npm run test:api` green, including
`aws.adapter.guardrails.test.js` and `gcp.adapter.guardrails.test.js`.

---

## Notes

- **Nothing in this file is done yet** — all fifteen tasks are open as of `9d9cd9d`.
- **Tasks 1 and 2 are the two that matter most.** Until both land, `docker-compose.prod.yml` cannot serve
  a working app, and that is the deployment path the README and `DEPLOYMENT_UBUNTU.md` both point at.
- The schema needs no migration tooling yet: `create table if not exists`
  (`store.service.ts:498+`) is fine while changes are additive. It stops being fine the first time a
  column changes type — not worth solving before then.

### Two things that look like work but are not

- **`npm audit` reports 22 high-severity packages. None of them is reachable.** Checked individually so
  you do not have to: 18 are Electron and build tooling (`electron-builder` and its tree, `@nestjs/cli`,
  `fork-ts-checker-webpack-plugin`, `glob`, `minimatch`, `rimraf`, `jake`, `ejs`, `temp`, `filelist`,
  `brace-expansion`) — dev-only, never in a shipped image. `find-my-way`'s advisory is a **HTTP/2** DDoS,
  and `apps/api/src/main.ts:9` constructs a bare `new FastifyAdapter()` with HTTP/2 off. `react-router`'s
  is an **RSC-mode** CSRF bypass, and the frontend is a Vite SPA, not React Server Components. Neither
  precondition holds. `npm audit fix --force` would churn your lockfile for no security gain.
- **No circular dependencies.** `madge` reports 0 cycles across `apps/api/src` — unusual for a Nest
  codebase this size, and worth keeping that way when you do Task 13.

### What was *not* checked

So that nothing here reads as a clean bill of health it has not earned:

- **No secrets scanning ran.** `gitleaks` was unavailable, so nothing was checked about credentials in the
  working tree or in git history. That is *not looked*, not *clean* — worth running yourself before the
  repo goes anywhere public.
- **No pattern-based security scan ran** (`semgrep` unavailable). Security coverage in this file is limited
  to what reading and dependency audit found.
- **No dead-code analysis ran.** `knip` needs a root `tsconfig.json` and this repo has only
  `tsconfig.base.json`, so it skipped. There may well be unused exports; nothing here says otherwise.
