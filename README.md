# NexAdib

Personal, first-class proxy panel that runs entirely on **Cloudflare Workers**:
VLESS/Trojan over WebSocket, per-user subscription links for every major client,
fixed-IP country exits, operator-aware clean IPs, WARP/WireGuard for gaming,
AI-friendly routing, site filtering, and a built-in manager that installs and
switches between independent panels on several Cloudflare accounts.

> Status: under active development. See `docs/` as milestones land.

## نصب روی کلادفلر (Deploy)

1. در داشبورد کلادفلر: **Workers & Pages → Create → Import a repository**.
2. مخزن **NexAdib/Panel-Nex** را انتخاب کن.
3. نام پروژه را دقیقاً **`nexadib`** بگذار و بقیه‌ی تنظیمات را دست نزن، بعد **Deploy**.
   دیتابیس D1 و زمان‌بندی ۵ دقیقه‌ای خودکار ساخته می‌شوند.
4. آدرس ورکر را با `/install` باز کن (مثلاً `https://nexadib.<subdomain>.workers.dev/install`)،
   نام کاربری و رمز مدیر را بساز و **آدرس مخفی پنل** را ذخیره کن.
5. هر push به برنچ `main` پنل را خودکار آپدیت می‌کند.

> `workers.dev` در ایران فیلتر است: برای کانفیگ‌ها یک دامنه‌ی شخصی به ورکر وصل کن
> (Settings → Domains & Routes) و آن را در صفحه‌ی «ساب و پروتکل‌ها» وارد کن.

## Development

```bash
npm install
npm run dev        # wrangler dev with local D1
npm test           # unit + integration tests
npm run build      # single-file dist/worker.js (UI embedded)
```
