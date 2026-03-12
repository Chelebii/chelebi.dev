import test from 'node:test';
import assert from 'node:assert/strict';
import CmsCore from './cms-core.js';

function createFakeOctokit() {
  const files = new Map();
  let revision = 0;

  function nextSha() {
    revision += 1;
    return `sha-${revision}`;
  }

  return {
    files,
    repos: {
      async getContent({ path }) {
        const entry = files.get(path);
        if (!entry) {
          const error = new Error(`Not Found: ${path}`);
          error.status = 404;
          throw error;
        }
        return {
          data: {
            path,
            sha: entry.sha,
            content: CmsCore.encodeContent(entry.text)
          }
        };
      },
      async createOrUpdateFileContents({ path, content, sha, message }) {
        const existing = files.get(path);
        if (existing && sha && sha !== existing.sha) {
          throw new Error(`SHA mismatch for ${path}`);
        }
        if (!existing && sha) {
          throw new Error(`Unexpected sha for ${path}`);
        }
        files.set(path, {
          sha: nextSha(),
          text: CmsCore.decodeContent(content),
          message
        });
        return { data: files.get(path) };
      },
      async deleteFile({ path, sha, message }) {
        const existing = files.get(path);
        if (!existing) {
          throw new Error(`Cannot delete missing file ${path}`);
        }
        if (sha !== existing.sha) {
          throw new Error(`SHA mismatch for delete ${path}`);
        }
        files.delete(path);
        return { data: { path, message } };
      }
    }
  };
}

test('extractBody removes frontmatter and preserves markdown body', () => {
  const raw = ['---', 'layout: default', 'title: About', '---', '', '# Hello', '', 'Body'].join('\n');
  assert.equal(CmsCore.extractBody(raw), '# Hello\n\nBody');
});

test('create update delete post flow works through content store', async () => {
  const octokit = createFakeOctokit();
  const store = CmsCore.createGithubContentStore(octokit, { owner: 'Chelebii', repo: 'chelebi.dev', branch: 'main' });
  const path = '_posts/2026-03-11-test.md';

  const initial = CmsCore.buildPostContent('Test Post', 'hello world', '2026-03-11T00:00:00.000Z');
  await store.save(path, 'cms: update post 2026-03-11-test.md', initial);

  const created = await store.get(path);
  assert.match(created.text, /title: Test Post/);
  assert.match(created.text, /hello world/);

  const updatedText = CmsCore.buildPostContent('Test Post', 'updated body', '2026-03-11T00:00:00.000Z');
  await store.save(path, 'cms: update post 2026-03-11-test.md', updatedText, created.sha);

  const updated = await store.get(path);
  assert.match(updated.text, /updated body/);
  assert.notEqual(updated.sha, created.sha);

  await store.remove(path, `cms: delete post ${path}`, updated.sha);
  await assert.rejects(() => store.get(path), { status: 404 });
});

test('about save flow writes canonical about frontmatter', async () => {
  const octokit = createFakeOctokit();
  const store = CmsCore.createGithubContentStore(octokit, { owner: 'Chelebii', repo: 'chelebi.dev', branch: 'main' });

  await store.save('about.md', 'cms: update about page', CmsCore.buildAboutContent('About body here'));
  const about = await store.get('about.md');

  assert.match(about.text, /^---/);
  assert.match(about.text, /title: About/);
  assert.equal(CmsCore.extractBody(about.text), 'About body here');
});

test('uploadProfileAvatar posts png payload and auth token to worker', async () => {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, backupPath: 'assets/profile-avatar-backup.png' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const result = await CmsCore.uploadProfileAvatar({
    workerUrl: 'https://worker.example/api/avatar-upload',
    token: 'gh-token',
    imageDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pW8QAAAAASUVORK5CYII='
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://worker.example/api/avatar-upload');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer gh-token');

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.mimeType, 'image/png');
  assert.equal(body.targetPath, 'assets/profile-avatar.png');
  assert.equal(body.backupPath, 'assets/profile-avatar-backup.png');
  assert.match(body.imageBase64, /^iVBORw0KGgo/);
});

test('uploadProfileAvatar rejects invalid data urls before sending', async () => {
  await assert.rejects(() => CmsCore.uploadProfileAvatar({
    workerUrl: 'https://worker.example/api/avatar-upload',
    token: 'gh-token',
    imageDataUrl: 'not-a-data-url'
  }), /base64 image data URL/);
});
