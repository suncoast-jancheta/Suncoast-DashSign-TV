import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dataService, PlayerData } from '../services/dataService';
import { MediaContent, PlaylistItem, Website } from '../types';

const REFRESH_INTERVAL_MS = 30_000;
const SCHEDULE_TICK_MS = 500;
const MEDIA_CACHE = 'suncoast-media-v1';

function isItemActiveNow(item: PlaylistItem): boolean {
  const s = item.settings;
  if (!s) return true;
  const now = new Date();
  if (s.daysOfWeek && s.daysOfWeek.length > 0 && !s.daysOfWeek.includes(now.getDay())) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (s.startTime && hhmm < s.startTime) return false;
  if (s.endTime && hhmm > s.endTime) return false;
  return true;
}

/** Whether the screen should be on right now per its daily schedule (device
 *  local time). No schedule = always on; overnight ranges supported. */
function isScreenOnNow(oh?: { onTime: string; offTime: string } | null): boolean {
  if (!oh?.onTime || !oh?.offTime) return true;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (oh.onTime <= oh.offTime) return hhmm >= oh.onTime && hhmm < oh.offTime;
  return hhmm >= oh.onTime || hhmm < oh.offTime;
}

/** Seconds each playlist item occupies in the loop. "Full video" items use
 *  the video's real length when it's known. */
function itemDuration(item: PlaylistItem, content: MediaContent[]): number {
  if (item.playFull && item.type === 'media') {
    const c = content.find((x) => x.id === item.sourceId);
    if (c?.type === 'video' && c.duration && c.duration > 0) return c.duration;
  }
  return Math.max(1, item.duration);
}

