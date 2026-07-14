import { PlaylistItem, Screen, ScreenGroup, MediaContent, Website, ReportEntry, Folder, Workspace, User } from '../types';
import { generateId } from '../lib/utils';
import { subDays, formatISO } from 'date-fns';
import localforage from 'localforage';

const SEED_WORKSPACE: Workspace = { id: 'ws-1', name: 'Default Workspace' };
const SEED_USER: User = { id: 'u-1', email: 'admin@signhub.com', role: 'Admin', name: 'Admin User' };

const SEED_CONTENT: MediaContent[] = [
  { id: 'c-1', name: 'Welcome Banner', type: 'image', url: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800&q=80', size: 1024 * 500, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-2', name: 'Promo Video', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4', duration: 10, size: 1024 * 1024 * 5, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-3', name: 'Menu Board', type: 'image', url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80', size: 1024 * 800, uploadDate: new Date().toISOString(), orientation: 'portrait' },
  { id: 'c-4', name: 'Corporate Update', type: 'image', url: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&q=80', size: 1024 * 400, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-5', name: 'Safety Guidelines', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4', duration: 15, size: 1024 * 1024 * 8, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-6', name: 'New Product Launch', type: 'image', url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&q=80', size: 1024 * 600, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-7', name: 'Employee of the Month', type: 'image', url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&q=80', size: 1024 * 700, uploadDate: new Date().toISOString(), orientation: 'portrait' },
  { id: 'c-8', name: 'Store Hours', type: 'image', url: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&q=80', size: 1024 * 300, uploadDate: new Date().toISOString(), orientation: 'portrait' },
  { id: 'c-9', name: 'Lobby Ambient', type: 'video', url: 'https://www.w3schools.com/html/mov_bbb.mp4', duration: 30, size: 1024 * 1024 * 15, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-10', name: 'Sale Announce', type: 'image', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&q=80', size: 1024 * 550, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-11', name: 'Weather Widget Bg', type: 'image', url: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=800&q=80', size: 1024 * 450, uploadDate: new Date().toISOString(), orientation: 'landscape' },
  { id: 'c-12', name: 'News Ticker Bg', type: 'image', url: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=800&q=80', size: 1024 * 650, uploadDate: new Date().toISOString(), orientation: 'landscape' },
];

const SEED_WEBSITES: Website[] = [
  { id: 'w-1', name: 'Company News', url: 'https://news.ycombinator.com', thumbnail: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=400&q=80' },
  { id: 'w-2', name: 'Live Dashboard', url: 'https://example.com', thumbnail: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80' },
  { id: 'w-3', name: 'Local Weather', url: 'https://weather.com', thumbnail: 'https://images.unsplash.com/photo-1561484930-998b6a7b22e8?w=400&q=80' },
];

const SEED_GROUPS: ScreenGroup[] = [
  {
    id: 'g-1', workspaceId: 'ws-1', name: 'Lobby Displays',
    playlist: [
      { id: 'p-1', sourceId: 'c-1', type: 'media', duration: 10 },
      { id: 'p-2', sourceId: 'c-2', type: 'media', duration: 10 },
      { id: 'p-3', sourceId: 'w-1', type: 'website', duration: 15 },
    ]
  },
  {
    id: 'g-2', workspaceId: 'ws-1', name: 'Cafeteria Menus',
    playlist: [
      { id: 'p-4', sourceId: 'c-3', type: 'media', duration: 30 },
    ]
  }
];

const SEED_SCREENS: Screen[] = [
  { id: 's-1', workspaceId: 'ws-1', name: 'Lobby Main 1', status: 'Online', deviceType: 'Android TV', orientation: 'landscape', lastCheckIn: new Date().toISOString(), groupId: 'g-1', playlist: [], ipAddress: '192.168.1.101' },
  { id: 's-2', workspaceId: 'ws-1', name: 'Lobby Main 2', status: 'Online', deviceType: 'Android TV', orientation: 'landscape', lastCheckIn: new Date().toISOString(), groupId: 'g-1', playlist: [], ipAddress: '192.168.1.102' },
  { id: 's-3', workspaceId: 'ws-1', name: 'Cafe North', status: 'Online', deviceType: 'Fire TV', orientation: 'portrait', lastCheckIn: new Date().toISOString(), groupId: 'g-2', playlist: [], ipAddress: '192.168.1.103' },
  { id: 's-4', workspaceId: 'ws-1', name: 'Cafe South', status: 'Offline', deviceType: 'Fire TV', orientation: 'portrait', lastCheckIn: subDays(new Date(), 1).toISOString(), groupId: 'g-2', playlist: [], ipAddress: '192.168.1.104' },
  { id: 's-5', workspaceId: 'ws-1', name: 'Breakroom', status: 'Online', deviceType: 'Web Player', orientation: 'landscape', lastCheckIn: new Date().toISOString(), playlist: [{ id: 'p-5', sourceId: 'c-4', type: 'media', duration: 10 }, { id: 'p-6', sourceId: 'c-5', type: 'media', duration: 15 }], ipAddress: '192.168.1.105' },
  { id: 's-6', workspaceId: 'ws-1', name: 'Warehouse Entry', status: 'Never Connected', deviceType: 'BrightSign', orientation: 'landscape', playlist: [], ipAddress: '192.168.1.106' },
];

const SEED_REPORTS: ReportEntry[] = Array.from({ length: 50 }).map((_, i) => ({
  id: `r-${i}`,
  workspaceId: 'ws-1',
  contentName: SEED_CONTENT[i % SEED_CONTENT.length].name,
  screenName: SEED_SCREENS[i % SEED_SCREENS.length].name,
  timestamp: formatISO(subDays(new Date(), Math.floor(Math.random() * 7))),
  duration: 10 + Math.floor(Math.random() * 20),
}));

// Create a localforage instance for file storage
const fileStore = localforage.createInstance({
  name: 'SignHubDB',
  storeName: 'files'
});

class DataService {
  private get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(`signhub_${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    localStorage.setItem(`signhub_${key}`, JSON.stringify(value));
  }

  private async delay<T>(value: T, ms = 300): Promise<T> {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
  }

  async init() {
    if (!localStorage.getItem('signhub_initialized')) {
      this.set('workspace', SEED_WORKSPACE);
      this.set('user', SEED_USER);
      this.set('content', SEED_CONTENT);
      this.set('websites', SEED_WEBSITES);
      this.set('groups', SEED_GROUPS);
      this.set('screens', SEED_SCREENS);
      this.set('reports', SEED_REPORTS);
      this.set('folders', []);
      this.set('initialized', true);
    }
  }

  async getWorkspace(): Promise<Workspace> {
    return this.delay(this.get('workspace', SEED_WORKSPACE));
  }

  async getUser(): Promise<User> {
    return this.delay(this.get('user', SEED_USER));
  }

  // Content
  async getContent(): Promise<MediaContent[]> {
    const items = this.get<MediaContent[]>('content', []);
    
    // Process items to generate object URLs for local blobs
    const processedItems = await Promise.all(items.map(async (item) => {
      if (item.url.startsWith('local://')) {
        const fileId = item.url.replace('local://', '');
        const blob = await fileStore.getItem<Blob>(fileId);
        if (blob) {
           return { ...item, url: URL.createObjectURL(blob) };
        }
      }
      return item;
    }));
    
    return this.delay(processedItems);
  }

  async createContent(content: Omit<MediaContent, 'id' | 'uploadDate'>, fileBlob?: Blob): Promise<MediaContent> {
    const items = this.get<MediaContent[]>('content', []);
    const newItem: MediaContent = { ...content, id: generateId(), uploadDate: new Date().toISOString() };
    
    if (fileBlob) {
      await fileStore.setItem(newItem.id, fileBlob);
      newItem.url = `local://${newItem.id}`;
    }
    
    this.set('content', [...items, newItem]);
    
    if (fileBlob) {
       // Return with object URL so it works immediately in the UI without reload
       return { ...newItem, url: URL.createObjectURL(fileBlob) };
    }
    return this.delay(newItem);
  }

  async updateContent(id: string, updates: Partial<MediaContent>): Promise<MediaContent> {
    const items = this.get<MediaContent[]>('content', []);
    const index = items.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Not found');
    items[index] = { ...items[index], ...updates };
    this.set('content', items);
    return this.delay(items[index]);
  }

  async deleteContent(ids: string[]): Promise<void> {
    const items = this.get<MediaContent[]>('content', []);
    this.set('content', items.filter(i => !ids.includes(i.id)));
    
    // Also remove from localforage
    for (const id of ids) {
       try {
         await fileStore.removeItem(id);
       } catch (e) {
         console.error('Failed to remove blob for', id, e);
       }
    }
    
    return this.delay(undefined);
  }

  // Folders
  async getFolders(): Promise<Folder[]> {
    return this.delay(this.get('folders', []));
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    const folders = this.get<Folder[]>('folders', []);
    const newFolder: Folder = { id: generateId(), name, parentId };
    this.set('folders', [...folders, newFolder]);
    return this.delay(newFolder);
  }

  // Websites
  async getWebsites(): Promise<Website[]> {
    return this.delay(this.get('websites', []));
  }

  async createWebsite(website: Omit<Website, 'id'>): Promise<Website> {
    const items = this.get<Website[]>('websites', []);
    const newItem: Website = { ...website, id: generateId() };
    this.set('websites', [...items, newItem]);
    return this.delay(newItem);
  }

  // Screens
  async getScreens(): Promise<Screen[]> {
    return this.delay(this.get('screens', []));
  }

  async getScreen(id: string): Promise<Screen | undefined> {
    const items = this.get<Screen[]>('screens', []);
    return this.delay(items.find(i => i.id === id));
  }

  async createScreen(screen: Omit<Screen, 'id' | 'workspaceId' | 'status' | 'playlist' | 'ipAddress'>): Promise<Screen> {
    const items = this.get<Screen[]>('screens', []);
    const mockIp = `192.168.1.${Math.floor(Math.random() * 150) + 50}`;
    const newItem: Screen = { ...screen, id: generateId(), workspaceId: 'ws-1', status: 'Never Connected', playlist: [], ipAddress: mockIp };
    this.set('screens', [...items, newItem]);
    return this.delay(newItem);
  }

  async updateScreen(id: string, updates: Partial<Screen>): Promise<Screen> {
    const items = this.get<Screen[]>('screens', []);
    const index = items.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Not found');
    items[index] = { ...items[index], ...updates };
    this.set('screens', items);
    return this.delay(items[index]);
  }

  // Groups
  async getGroups(): Promise<ScreenGroup[]> {
    return this.delay(this.get('groups', []));
  }

  async getGroup(id: string): Promise<ScreenGroup | undefined> {
    const items = this.get<ScreenGroup[]>('groups', []);
    return this.delay(items.find(i => i.id === id));
  }

  async createGroup(group: Omit<ScreenGroup, 'id' | 'workspaceId' | 'playlist'>): Promise<ScreenGroup> {
    const items = this.get<ScreenGroup[]>('groups', []);
    const newItem: ScreenGroup = { ...group, id: generateId(), workspaceId: 'ws-1', playlist: [] };
    this.set('groups', [...items, newItem]);
    return this.delay(newItem);
  }

  async updateGroup(id: string, updates: Partial<ScreenGroup>): Promise<ScreenGroup> {
    const items = this.get<ScreenGroup[]>('groups', []);
    const index = items.findIndex(i => i.id === id);
    if (index === -1) throw new Error('Not found');
    items[index] = { ...items[index], ...updates };
    this.set('groups', items);
    
    // Auto-update screens in this group
    if (updates.playlist) {
       const screens = this.get<Screen[]>('screens', []);
       let modified = false;
       screens.forEach(s => {
         if (s.groupId === id) {
           s.status = 'Online'; // Simulate it connecting
           modified = true;
         }
       });
       if (modified) this.set('screens', screens);
    }
    
    return this.delay(items[index]);
  }

  // Reports
  async getReports(): Promise<ReportEntry[]> {
    return this.delay(this.get('reports', []));
  }
}

export const dataService = new DataService();
