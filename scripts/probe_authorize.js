// 探测本地 API 写授权流程
const http = require('http');
const fs = require('fs');
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

function req(method, path, body, headers, timeout = 8000) {
  return new Promise((resolve) => {
    const opts = { host: '127.0.0.1', port: 23119, path, method, headers: Object.assign({ 'Zotero-API-Version': '3' }, headers || {}) };
    let payload = null;
    if (body != null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      opts.headers['Content-Type'] = typeof body === 'string' ? 'text/plain' : 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const r = http.request(opts, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', (e) => resolve({ status: 0, headers: {}, body: 'ERR ' + e.message }));
    r.setTimeout(timeout, () => { r.destroy(); resolve({ status: -1, headers: {}, body: 'TIMEOUT(等待用户在 Zotero 中确认?)' }); });
    if (payload) r.write(payload, 'utf8');
    r.end();
  });
}

(async () => {
  // 先拿 server id
  const g = await req('GET', '/api/users/0/collections?limit=1');
  const sid = g.headers['zotero-server-id'];
  w('server-id: ' + sid);

  const variants = [
    { name: 'POST /api/local/authorize (no body)', path: '/api/local/authorize', body: undefined },
    { name: 'POST /api/local/authorize (json name)', path: '/api/local/authorize', body: { name: 'WorkBuddy Zotero Bridge' } },
  ];
  for (const v of variants) {
    w('\n--- ' + v.name + ' ---');
    const r = await req('POST', v.path, v.body, { 'Zotero-Server-ID': sid });
    w('status: ' + r.status);
    w('headers: ' + JSON.stringify(r.headers));
    w('body: ' + r.body.slice(0, 500));
    if (r.status === 200) { fs.writeFileSync(__dirname + '/auth_result.json', r.body, 'utf8'); w('(已保存 auth_result.json)'); break; }
  }
  fs.writeFileSync(__dirname + '/probe_auth.txt', out.join('\n'), 'utf8');
})();
