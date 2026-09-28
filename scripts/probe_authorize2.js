const http = require('http');
const fs = require('fs');
const out = [];
const w = (s) => { out.push(String(s)); console.log(s); };

function req(method, path, body, headers, timeout = 25000) {
  return new Promise((resolve) => {
    const opts = { host: '127.0.0.1', port: 23119, path, method, headers: Object.assign({ 'Zotero-API-Version': '3' }, headers || {}) };
    let payload = null;
    if (body != null) {
      payload = body;
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const r = http.request(opts, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on('error', (e) => resolve({ status: 0, headers: {}, body: 'ERR ' + e.message }));
    r.setTimeout(timeout, () => { r.destroy(); resolve({ status: -1, headers: {}, body: 'TIMEOUT(可能正在等待用户在 Zotero 里确认)' }); });
    if (payload) r.write(payload, 'utf8');
    r.end();
  });
}

(async () => {
  const g = await req('GET', '/api/users/0/collections?limit=1');
  const sid = g.headers['zotero-server-id'];

  const variants = [
    { name: 'query ?appName=', path: '/api/local/authorize?appName=WorkBuddy', body: undefined },
    { name: 'form body appName', path: '/api/local/authorize', body: 'appName=WorkBuddy' },
    { name: 'json body {appName}', path: '/api/local/authorize', body: undefined, json: { appName: 'WorkBuddy' } },
  ];
  for (const v of variants) {
    w('\n--- ' + v.name + ' ---');
    let r;
    if (v.json) {
      r = await req('POST', v.path, JSON.stringify(v.json), Object.assign({ 'Zotero-Server-ID': sid, 'Content-Type': 'application/json' }));
      // 上面 Content-Type 被覆盖为 json
    } else {
      r = await req('POST', v.path, v.body, { 'Zotero-Server-ID': sid });
    }
    w('status: ' + r.status);
    w('body: ' + r.body.slice(0, 400));
    if (r.status === 200) {
      fs.writeFileSync(__dirname + '/auth_result.json', r.body, 'utf8');
      w('>>> 成功，已保存 auth_result.json');
      break;
    }
  }
  fs.writeFileSync(__dirname + '/probe_auth2.txt', out.join('\n'), 'utf8');
})();
