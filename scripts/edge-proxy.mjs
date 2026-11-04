// A tiny stand-in for the Hestia nginx config, for local and CI testing of the production layout:
//   /api/*  → API (prefix stripped), including the WebSocket upgrade for /api/v1/live
//   /media/* → API /media/*
//   everything else → web
// Usage: EDGE_PORT=8080 API_INTERNAL_URL=http://127.0.0.1:3201 WEB_INTERNAL_URL=http://127.0.0.1:3200 node scripts/edge-proxy.mjs
import http from 'node:http';
import net from 'node:net';

const port = Number(process.env.EDGE_PORT ?? 8080);
const api = new URL(process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:3201');
const web = new URL(process.env.WEB_INTERNAL_URL ?? 'http://127.0.0.1:3200');

function target(url) {
  if (url.startsWith('/api/')) return { to: api, path: url.slice(4) };
  if (url.startsWith('/media/')) return { to: api, path: url };
  return { to: web, path: url };
}

const headersFor = (req) => ({
  ...req.headers,
  'x-forwarded-for': req.socket.remoteAddress ?? '',
  'x-forwarded-proto': 'http',
  'x-real-ip': req.socket.remoteAddress ?? '',
});

const server = http.createServer((req, res) => {
  const { to, path } = target(req.url ?? '/');
  const upstream = http.request({ host: to.hostname, port: to.port, method: req.method, path, headers: headersFor(req) }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('bad gateway');
  });
  req.pipe(upstream);
});

// WebSocket: replay the handshake to the upstream and splice the sockets (what nginx does with Upgrade/Connection).
server.on('upgrade', (req, socket, head) => {
  const { to, path } = target(req.url ?? '/');
  const upstream = net.connect(Number(to.port), to.hostname, () => {
    const lines = [`${req.method} ${path} HTTP/1.1`];
    for (const [k, v] of Object.entries(headersFor(req))) for (const val of [].concat(v)) lines.push(`${k}: ${val}`);
    upstream.write(lines.join('\r\n') + '\r\n\r\n');
    if (head?.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on('error', close);
  socket.on('error', close);
});

server.listen(port, '127.0.0.1', () => console.log(`edge proxy on http://127.0.0.1:${port} → api ${api.host}, web ${web.host}`));
