// 极简 Zotero Local API 客户端（Zotero 7, 127.0.0.1:23119）
const http = require('http');

const HOST = '127.0.0.1';
const PORT = 23119;

function req(method, path, body, headers = {}, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const opts = {
      host: HOST, port: PORT, path, method,
      headers: Object.assign({
        'Zotero-API-Version': '3',
      }, headers),
    };
    let payload = null;
    if (body !== undefined && body !== null) {
      payload = typeof body === 'string' ? body : JSON.stringify(body);
      if (!('content-type' in opts.headers) && !('Content-Type' in opts.headers)) {
        opts.headers['Content-Type'] = typeof body === 'string' ? 'text/plain' : 'application/json';
      }
      opts.headers['Content-Length'] = Buffer.byteLength(payload, 'utf8');
    }
    const r = http.request(opts, (res) => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (b += d));
      res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on('error', reject);
    r.setTimeout(timeout, () => { r.destroy(); reject(new Error(`timeout ${timeout}ms: ${method} ${path}`)); });
    if (payload) r.write(payload, 'utf8');
    r.end();
  });
}

const get = (p) => req('GET', p);

// 本地 API 写操作必须带与服务器一致的 Zotero-Server-ID，
// 该值在任意 GET 响应头 `zotero-server-id` 中返回，且每次 Zotero 启动都会变。
let _serverId = null;
async function serverId() {
  if (_serverId) return _serverId;
  const r = await req('GET', '/api/users/0/collections?limit=1');
  _serverId = r.headers['zotero-server-id'];
  if (!_serverId) throw new Error('未能获取 zotero-server-id');
  return _serverId;
}

// ---- 本地 API 写授权密钥 ----
// 授权一次后 Zotero 返回 32 位 key；按 server id 存起来复用。
// 若当时点的是「允许」而非「始终允许」，key 一次性失效 -> 写请求返回 401，需重新 authorize。
const fs = require('fs');
const KEYS_FILE = __dirname + '/.zotero_keys.json';

function loadKeys() {
  try { return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8')); } catch (e) { return {}; }
}
function saveKey(sid, key) {
  const k = loadKeys();
  k[sid] = key;
  fs.writeFileSync(KEYS_FILE, JSON.stringify(k, null, 2), 'utf8');
}
function getKey(sid) {
  return loadKeys()[sid] || null;
}

const APP_NAME = 'WorkBuddy Zotero Bridge';

async function write(method, p, b, _retried) {
  const sid = await serverId();
  const key = getKey(sid);
  const headers = { 'Zotero-Server-ID': sid };
  if (key) headers['Zotero-API-Key'] = key;
  const r = await req(method, p, b, headers);
  // 单次授权("允许")的 key 用完即失效 -> 401。自动重新申请一次并重放。
  if (r.status === 401 && !_retried) {
    process.stdout.write('[授权已失效, 正在重新申请 —— 请在 Zotero 对话框中点「始终允许」]\n');
    const a = await authorize(APP_NAME);
    if (!a.key) return r;
    const h2 = { 'Zotero-Server-ID': sid, 'Zotero-API-Key': a.key };
    return req(method, p, b, h2);
  }
  return r;
}

const post = (p, b) => write('POST', p, b);
const patch = (p, b) => write('PATCH', p, b);
const del = (p) => write('DELETE', p);

// POST /api/local/authorize —— 会弹出 Zotero 对话框，需用户点「始终允许」
async function authorize(appName, timeout = 110000) {
  const sid = await serverId();
  const r = await req('POST', '/api/local/authorize', { appName },
    { 'Zotero-Server-ID': sid, 'Content-Type': 'application/json' }, timeout);
  let data = null;
  try { data = JSON.parse(r.body); } catch (e) {}
  const key = data && (data.key || (data.data && data.data.key));
  if (key) saveKey(sid, key);
  return { status: r.status, raw: r.body, key, remembered: data && (data.remember || data.isRemembered) };
}

async function getJson(p) {
  const r = await get(p);
  if (r.status !== 200) throw new Error(`GET ${p} -> ${r.status} ${r.body.slice(0, 300)}`);
  return JSON.parse(r.body);
}

// 分页拉取全部
async function getAll(p, cap = 100) {
  const out = [];
  let start = 0;
  while (true) {
    const sep = p.includes('?') ? '&' : '?';
    const chunk = await getJson(`${p}${sep}start=${start}&limit=${cap}`);
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    out.push(...chunk);
    if (chunk.length < cap) break;
    start += cap;
  }
  return out;
}

module.exports = { req, get, post, patch, del, getJson, getAll, serverId, authorize, saveKey, getKey, KEYS_FILE };
