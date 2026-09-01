const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

const server = http.createServer((req, res) => {
  const filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error cargando la tienda');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`🔥 Tienda Restaurante "Fuego & Carbón" corriendo en http://localhost:${PORT}`);
  console.log(`🔌 Conectada al motor logístico SaaS en http://localhost:3000`);
});
