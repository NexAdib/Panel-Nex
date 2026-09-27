# NexAdib

Personal, first-class proxy panel that runs entirely on **Cloudflare Workers**:
VLESS/Trojan over WebSocket, per-user subscription links for every major client,
fixed-IP country exits, operator-aware clean IPs, WARP/WireGuard for gaming,
AI-friendly routing, site filtering, and a built-in manager that installs and
switches between independent panels on several Cloudflare accounts.

> Status: under active development. See `docs/` as milestones land.

## Development

```bash
npm install
npm run dev        # wrangler dev with local D1
npm test           # unit + integration tests
npm run build      # single-file dist/worker.js (UI embedded)
```
