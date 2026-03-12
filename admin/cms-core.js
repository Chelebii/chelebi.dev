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

  function dataUrlToBase64(dataUrl) {
    const value = String(dataUrl || '').trim();
    const match = value.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) {
      throw new Error('Avatar data must be a base64 image data URL.');
    }
    return {
      mimeType: match[1].toLowerCase(),
      base64: match[2]
    };
  }

  async function uploadProfileAvatar(options) {
    const settings = options || {};
    const workerUrl = String(settings.workerUrl || '').trim();
    const token = String(settings.token || '').trim();
    const avatar = dataUrlToBase64(settings.imageDataUrl || settings.dataUrl || '');

    if (!workerUrl) {
      throw new Error('Avatar upload endpoint is not configured.');
    }

    if (!token) {
      throw new Error('GitHub token is required to save the avatar.');
    }

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        imageBase64: avatar.base64,
        mimeType: avatar.mimeType,
        targetPath: settings.targetPath || 'assets/profile-avatar.png',
        backupPath: settings.backupPath || 'assets/profile-avatar-backup.png',
        sourcePath: settings.sourcePath || 'assets/profile.jpg',
        commitMessage: settings.commitMessage || 'cms: update profile avatar',
        backupMessage: settings.backupMessage || 'cms: backup profile avatar'
      })
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      throw new Error((payload && payload.error) || 'Avatar upload failed.');
    }

    return payload || { ok: true };
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
    dataUrlToBase64,
    uploadProfileAvatar,
    createGithubContentStore
  };
}));
