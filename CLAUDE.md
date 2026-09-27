# NexAdib — project handbook & handoff

> **خلاصه برای صاحب پروژه (فارسی):**
> - **وضعیت:** پنل NexAdib روی کلادفلر نصب شده و کار می‌کند.
> - **کارهای انجام‌شده:** مراحل M0 تا M7، یعنی کاربران، ساب برای همه‌ی اپ‌ها، IP ثابت کشورها، اپراتور و IP تمیز، ثبت مصرف و داشبورد.
> - **کارهای باقی‌مانده:**
>   - M8: فیلتر سایت
>   - M9: WireGuard برای گیم
>   - M10: مدیریت خودکار چند حساب کلادفلر
>   - M11 و M12: صفحه‌های امنیت، گزارش و پشتیبان‌گیری، و مستندات
> - **کار بعدی خودت:** یک دامنه‌ی شخصی بخر و وصل کن، چون `workers.dev` در ایران فیلتر است.
> - **کاربرد این فایل:** همه‌ی قوانین و جزئیات این فایل برای برنامه‌نویس یا مدل بعدی است. Claude Code آن را خودکار می‌خواند.

---

## 0. How to work with this user (read first)
- **Language:** always reply in **Persian (فارسی)**, in simple, step-by-step language. The owner isn't a developer, often uses a phone, and sends screenshots.
- **Budget:** the owner has a limited budget. So:
  - Be efficient and avoid long explorations.
  - Finish one milestone at a time, then commit and push.
- **Commits and PRs:**
  - Commit messages end with the attribution trailer the harness provides.
  - Never put model names or identifiers in commits or code.
  - Don't open PRs unless asked.
- **Secrets:** never write secrets in the repo, including panel paths, passwords and API keys. If the owner pastes a password or key in chat, don't use it and tell them to change it.
- **ToS evasion:** don't add obfuscation meant to evade Cloudflare detection. The owner was told about the ToS risk.

## 1. Product (decided with the owner)
- **What it is:** a personal proxy panel that runs entirely on Cloudflare: Workers, D1 and a cron trigger. No servers.
  - Only the owner logs in. No resellers or agents (removed on purpose).
  - The owner creates customer configs and subscription links.
- **Customer plans:**
  - Data: 1 GB to unlimited.
  - Duration: 1 month to unlimited, or custom days.
  - Start on first use (on-hold), device limit, and daily/weekly/monthly reset.
- **Protocols:** VLESS and Trojan over WebSocket (TLS), with early data.
- **Fixed-IP countries:** TR, DE, FI, IT, FR, US, BG.
  - Exits are public ProxyIPs now, health-checked and sticky per user (HRW hashing).
  - SOCKS5/HTTP exits are supported for when the owner buys proxies.
  - AI domains always leave via the "AI country" (default US).
- **Iranian operators:** operator selection and per-ISP clean IPs.
  - The ISP is auto-detected from `request.cf.asn`, or the subscriber picks it.
- **Subscriptions for every app:**
  - base64 links, Clash/Mihomo YAML, sing-box 1.12+ JSON, and Xray JSON with TLS fragment.
  - The format is chosen by User-Agent or `?f=`.
  - Browsers get the subscriber portal instead.
- **Planned / not built yet:**
  - WireGuard/WARP for gaming.
  - Site filtering (adult/malware/ads/gambling/custom).
- **Multi-account (not built yet):** every Cloudflare account runs an **independent** panel with its own worker and D1.
  - Each panel will contain an account manager: log in with Gmail + Global API Key, or an API Token.
  - From there it auto-deploys, updates, does SSO and switches between accounts. The owner has 5 accounts.
  - **Cloudflare keys are never stored server-side**, only in an optional AES-GCM vault in the browser.
- **Out of scope for v1:**
  - Telegram bot and external configs.
  - Shadowsocks, gRPC and XHTTP.
  - Android app and resellers.
- **Licensing:** features and UX follow the Nova/Nahan panels, but **no code is copied**. Nova 4.9.3 is PolyForm Noncommercial. The name, colors and texts are NexAdib's own.

