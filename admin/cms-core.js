(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CmsCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  function encodeContent(text) {
    const value = String(text || '');
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(value)));
  }

  function decodeContent(content) {
    const value = String(content || '').replace(/\n/g, '');
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8');
    }
    return decodeURIComponent(escape(atob(value)));
  }

  function extractBody(raw) {
    const text = String(raw || '');
    if (!text.startsWith('---')) return text.trim();

    const lines = text.split(/\r?\n/);
    let closingIndex = -1;

    for (let index = 1; index < lines.length; index += 1) {
      if (lines[index].trim() === '---') {
        closingIndex = index;
        break;
      }
    }

    if (closingIndex === -1) return text.trim();
    return lines.slice(closingIndex + 1).join('\n').trim();
  }

  function buildPostContent(title, body, dateIso) {
    return [
      '---',
      'layout: default',
      'title: ' + String(title || ''),
      'date: ' + String(dateIso || ''),
      '---',
      '',
      String(body || '')
    ].join('\n');
  }

  function buildAboutContent(body) {
    return [
      '---',
      'layout: default',
      'title: About',
      'permalink: /about/',
      '---',
      '',
      String(body || '')
    ].join('\n');
  }

  function createGithubContentStore(octokit, config) {
    return {
      async get(path) {
        const response = await octokit.repos.getContent({ ...config, path });
        const data = response.data;
        return {
          sha: data.sha,
          text: decodeContent(data.content)
        };
      },

      async save(path, message, text, sha) {
        return octokit.repos.createOrUpdateFileContents({
          ...config,
          path,
          message,
          content: encodeContent(text),
          sha: sha || undefined
        });
      },

      async remove(path, message, sha) {
        return octokit.repos.deleteFile({
          ...config,
          path,
          message,
          sha
        });
      }
    };
  }

  return {
    encodeContent,
    decodeContent,
    extractBody,
    buildPostContent,
    buildAboutContent,
    createGithubContentStore
  };
}));
