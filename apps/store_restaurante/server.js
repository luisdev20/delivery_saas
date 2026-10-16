const http = require('http');
const fs = require('fs');
const path = require('path');

// Carga simple de .env local (sin dependencias externas)
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const PORT = 3001;
const SAAS_URL = process.env.SAAS_URL || 'http://localhost:3000';
const API_KEY = process.env.DELIVERY_API_KEY || '';

function renderIndex() {
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  return html.replace(/__SAAS_URL__/g, SAAS_URL);
}

const server = http.createServer(async (req, res) => {
  // Proxy server-side hacia la API de despacho.
  // La clave de API vive SOLO aquí (nunca viaja al navegador).
  if (req.url.startsWith('/api/v1/')) {
    if (!API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Falta DELIVERY_API_KEY en el .env de la tienda.' }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);

    try {
      const upstream = await fetch(SAAS_URL + req.url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No se pudo contactar el servicio de despacho.' }));
    }
    return;
  }

  // Estáticos: sirve index.html con la URL del SaaS inyectada
  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderIndex());
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error cargando la tienda');
  }
});

server.listen(PORT, () => {
  console.log(`🔥 Tienda Restaurante "Fuego & Carbón" corriendo en http://localhost:${PORT}`);
  console.log(`🔌 Conectada al motor logístico SaaS en ${SAAS_URL}`);
  console.log(API_KEY
    ? '🔑 API key cargada de forma segura en el servidor.'
    : '⚠️  Falta DELIVERY_API_KEY en .env (copia .env.example).');
});
