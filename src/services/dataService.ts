import {
  PlaylistItem,
  Screen,
  ScreenGroup,
  MediaContent,
  Website,
  ReportEntry,
  Folder,
  Workspace,
  User,
  UserRole,
  WorkspaceSettings,
  TransitionStyle,
} from '../types';

const TOKEN_KEY = 'signhub_token';

export interface PlayerData {
  screen: Screen;
  content: MediaContent[];
  websites: Website[];
  settings?: { transition: TransitionStyle };
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Me {
  workspace: Workspace;
  user: User;
  playerOrigin?: string | null;
}

class DataService {
  private meCache: Me | null = null;

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

  async login(username: string, password: string): Promise<void> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
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
      this.meCache = await this.request<Me>('/api/me');
    }
    return this.meCache;
  }

  /**
   * Base URL to advertise for player links/QR codes. During local dev the
   * server knows the machine's LAN address (LAN_ORIGIN), which devices on the
   * same network can reach — unlike localhost. In production it's the site's
   * own origin.
   */
  async getPlayerOrigin(): Promise<string> {
    try {
      const me = await this.getMe();
      if (me.playerOrigin) return me.playerOrigin;
    } catch {
      // fall through to current origin
    }
    return window.location.origin;
  }

  async getWorkspace(): Promise<Workspace> {
    return (await this.getMe()).workspace;
  }

  async getUser(): Promise<User> {
    return (await this.getMe()).user;
  }

  /** Change the signed-in user's own password. */
  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    const data = await this.request<{ ok: boolean; token: string }>('/api/me/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    // The password change revoked the old token; keep this session alive.
    if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
  }

  // Users (admin only)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/api/users');
  }

  async createUser(user: { name: string; username: string; password: string; role: UserRole; allowedScreens: string[] }): Promise<User> {
    return this.request<User>('/api/users', { method: 'POST', body: JSON.stringify(user) });
  }

  async updateUser(id: string, updates: { name?: string; role?: UserRole; allowedScreens?: string[]; password?: string }): Promise<User> {
    return this.request<User>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/api/users/${id}`, { method: 'DELETE' });
  }

  // Workspace settings
  async getSettings(): Promise<WorkspaceSettings> {
    return this.request<WorkspaceSettings>('/api/settings');
  }

  async updateSettings(settings: WorkspaceSettings): Promise<WorkspaceSettings> {
    return this.request<WorkspaceSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
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