## 2. Repos, deploy, live instance
- **Canonical repo:** `NexAdib/Panel-Nex`, branch **`main`**.
  - Every push to `main` auto-deploys to production through Cloudflare Workers Builds. **Keep `main` green.**
- **Mirror:** `mlmvpn/adib` (private), branch `claude/charming-cori-tw8bwy`.
  - GitHub access: `mlmvpn` is a Write collaborator on Panel-Nex, and the Claude GitHub App is installed on NexAdib for Panel-Nex only.
  - The NexAdib account must **never** get access to mlmvpn's repos.
- **Workers Builds:**
  - Build command: `npm run build`. Deploy command: `npx wrangler deploy`.
  - `wrangler.jsonc` runs `npm run build:ui` as its custom build.
  - The D1 `DB` is auto-provisioned and the cron `*/5 * * * *` comes from config.
- **Live instance:**
  - Cloudflare account `Nexadibb@gmail.com`, worker `nexadib`, URL `nexadib.nexadibb.workers.dev`.
  - `/install` is done and the owner is logged in.
  - `workers.dev` is filtered in Iran, so the owner will buy a custom domain. Then:
    - Worker → Domains → Add Domain.
    - In the panel, open «ساب و پروتکل‌ها» and fill in «دامنه‌های کانفیگ».
- **Alternative install:** paste `dist/worker.js` (from `npm run build`) into the dashboard editor, bind D1 as `DB` and add the cron.

## 3. Commands
```bash
npm install
npm run dev            # wrangler dev (custom build embeds UI); or scripts/dev-server.sh [--fresh] (background, 127.0.0.1:8787)
npm run typecheck      # worker + UI tsconfigs
npm run lint           # biome check .   (fix: npx biome check --write .)
npm test               # vitest: unit + integration (Miniflare/workerd, real WebSockets)
npm run build          # dist/worker.js single file (UI embedded + __NEXADIB_SELF__ payload), size-checked
node scripts/screens.mjs <base> <panelPath> <user> <pass> <outDir> name:#/route:fa:dark:1366x860[:click|nologin]
#   hash starting with @ = path from site root (e.g. the portal @/<sub>/<token>)
```
- **Real client validators** (optional): set `NEXADIB_VALIDATORS=<dir>` containing `sing-box`, `mihomo`, `xray`, `geosite.dat` and `geoip.dat`, then run `test/unit/sub-validate.test.ts`.
  - The sandbox blocks GitHub releases, but the Go proxy works.
  - sing-box: `go install -tags with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api github.com/sagernet/sing-box/cmd/sing-box@latest`
  - Xray: `go install github.com/xtls/xray-core/main@latest`, then rename the binary to `xray`.
  - Mihomo: copy the module source out of GOMODCACHE and run `go build` (its replace directives break `go install`).
- **Stopping a dev server:** kill it by PID. Never `pkill -f` a pattern that is in your own command line.

## 4. Architecture & code map
- **Entry point:** `src/worker/index.ts`. It runs `ensureSchema` (embedded migrations) → `isInstalled`, or else `/install`. Then it routes:
  - A WebSocket upgrade under `wsPath` goes to the proxy.
  - `panelPath` goes to the panel (Hono app).
  - `subPath` goes to the subscription handler.
  - Anything else goes to the static **decoy**.
- **`db/`**
  - `migrations.ts`: schema v1. Not released yet, so editing v1 is still OK. Add v2+ for changes after release.
  - `settings.ts`: zod schema per group, deep merge, optimistic `version`. The panel, sub and ws paths must differ.
  - `users.ts` (`deriveStatus`, `toDto`), `operators.ts`, `exits.ts`, `meta.ts`, `audit.ts`.
