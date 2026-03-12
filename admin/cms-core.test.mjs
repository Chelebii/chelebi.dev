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
  const raw = ['---', 'layout: default', 'title: Sample', '---', '', '# Hello', '', 'Body'].join('\n');
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