export default function Player() {
  const { id } = useParams();
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [, setTick] = useState(0); // re-render pulse for the clock scheduler
  const reportedRef = useRef<string | null>(null);

  // Difference between the server clock and this device's clock. Scheduling
  // against server time keeps every device on the same link in sync even if
  // a TV's own clock is wrong.
  const serverOffsetRef = useRef(0);

  // In "download" delivery mode, media files are stored on this device
  // (Cache API when available, kept as object URLs) so each playback loop
  // doesn't re-stream from the server.
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const localUrlsRef = useRef(localUrls);
  localUrlsRef.current = localUrls;
  // Small on-screen badge so it's visible that files are being saved to the
  // device (and briefly confirms when the offline copy is complete).
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const downloadedAtRef = useRef<number | null>(null);

  // Poll the server: acts as the heartbeat (Online status) and picks up
  // playlist/content changes made in the admin without reloading the TV.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      const result = await dataService.getPlayerData(id!);
      if (cancelled) return;
      if (!result) {
        setNotFound(true);
      } else {
        setNotFound(false);
        if (result.serverTime) serverOffsetRef.current = result.serverTime - Date.now();
        setData(result);
      }
      setLoading(false);
    }

    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id]);

  // Clock tick: re-evaluate which item should be on screen right now.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), SCHEDULE_TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Download-to-device: fetch each playlist file once, keep it on the device,
  // and play the local copy — playback loops then use no bandwidth at all.
  useEffect(() => {
    if (!data || data.screen.deliveryMode !== 'download') {
      setDownloadProgress(null);
      return;
    }
    let cancelled = false;

    (async () => {
      let cache: Cache | null = null;
      try {
        // Cache API needs a secure context (https or localhost); fall back to
        // in-memory object URLs when it's unavailable (e.g. plain http LAN IP).
        cache = 'caches' in window ? await caches.open(MEDIA_CACHE) : null;
      } catch {
        cache = null;
      }

      // Only this screen's playlist — never the whole content library.
      const playlistIds = new Set((data.screen.playlist ?? []).map((it) => it.sourceId));
      const wanted = data.content.filter((m) => playlistIds.has(m.id) && m.url);

      // Free up TV storage: drop cached files the playlist no longer uses.
      if (cache) {
        try {
          const wantedUrls = new Set(wanted.map((m) => new URL(m.url, window.location.origin).href));
          for (const req of await cache.keys()) {
            if (!wantedUrls.has(req.url)) await cache.delete(req);
          }
        } catch {
          // pruning is best-effort
        }
      }
      for (const [id, objectUrl] of Object.entries(localUrlsRef.current)) {
        if (!playlistIds.has(id)) {
          URL.revokeObjectURL(objectUrl);
          setLocalUrls((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      }

      const missing = wanted.filter((m) => !localUrlsRef.current[m.id]);
      if (missing.length === 0) return; // everything already on the device
      let done = wanted.length - missing.length;
      setDownloadProgress({ done, total: wanted.length });

      for (const m of missing) {
        if (cancelled) return;
        try {
          let res: Response | undefined = cache ? await cache.match(m.url) : undefined;
          if (!res) {
            const fetched = await fetch(m.url);
            if (!fetched.ok) continue;
            if (cache) {
              try {
                await cache.put(m.url, fetched.clone());
              } catch {
                // storage full — still play from the in-memory copy
              }
            }
            res = fetched;
          }
          const blob = await res.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          setLocalUrls((prev) => ({ ...prev, [m.id]: objectUrl }));
          done++;
          setDownloadProgress({ done, total: wanted.length });
        } catch {
          // network hiccup — this item keeps streaming until the next pass
        }
      }
      if (!cancelled) {
        // Only announce "ready" when every file really made it; failures
        // retry on the next 30s poll.
        if (done === wanted.length) downloadedAtRef.current = Date.now();
        setDownloadProgress(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  const playlist = (data?.screen.playlist ?? []).filter(isItemActiveNow);
  const content = data?.content ?? [];

  // --- Synchronized schedule -----------------------------------------------
  // Every device computes the position inside the playlist loop from the
  // shared server clock, so two TVs opening the same link show the same
  // media at the same time.
  const durations = playlist.map((it) => itemDuration(it, content));
  const loopSeconds = durations.reduce((a, b) => a + b, 0);
  const syncedNow = (Date.now() + serverOffsetRef.current) / 1000;
  const cycle = loopSeconds > 0 ? Math.floor(syncedNow / loopSeconds) : 0;
  let positionInLoop = loopSeconds > 0 ? syncedNow % loopSeconds : 0;
  let currentIndex = 0;
  for (let i = 0; i < durations.length; i++) {
    if (positionInLoop < durations[i]) {
      currentIndex = i;
      break;
    }
    positionInLoop -= durations[i];
  }
  const secondsIntoItem = positionInLoop;
  const secondsIntoItemRef = useRef(0);
  secondsIntoItemRef.current = secondsIntoItem;

  const item = playlist.length > 0 ? playlist[currentIndex] : undefined;

  const source: MediaContent | Website | undefined = item
    ? item.type === 'media'
      ? content.find((c) => c.id === item.sourceId)
      : data?.websites.find((w) => w.id === item.sourceId)
    : undefined;

  // Late joiners jump into the middle of a video so they match devices that
  // have been playing for a while.
  const handleVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const offset = secondsIntoItemRef.current;
    if (video.duration && isFinite(video.duration) && offset > 0.75) {
      video.currentTime = offset % video.duration;
    }
  };

  // Proof-of-play logging, once per item per loop cycle.
  useEffect(() => {
    if (!id || !item || !source) return;
    const key = `${item.id}:${currentIndex}:${cycle}`;
    if (reportedRef.current === key) return;
    reportedRef.current = key;
    dataService.reportPlayback(id, source.name, durations[currentIndex] ?? item.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, item, source, currentIndex, cycle]);

  const message = (text: string) => (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-mono text-xs uppercase tracking-widest cursor-none z-50">
      {text}
    </div>
  );

  if (loading) return message('Loading...');
  if (notFound) return message('Screen not found');
  if (!data) return message('Cannot reach server — retrying...');
  // Outside operating hours: black screen. Polling continues (the clock tick
  // re-evaluates every 500ms), so it wakes up on schedule by itself.
  if (!isScreenOnNow(data.screen.operatingHours)) {
    return <div className="fixed inset-0 bg-black cursor-none z-50" />;
  }
  if (playlist.length === 0)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-display font-bold text-lg uppercase tracking-wide-ds cursor-none z-50">
        No content assigned to this screen
      </div>
    );
  if (!source) return message('Content missing');

  const alert = data.screen.alert;
  const alertActive = alert && new Date(alert.expiresAt) > new Date();

  const transition = data.settings?.transition ?? 'fade';
  const transitionClass =
    {
      none: '',
      fade: 'animate-fade-in',
      slide: 'animate-slide-in',
      'slide-up': 'animate-slide-up-in',
      zoom: 'animate-zoom-in',
      flip: 'animate-flip-in',
      wipe: 'animate-wipe-in',
    }[transition] ?? 'animate-fade-in';

  const mediaUrl = (m: MediaContent) => localUrls[m.id] ?? m.url;
  const elementKey = `${item!.id}:${currentIndex}:${cycle}`;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden cursor-none z-50">
      {item!.type === 'media' && (source as MediaContent).type === 'image' && (
        <img key={elementKey} src={mediaUrl(source as MediaContent)} alt="" className={`w-full h-full object-contain ${transitionClass}`} />
      )}
      {item!.type === 'media' && (source as MediaContent).type === 'video' && (
        <video
          key={elementKey}
          src={mediaUrl(source as MediaContent)}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={handleVideoLoaded}
          className={`w-full h-full object-contain ${transitionClass}`}
        />
      )}
      {item!.type === 'website' && (
        <iframe key={elementKey} src={(source as Website).url} className={`w-full h-full border-0 ${transitionClass}`} title="Website Content" />
      )}
      {alertActive && (
        <div className="absolute bottom-0 inset-x-0 bg-red-600 text-white font-display font-bold text-2xl uppercase tracking-wide-ds text-center py-4 px-6">
          {alert!.message}
        </div>
      )}
      {data.screen.deliveryMode === 'download' &&
        (downloadProgress || (downloadedAtRef.current !== null && Date.now() - downloadedAtRef.current < 6000)) && (
          <div className="absolute top-3 right-3 bg-black/70 border border-white/20 px-3 py-1.5 font-mono text-[10px] text-white/80 uppercase tracking-widest">
            {downloadProgress
              ? `Saving to device ${downloadProgress.done}/${downloadProgress.total}`
              : 'Offline copy ready — playing from device storage'}
          </div>
        )}
    </div>
  );
}