- **`auth/`**
  - PBKDF2 passwords.
  - Session cookie `nx_s`: HttpOnly, SameSite=Strict, scoped to the panel path.
  - D1 rate limit: per IP, and per username at 10× the IP limit.
  - TOTP with recovery codes (backend done; the UI page isn't built yet).
- **`api/`** (the Hono app is in `panel.ts`)
  - CSRF: mutations need the `x-nexadib: 1` header plus a same-origin `Origin`.
  - Route files: `users`, `plans`, `exits`, `operators`, `stats` (`/stats/overview`, `/users/:id/usage`) and `system` (`/system/info`, `/system/maintenance`, `/settings/:group`).
- **`proxy/`**
  - `ws.ts`: `WsSource`. `binaryType='arraybuffer'` is required, because workerd delivers a Blob otherwise. Early data comes from `Sec-WebSocket-Protocol` and is echoed back.
  - `protocol.ts`: VLESS and Trojan parsing.
  - `session.ts`: `runSession`, and `pipeTcp`, which replays the first bytes through the next hop if the target closes without sending data. `Guard` re-checks the user periodically. UDP to port 53 is bridged to DNS over TCP.
  - `route.ts`: routing policy. `RouteDecision.block` is already supported (it calls `noteBlocked()`).
  - `users.ts`: LRU cache, `checkAccess`, and `deviceKey` (IPv6 is counted per /64).
  - `meter.ts`: each isolate writes one journal row per flush.
  - `dial.ts`: hops (direct, proxyip, socks5, http, nat64).
- **`exits/`**
  - `select.ts`: HRW ordering.
  - `health.ts`: TLS through the exit to `www.cloudflare.com/cdn-cgi/trace`, reading `ip=` and `loc=`. A second probe decides the scope (`cf` or `all`). An exit is marked unhealthy after 2 failures in a row.
  - `net.ts` (SOCKS5 and HTTP CONNECT), `resolve.ts` (DoH, NAT64), `import.ts`.
- **`sub/`**
  - `nodes.ts`: Auto plus one group per allowed country, spread over clean IPs, ports and protocols. Info nodes go at `127.0.0.1:1`.
  - Format builders: `uri.ts`, `clash.ts` (with its own safe `yaml.ts`), `singbox.ts`, `xray.ts`.
  - `detect.ts` (User-Agent), `headers.ts` (`subscription-userinfo`, `profile-title`…).
  - `service.ts`: `prepare`, `render`, `chooseOperator`, `configHosts`. The operator order is `?op=` → saved choice → ASN → `all`.
  - `handler.ts`: `/<sub>/<token>`, `/info`, `/op` (CSRF-protected) and `/assets/*`. Unknown tokens get the decoy.
- **`usage/`**
  - `aggregate.ts`: folds the journal into `users`, `usage_daily`, `usage_global_daily` and `user_ips` in ONE batch through `json_each`. A run token in `meta` makes it exactly-once.
  - `maintenance.ts`: lease lock, resets (daily at local midnight; weekly/monthly rolling without drift), expiry, retention, and a lazy runner for panel/sub requests.
  - `lock.ts`.
- **`policy/domains.ts`:** `DomainSet` (suffix match).
- **UI (`src/ui`)**
  - Stack: Preact, @preact/signals, Tailwind v4 and Vite 8.
  - `panel/pages/*`: Dashboard (charts), users (list, form, detail with a usage chart, bulk), Plans, Exits, Operators and Subscription.
  - Pages not built yet show `ComingSoon`: warp, filter, accounts, security, logs, system.
  - `portal/`: the subscriber page. Its strings are in `portal/strings.ts`, so the portal doesn't load the panel dictionaries.
  - `common/`:
    - `lang.ts`: language state plus core strings.
    - `i18n.ts`: panel dictionaries (`locales/en.ts`, which uses `as const`, and `locales/fa.ts`). Add every key to both.
    - `components/`: `ui`, `overlay`, `qr` (local QR), `chart` (SVG bars and donut), `logo`.
    - `format.ts`: Persian calendar through `Intl`.
- **`src/shared/`**
  - `constants.ts`: presets, countries, operators with ASNs, AI domains, gambling list, WARP and amnezia presets.
  - `settings.ts`: groups `general`, `proxy`, `sub`, `exits`, `filter`, `warp` and `security`, with defaults.
  - `types.ts`: DTOs.
  - `apps.ts`: client apps, verified deep links and store links.
  - `template.ts`.
- **Tests**
  - Unit tests are in `test/unit`.
  - Integration tests are in `test/integration`. `harness.ts` provides `startWorker` and `installAndLogin`; `clients.ts` has the VLESS/Trojan WebSocket clients.
  - There are 109 tests.

## 5. Engineering rules learned the hard way
- **D1 binding:** `.bind()` must supply exactly the parameter count. That count is the highest `?N` in the statement.
- **D1 numbers:** JS numbers bind as REAL, so use `CAST(x / y AS INTEGER)` for integer division.
- **D1 batch size:** keep per-run D1 work constant with JSON parameters and `json_each`. Add indexes for periodic queries (`ix_users_status (status, expire_at)`, `ix_users_reset`).
- **Free-plan limits:** 100k requests/day, 10 ms CPU per request, and D1 at 5M rows read and 100k writes per day.
- **Data path:** no D1 writes per connection. Usage goes only through the journal. Maintenance never runs on the data path.
- **Usage counters:** admin saves must not overwrite `used_*`. `saveUser` writes them only on an explicit reset.
- **Cloudflare IPs:** `connect()` cannot reach Cloudflare IPs. That's why ProxyIP exits exist. Client DoH in configs is `https://8.8.8.8/dns-query`, not 1.1.1.1.
- **Config formats:**
  - Xray: use `wsSettings.host`, not `headers.Host` (deprecated).
  - sing-box: target 1.12+ (checked against 1.12 and 1.14).
  - Mihomo: use `geodata-mode` with GEOSITE `category-ir`, `category-ads-all` and `category-porn`.
- **User text in the UI:** use `dir="auto"` or `<bdi>` for user-supplied text. Charts are LTR and measure their own width.
- **Tests:** integration tests boot one workerd per file, so vitest `maxWorkers` is 4. After a change, run typecheck, lint and tests, and for UI work take screenshots.

## 6. Done (M0–M7) ✅
1. **M0–M1:** scaffold, install (race-safe, optional `SETUP_TOKEN`), login and sessions, CSRF, rate limit, decoy, SPA shell (fa/en, dark/light, RTL).
2. **M2:** users CRUD, bulk actions, CSV export, batch create, plans (templates), unique credentials per user.
3. **M3–M4:** data plane — VLESS, Trojan, early data, DNS over TCP, metering, on-hold activation, exit enforcement.
4. **M5:** fixed-IP exits (proxyip, socks5, http, nat64), health checks, HRW stickiness, AI routing, import.
5. **M6:** subscriptions in every format, validated by the real clients; UA detection; headers; operators and clean-IP API and UI; subscription settings page; subscriber portal with 13-app one-tap import, QR and operator picker.
6. **M7:** usage aggregation, limits, expiry, resets, dashboard (30-day chart, status donut, top users, exits, recent activity), per-user usage chart and IPs.
7. **Deploy:** one-click GitHub import to Cloudflare; the live instance is working.

## 7. Remaining work (in priority order the owner may choose)
### M8 — Site filtering (settings group `filter` already exists)
- **New module `src/worker/policy/filter.ts`:** build a verdict for a domain in this order:
  1. `customDomains` (`DomainSet`) and `customKeywords` (substring match).
  2. Gambling: `GAMBLING_DOMAINS` and `GAMBLING_KEYWORDS` from constants.
  3. DoH categories. A blocked answer is `0.0.0.0` or `::`:
     - adult + malware: `https://family.cloudflare-dns.com/dns-query`
     - malware only: `https://security.cloudflare-dns.com/dns-query`
     - ads: `https://dns.adguard-dns.com/dns-query`
  - Cache verdicts in a per-isolate `TtlLru` for about 1 h.
  - DoH timeout is about 1.5 s, and **fail open** on timeout.
- **Hook into `proxy/route.ts`:** return `{ block: true }`.
  - Skip users with `filterExempt`.
  - Run the check **in parallel** with dialing so it adds no latency.
  - The domain comes from the request or from `sniffHost`.
- **Client side:** in `sub/service.ts`, `blockAds` = `sub.rules.blockAds || filter.ads`, and the same for porn. Add custom domains to the Clash (`DOMAIN-SUFFIX,x,REJECT`), sing-box (`domain_suffix` + reject) and Xray rules, except for exempt users.
- **UI:** a «فیلتر و هوش مصنوعی» page with toggles, custom lists and a test box. Blocked counts already reach `usage_global_daily.blocked`.
- **Tests:** unit tests for the matcher, plus an integration test with a mocked DoH (inject a `fetch` stub or env override).

### M9 — WARP / WireGuard for gaming (settings group `warp` and table `warp_accounts` exist)
- **How it connects:** the client connects DIRECTLY to Cloudflare WARP, not through the worker, so UDP works. Usage cannot be metered; the tunnel is only revoked.
- **Per-user registration:**
  - Generate an X25519 key pair with WebCrypto, then POST to the WARP API (`https://api.cloudflareclient.com/v0a<ver>/reg`).
  - Store the keys, peer key, addresses, `reserved` (from `client_id`), `device_id` and token.
  - Register lazily, on first request.
- **Outputs:**
  - `.conf` and `wireguard://`.
  - sing-box `endpoints` of type `wireguard`.
  - Clash `wireguard` with `amnezia-wg-option` (use `AMNEZIA_PRESETS`).
  - Xray `wireguard` outbound.
  - Gaming defaults: MTU 1280, keepalive 25.
- **Revocation:** in maintenance, when a user is disabled, expired or deleted (`warp_accounts.status='revoke'`), call DELETE on the registration.
- **UI:** a panel WARP page and a 🎮 section in the portal. Users' `warp_enabled` flag already exists.

### M10 — Cloudflare multi-account manager (biggest item)
- **API client:** Global key via `X-Auth-Email` + `X-Auth-Key`, or `Authorization: Bearer` for a token.
- **Deploy steps, each driven by the browser, one small worker request per step:**
  1. Create the D1 database.
  2. Upload the script as multipart: metadata `main_module`, `bindings: [{type:'d1',name:'DB',id}]`, `compatibility_date`. The code comes from the `__NEXADIB_SELF__` payload, which is base64 gzip of the core bundle built by `scripts/build.mjs`.
  3. Set the cron through the schedules API.
  4. Enable the workers.dev subdomain.
  5. Optionally attach a custom domain.
  6. Seed the database through the D1 query API using `buildInstallStatements()` from `install.ts`. It accepts `panelPath` and `subPath` overrides.
- **SSO:** a one-time token hashed into `sso_tokens` of the target panel, then a redirect.
- **Other parts:**
  - Log in with Cloudflare credentials by matching the panel's `instance_id`.
  - GraphQL analytics for requests per day.
  - "Update all".
  - An AES-GCM browser vault. Never store keys server-side.
- **UI:** a «حساب‌های کلادفلر» page.
- **Tests:** use fetch mocks. The sandbox can't reach `api.cloudflare.com`.

### M11–M12 — Finish UI & hardening
- **Security page:**
  - Change password.
  - 2FA setup with a QR code and recovery codes (backend `auth/totp.ts` exists).
  - Sessions list and revoke.
  - Change the panel path.
- **Other pages:** Logs (`audit_log`), and System (backup/restore as JSON, version).
- **Polish:** Ctrl+K search, PWA.
- **Hardening:** CSP review, CPU and size budget, README in fa/en, a DEPLOY guide with screenshots, and a release workflow. The CI workflow is in `.github/workflows/ci.yml`.
- **Ideas:**
  - A browser-side clean-IP scanner in the portal.
  - Suggest the owner makes Panel-Nex private (Workers Builds supports private repos).

## 8. Owner's pending actions
- Buy a domain, add it to Cloudflare (Free plan, set the nameservers), then Worker → Domains → Add Domain, then enter it in the panel.
- Add clean IPs per operator on the «اپراتورها و IP تمیز» page.
- Change the GitHub password that was shared in chat, and enable 2FA.
