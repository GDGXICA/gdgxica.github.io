import { GITHUB_API_BASE, GITHUB_DATA_REPO, GITHUB_SITE_REPO } from "../config";

interface GitHubFileResponse {
  content: string;
  sha: string;
  name: string;
  path: string;
}

export class GitHubService {
  constructor(private token: string) {}

  private async request(
    method: string,
    url: string,
    body?: Record<string, unknown>
  ): Promise<Response> {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `token ${this.token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`GitHub API ${method} ${url}: ${res.status} ${error}`);
    }

    return res;
  }

  async getFile(path: string): Promise<GitHubFileResponse> {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_DATA_REPO}/contents/${path}`;
    const res = await this.request("GET", url);
    return res.json() as Promise<GitHubFileResponse>;
  }

  async getFileContent<T>(path: string): Promise<{ data: T; sha: string }> {
    const file = await this.getFile(path);
    const content = Buffer.from(file.content, "base64").toString("utf-8");
    return { data: JSON.parse(content) as T, sha: file.sha };
  }

  async putFile(
    path: string,
    content: string,
    message: string,
    sha?: string
  ): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_DATA_REPO}/contents/${path}`;
    const body: Record<string, unknown> = {
      message,
      content: Buffer.from(content).toString("base64"),
      branch: "main",
    };
    if (sha) body.sha = sha;
    await this.request("PUT", url, body);
  }

  async deleteFile(path: string, message: string, sha: string): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_DATA_REPO}/contents/${path}`;
    await this.request("DELETE", url, { message, sha, branch: "main" });
  }

  async triggerRebuild(): Promise<void> {
    const url = `${GITHUB_API_BASE}/repos/${GITHUB_SITE_REPO}/dispatches`;
    await this.request("POST", url, {
      event_type: "data-updated",
      client_payload: { source: "admin-panel" },
    });
  }
}
