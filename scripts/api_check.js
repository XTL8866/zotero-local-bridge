const http = require('http');

function get(path) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 23119, path, headers: { 'Zotero-API-Version': '3' } }, (res) => {
      let b = '';
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: e.message }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: -1, body: 'timeout' }); });
  });
}

(async () => {
  const r = await get('/api/users/0/collections?limit=3');
  console.log('GET /collections ->', r.status, r.body.slice(0, 200));
})();
