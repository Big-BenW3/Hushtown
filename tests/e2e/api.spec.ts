import { expect, test } from '@playwright/test';

/** Black-box checks against the real running server (not the in-process handlers). */
test.describe('http api', () => {
  test('health reports ok without leaking anything about rooms', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/token|BCDF/);
  });

  test('sends security headers on pages and disables caching on the api', async ({ request }) => {
    const page = await request.get('/');
    const headers = page.headers();
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-powered-by']).toBeUndefined();

    const api = await request.get('/api/health');
    expect(api.headers()['cache-control']).toContain('no-store');
  });

  test('rejects malformed, oversized and mistyped bodies', async ({ request }) => {
    const badJson = await request.post('/api/rooms', { headers: { 'content-type': 'application/json' }, data: '{nope' });
    expect(badJson.status()).toBe(400);

    const wrongType = await request.post('/api/rooms', { headers: { 'content-type': 'text/plain' }, data: '{"name":"Ada"}' });
    expect([400, 415]).toContain(wrongType.status());

    const huge = await request.post('/api/rooms', { data: { name: 'Ada', pad: 'x'.repeat(10_000) } });
    expect(huge.status()).toBe(413);

    const extra = await request.post('/api/rooms', { data: { name: 'Ada', isHost: true } });
    expect(extra.status()).toBe(400); // strict schema: unknown fields are refused
  });

  test('rejects hostile names', async ({ request }) => {
    for (const name of ['', ' ', 'a'.repeat(40), 'a‮b', 'a​b', '<script>alert(1)</script>'.repeat(3)]) {
      const res = await request.post('/api/rooms', { data: { name } });
      expect(res.status(), JSON.stringify(name)).toBe(400);
    }
  });

  test('actions need a valid bearer token and never accept it in the query string', async ({ request }) => {
    const created = await request.post('/api/rooms', { data: { name: 'Ada' } });
    expect(created.status()).toBe(201);
    const { code, token } = await created.json();

    const none = await request.post(`/api/rooms/${code}/action`, { data: { type: 'ack' } });
    expect(none.status()).toBe(401);

    const wrong = await request.post(`/api/rooms/${code}/action`, { headers: { authorization: 'Bearer nope' }, data: { type: 'ack' } });
    expect(wrong.status()).toBe(401);

    const viaQuery = await request.post(`/api/rooms/${code}/action?token=${token}`, { data: { type: 'ack' } });
    expect(viaQuery.status()).toBe(401);

    const unknownAction = await request.post(`/api/rooms/${code}/action`, { headers: { authorization: `Bearer ${token}` }, data: { type: 'explode' } });
    expect(unknownAction.status()).toBe(400);
  });

  test('never reveals secrets in a snapshot', async ({ request }) => {
    const created = await (await request.post('/api/rooms', { data: { name: 'Ada' } })).json();
    const join = await (await request.post(`/api/rooms/${created.code}/join`, { data: { name: 'Bola' } })).json();
    const snapshot = await request.get(`/api/rooms/${created.code}`, { headers: { authorization: `Bearer ${created.token}` } });
    expect(snapshot.status()).toBe(200);
    const text = await snapshot.text();
    expect(text).not.toContain(join.token);
    expect(text).not.toContain(created.token);
  });

  test('unknown or malformed room codes give a clean 404/400 and no stack traces', async ({ request }) => {
    for (const code of ['ZZZZ', 'abcd', '../etc', 'A'.repeat(50)]) {
      const res = await request.post(`/api/rooms/${encodeURIComponent(code)}/join`, { data: { name: 'Ada' } });
      expect([400, 404]).toContain(res.status());
      expect(await res.text()).not.toMatch(/\bat [\w.<>]+ \(|node_modules|TypeError|\.ts:\d/);
    }
  });

  test('the live stream refuses anonymous callers', async ({ request }) => {
    const created = await (await request.post('/api/rooms', { data: { name: 'Ada' } })).json();
    const res = await request.get(`/api/rooms/${created.code}/events`);
    expect(res.status()).toBe(401);
  });

  test('a flood from one client is rate limited rather than crashing the server', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 80; i++) statuses.push((await request.post('/api/rooms/ZZZZ/join', { data: { name: 'Ada' } })).status());
    expect(statuses).toContain(429);
    // The server is still healthy afterwards.
    await new Promise((r) => setTimeout(r, 1500));
    expect((await request.get('/api/health')).status()).toBe(200);
  });
});
