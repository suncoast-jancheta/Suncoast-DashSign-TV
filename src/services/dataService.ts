import { PlaylistItem, Screen, ScreenGroup, MediaContent, Website, ReportEntry, Folder, Workspace, User } from '../types';

const TOKEN_KEY = 'signhub_token';

export interface PlayerData {
  screen: Screen;
  content: MediaContent[];
  websites: Website[];
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

class DataService {
  private meCache: { workspace: Workspace; user: User } | null = null;

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.meCache = null;
  }

  async login(password: string): Promise<void> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(data.error || 'Login failed', res.status);
    localStorage.setItem(TOKEN_KEY, data.token);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    const token = this.getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && typeof options.body === 'string') headers.set('Content-Type', 'application/json');

    const res = await fetch(path, { ...options, headers });
    if (res.status === 401 && !path.startsWith('/api/player/')) {
      this.logout();
      if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/play')) {
        window.location.href = '/login';
      }
      throw new ApiError('Unauthorized', 401);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError((data as { error?: string }).error || `Request failed (${res.status})`, res.status);
    return data as T;
  }

  async init() {
    // No-op: data lives in Cloudflare D1 now.
  }

  private async getMe() {
    if (!this.meCache) {
      this.meCache = await this.request<{ workspace: Workspace; user: User }>('/api/me');
    }
    return this.meCache;
  }

  async getWorkspace(): Promise<Workspace> {
    return (await this.getMe()).workspace;
  }

  async getUser(): Promise<User> {
    return (await this.getMe()).user;
  }

  // Content
  async getContent(): Promise<MediaContent[]> {
    return this.request<MediaContent[]>('/api/content');
  }

  async createContent(content: Omit<MediaContent, 'id' | 'uploadDate'>, fileBlob?: Blob): Promise<MediaContent> {
    if (fileBlob) {
      const form = new FormData();
      form.append('file', fileBlob, content.name);
      form.append('name', content.name);
      form.append('type', content.type);
      if (content.duration != null) form.append('duration', String(content.duration));
      if (content.folderId) form.append('folderId', content.folderId);
      form.append('orientation', content.orientation);
      return this.request<MediaContent>('/api/content', { method: 'POST', body: form });
    }
    return this.request<MediaContent>('/api/content', { method: 'POST', body: JSON.stringify(content) });
  }

  async updateContent(id: string, updates: Partial<MediaContent>): Promise<MediaContent> {
    return this.request<MediaContent>(`/api/content/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  async deleteContent(ids: string[]): Promise<void> {
    await this.request('/api/content/delete', { method: 'POST', body: JSON.stringify({ ids }) });
  }

  // Folders
  async getFolders(): Promise<Folder[]> {
    return this.request<Folder[]>('/api/folders');
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    return this.request<Folder>('/api/folders', { method: 'POST', body: JSON.stringify({ name, parentId }) });
  }

  // Websites
  async getWebsites(): Promise<Website[]> {
    return this.request<Website[]>('/api/websites');
  }

  async createWebsite(website: Omit<Website, 'id'>): Promise<Website> {
    return this.request<Website>('/api/websites', { method: 'POST', body: JSON.stringify(website) });
  }

  async deleteWebsite(id: string): Promise<void> {
    await this.request(`/api/websites/${id}`, { method: 'DELETE' });
  }

  // Screens
  async getScreens(): Promise<Screen[]> {
    return this.request<Screen[]>('/api/screens');
  }

  async getScreen(id: string): Promise<Screen | undefined> {
    try {
      return await this.request<Screen>(`/api/screens/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  async createScreen(screen: Omit<Screen, 'id' | 'workspaceId' | 'status' | 'playlist' | 'ipAddress'>): Promise<Screen> {
    return this.request<Screen>('/api/screens', { method: 'POST', body: JSON.stringify(screen) });
  }

  async updateScreen(id: string, updates: Partial<Screen>): Promise<Screen> {
    return this.request<Screen>(`/api/screens/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  async deleteScreen(id: string): Promise<void> {
    await this.request(`/api/screens/${id}`, { method: 'DELETE' });
  }

  // Groups
  async getGroups(): Promise<ScreenGroup[]> {
    return this.request<ScreenGroup[]>('/api/groups');
  }

  async getGroup(id: string): Promise<ScreenGroup | undefined> {
    try {
      return await this.request<ScreenGroup>(`/api/groups/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return undefined;
      throw e;
    }
  }

  async createGroup(group: Omit<ScreenGroup, 'id' | 'workspaceId' | 'playlist'>): Promise<ScreenGroup> {
    return this.request<ScreenGroup>('/api/groups', { method: 'POST', body: JSON.stringify(group) });
  }

  async updateGroup(id: string, updates: Partial<ScreenGroup>): Promise<ScreenGroup> {
    return this.request<ScreenGroup>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  async deleteGroup(id: string): Promise<void> {
    await this.request(`/api/groups/${id}`, { method: 'DELETE' });
  }

  // Reports
  async getReports(): Promise<ReportEntry[]> {
    return this.request<ReportEntry[]>('/api/reports');
  }

  // Player (public — no auth, used by the display devices)
  async getPlayerData(screenId: string): Promise<PlayerData | null> {
    const res = await fetch(`/api/player/${screenId}`);
    if (!res.ok) return null;
    return res.json();
  }

  reportPlayback(screenId: string, contentName: string, duration: number): void {
    // Fire-and-forget proof-of-play logging.
    fetch(`/api/player/${screenId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentName, duration }),
    }).catch(() => undefined);
  }
}

export const dataService = new DataService();
export type { PlaylistItem };
