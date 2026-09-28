const http = require('http');

function req(method, path, headers) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port: 23119, path, method, headers: Object.assign({ 'Zotero-API-Version': '3' }, headers) }, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b.slice(0, 200) }));
    });
    r.on('error', reject);
    r.end();
  });
}

(async () => {
  const a = await req('GET', '/api/users/0/collections?limit=1');
  console.log('GET status', a.status);
  console.log('headers:', JSON.stringify(a.headers, null, 2));

  // 故意 POST 一个空数组，看 428 响应头是否带 server id
  const b = await req('POST', '/api/users/0/collections', { 'Content-Type': 'application/json', 'Content-Length': 2 }, '[]');
  console.log('\nPOST(empty) status', b.status, b.body);
  console.log('headers:', JSON.stringify(b.headers, null, 2));
})();
