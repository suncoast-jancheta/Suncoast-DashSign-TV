export type MediaType = 'image' | 'video';
export type DeviceType = 'Android TV' | 'Fire TV' | 'BrightSign' | 'Web Player';
export type ScreenStatus = 'Online' | 'Offline' | 'Never Connected';
export type Orientation = 'landscape' | 'portrait';
export type UserRole = 'Admin' | 'Member';
export type TransitionStyle = 'none' | 'fade' | 'slide' | 'slide-up' | 'zoom' | 'flip' | 'wipe';
export type DeliveryMode = 'stream' | 'download';

export interface Workspace {
  id: string;
  name: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  name: string;
  /** Screen IDs this user may control; '*' means all screens (Admins). */
  allowedScreens: string[] | '*';
  avatar?: string;
}

export interface WorkspaceSettings {
  transition: TransitionStyle;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
}

export interface MediaContent {
  id: string;
  name: string;
  type: MediaType;
  url: string;
  thumbnail?: string;
  size: number; // in bytes
  duration?: number; // in seconds, for videos
  uploadDate: string;
  folderId?: string;
  startDate?: string;
  expiryDate?: string;
  orientation: Orientation;
}

export interface Website {
  id: string;
  name: string;
  url: string;
  thumbnail?: string;
}

export interface PlaylistItemSettings {
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
}

export interface PlaylistItem {
  id: string; // unique instance id in playlist
  sourceId: string; // ID of MediaContent or Website
  type: 'media' | 'website';
  duration: number; // seconds
  /** Videos only: play to the end instead of cutting at `duration`. */
  playFull?: boolean;
  settings?: PlaylistItemSettings;
}

export interface ScreenAlert {
  message: string;
  expiresAt: string;
}

export interface Screen {
  id: string;
  workspaceId: string;
  name: string;
  status: ScreenStatus;
  playlist: PlaylistItem[];
  groupId?: string | null; // if part of a group
  deviceType: DeviceType;
  lastCheckIn?: string;
  orientation: Orientation;
  /** 'stream' plays media from the server; 'download' stores files on the
   *  player device so playback loops don't re-fetch them (less bandwidth). */
  deliveryMode?: DeliveryMode;
  ipAddress?: string; // local IPv4 address
  operatingHours?: {
    onTime: string; // HH:mm
    offTime: string; // HH:mm
  };
  alert?: ScreenAlert;
}

export interface ScreenGroup {
  id: string;
  workspaceId: string;
  name: string;
  playlist: PlaylistItem[];
}

export interface ReportEntry {
  id: string;
  workspaceId: string;
  contentName: string;
  screenName: string;
  timestamp: string;
  duration: number;
}
