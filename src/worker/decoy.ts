// What unknown visitors and scanners see. It is static on purpose: a reverse-proxy
// decoy would spend a subrequest per probe and could be used to exhaust the plan.

type DecoyMode = 'blank' | 'nginx' | 'site';

const NGINX_WELCOME = `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto;
font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and
working. Further configuration is required.</p>

<p>For online documentation and support please refer to
<a href="http://nginx.org/">nginx.org</a>.<br/>
Commercial support is available at
<a href="http://nginx.com/">nginx.com</a>.</p>

<p><em>Thank you for using nginx.</em></p>
</body>
</html>
`;

const NGINX_404 = `<html>
<head><title>404 Not Found</title></head>
<body>
<center><h1>404 Not Found</h1></center>
<hr><center>nginx</center>
</body>
</html>
`;

const SITE_HOME = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Coming soon</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: Canvas; color: CanvasText; }
  main { text-align: center; padding: 24px; }
  h1 { font-size: 28px; margin: 0 0 8px; font-weight: 600; }
  p { opacity: .7; margin: 0; }
</style>
</head>
<body><main><h1>We're working on something new</h1><p>Please check back soon.</p></main></body>
</html>
`;

function html(body: string, status: number, server?: string): Response {
  const headers = new Headers({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  if (server) headers.set('x-powered-by', server);
  return new Response(body, { status, headers });
}

export function decoy(request: Request, mode: DecoyMode): Response {
  const path = new URL(request.url).pathname;
  const home = path === '/' || path === '/index.html';
  switch (mode) {
    case 'blank':
      return new Response(null, { status: 404 });
    case 'site':
      return home ? html(SITE_HOME, 200) : html(NGINX_404, 404);
    default:
      return home ? html(NGINX_WELCOME, 200) : html(NGINX_404, 404);
  }
}
