// 请求 Zotero 本地写授权。运行后 Zotero 会弹出对话框，需用户点「始终允许(Always Allow)」。
const fs = require('fs');
const { authorize, serverId } = require('./api.js');

const APP = 'WorkBuddy Zotero Bridge';

(async () => {
  const sid = await serverId();
  console.log('server-id:', sid);
  console.log('正在请求授权, Zotero 应弹出对话框, 等待用户确认(最多 110 秒)...');
  const r = await authorize(APP);
  console.log('status:', r.status);
  console.log('body:', r.raw.slice(0, 300));
  console.log('key:', r.key);
  console.log('remembered(始终允许):', r.remembered);
  if (r.key) {
    console.log('\n已保存到 ' + require('./api.js').KEYS_FILE + ' (按 server-id 归档)');
  } else {
    console.log('\n未拿到 key。若是 403 说明点了 Deny；若是超时说明未确认。');
  }
  fs.writeFileSync(__dirname + '/authorize_result.txt',
    `status=${r.status}\nkey=${r.key}\nremembered=${r.remembered}\nbody=${r.raw.slice(0, 500)}\n`, 'utf8');
})().catch((e) => {
  console.error('ERR: ' + e.message);
  fs.writeFileSync(__dirname + '/authorize_result.txt', 'ERROR: ' + e.message, 'utf8');
  process.exit(1);
});
