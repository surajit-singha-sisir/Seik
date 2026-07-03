const base = 'http://127.0.0.1:3000';

const loginRes = await fetch(base + '/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
});
console.log('login status:', loginRes.status);
const loginJson = await loginRes.json().catch(() => null);
console.log('login body:', loginJson);
const cookie = loginRes.headers.get('set-cookie');
console.log('cookie:', cookie);

if (!cookie) process.exit(0);

const settingsRes = await fetch(base + '/api/settings', {
  headers: { Cookie: cookie.split(';')[0] },
});
console.log('settings status:', settingsRes.status);
const settingsJson = await settingsRes.json().catch(() => null);
console.log('settings body:', settingsJson);
