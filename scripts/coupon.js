// Manage access codes (data/coupons.json). Each code is for one teacher and works once, on one device, by default.
//   npm run coupon -- create --for "Teacher X1"            a random one-time code
//   npm run coupon -- create --code COUPON1 --for "X1"      a code you choose
//   npm run coupon -- create --for "X2" --max 2 --days 30   2 devices, expires in 30 days
//   npm run coupon -- list
//   npm run coupon -- reset COUPON1                         lets the same teacher redeem again (new phone)
//   npm run coupon -- revoke COUPON1                        stops it now, even for someone already inside
// A revoked or expired code ends its sessions immediately. If you use a remote service (ACCESS_API_URL)
// manage codes there instead.
const access = require('../lib/access');

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : fallback; };

if (cmd === 'create') {
  const code = access.create({ code: flag('code'), max: Number(flag('max', 1)), days: Number(flag('days', 0)), note: flag('for', flag('note', '')) });
  console.log('Created access code:  ' + code + (flag('for') ? '   (for ' + flag('for') + ')' : ''));
} else if (cmd === 'list') {
  const rows = access.list();
  if (!rows.length) console.log('No codes yet. Create one with: npm run coupon -- create --for "Teacher X1"');
  rows.forEach((r) => console.log(`${r.code}  used ${r.uses}/${r.max || '∞'}  ${r.revoked ? 'REVOKED' : r.expires ? 'expires ' + r.expires.slice(0, 10) : 'no expiry'}  ${r.note || ''}`));
} else if (cmd === 'revoke') {
  console.log(access.revoke(rest[0]) ? 'Revoked.' : 'No such code.');
} else if (cmd === 'reset') {
  console.log(access.reset(rest[0]) ? 'Reset: the code can be redeemed once more.' : 'No such code.');
} else {
  console.log('Usage: npm run coupon -- create | list | reset CODE | revoke CODE');
  process.exitCode = 1;
}
