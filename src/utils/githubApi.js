/**
 * GitHub REST API Client for ATM10 Codex Studio
 * Allows reading and committing .md files directly to a GitHub repository.
 */

export class GitHubClient {
  constructor(owner, repo, token, branch = 'main') {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this.branch = branch;
  }

  get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Fetch list of files in a directory in the repository
   */
  async listFiles(path = '') {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
    return await res.json();
  }

  /**
   * Fetch raw content of a specific file from the repository
   */
  async getFile(filePath) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${filePath}?ref=${this.branch}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`Failed to fetch file: ${res.statusText}`);
    const data = await res.json();
    
    // Decode base64 content
    const content = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))));
    return {
      content,
      sha: data.sha,
      path: data.path,
      name: data.name
    };
  }

  /**
   * Commit (create or update) a file directly in the GitHub repository
   */
  async saveFile(filePath, content, message = 'Update codex entry via Codex Studio', sha = null) {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${filePath}`;
    
    // Base64 encode content handling UTF-8 characters
    const encodedContent = btoa(unescape(encodeURIComponent(content)));

    const body = {
      message: message,
      content: encodedContent,
      branch: this.branch
    };

    if (sha) {
      body.sha = sha;
    } else {
      // Check if file already exists to get its SHA
      try {
        const existing = await this.getFile(filePath);
        if (existing && existing.sha) {
          body.sha = existing.sha;
        }
      } catch (e) {
        // File doesn't exist yet, proceed with new file creation
      }
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to commit file to GitHub');
    }

    return await res.json();
  }
}
