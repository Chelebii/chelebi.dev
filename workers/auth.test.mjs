import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './auth.js';

const ONE_BY_ONE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pW8QAAAAASUVORK5CYII=';

function buildGithubContentResponse(path, sha, content) {
  return new Response(JSON.stringify({
    sha,
    content,
    path
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('avatar upload overwrites current avatar target', async () => {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const method = (init.method || 'GET').toUpperCase();

    if (String(url).includes('/contents/assets%2Fprofile-avatar.png?ref=main') && method === 'GET') {
      return buildGithubContentResponse('assets/profile-avatar.png', 'avatar-sha', 'ZXhpc3RpbmctYXZhdGFy');
    }

    if (String(url).includes('/contents/assets%2Fprofile-avatar.png') && method === 'PUT') {
      const body = JSON.parse(init.body);
      assert.equal(body.sha, 'avatar-sha');
      assert.equal(body.content, ONE_BY_ONE_PNG_BASE64);
      assert.equal(body.message, 'cms: update profile avatar');
      return new Response(JSON.stringify({ content: { sha: 'new-avatar-sha' }, commit: { sha: 'commit-avatar' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`);
  };

  const request = new Request('https://worker.example/api/avatar-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-token',
      'Origin': 'https://chelebi.dev'
    },
    body: JSON.stringify({
      imageBase64: ONE_BY_ONE_PNG_BASE64,
      mimeType: 'image/png'
    })
  });

  const response = await worker.fetch(request, {
    GITHUB_REPO_OWNER: 'Chelebii',
    GITHUB_REPO_NAME: 'chelebi.dev',
    GITHUB_REPO_BRANCH: 'main'
  });

  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.sha, 'new-avatar-sha');
  assert.equal(calls.length, 2);
});

test('avatar upload rejects non-png payloads', async () => {
  const request = new Request('https://worker.example/api/avatar-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-token',
      'Origin': 'https://chelebi.dev'
    },
    body: JSON.stringify({
      imageBase64: 'bm90LXBuZw==',
      mimeType: 'image/jpeg'
    })
  });

  const response = await worker.fetch(request, {});
  const payload = await response.json();

  assert.equal(response.status, 415);
  assert.match(payload.error, /image\/png/);
});
