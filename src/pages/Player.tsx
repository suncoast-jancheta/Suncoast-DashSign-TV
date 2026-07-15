import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dataService, PlayerData } from '../services/dataService';
import { MediaContent, PlaylistItem, Website } from '../types';

const REFRESH_INTERVAL_MS = 30_000;
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

export default function Player() {
  const { id } = useParams();
  const [data, setData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const reportedRef = useRef<string | null>(null);

  // In "download" delivery mode, media files are stored on this device
  // (Cache API when available, kept as object URLs) so each playback loop
  // doesn't re-stream from the server.
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const localUrlsRef = useRef(localUrls);
  localUrlsRef.current = localUrls;

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

  // Download-to-device: prefetch every media file once and play it locally.
  useEffect(() => {
    if (!data || data.screen.deliveryMode !== 'download') return;
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
      for (const m of data.content) {
        if (cancelled) return;
        if (localUrlsRef.current[m.id] || !m.url) continue;
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
        } catch {
          // network hiccup — this item keeps streaming until the next pass
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data]);

  const playlist = (data?.screen.playlist ?? []).filter(isItemActiveNow);
  const item = playlist.length > 0 ? playlist[currentIndex % playlist.length] : undefined;

  const source: MediaContent | Website | undefined = item
    ? item.type === 'media'
      ? data?.content.find((c) => c.id === item.sourceId)
      : data?.websites.find((w) => w.id === item.sourceId)
    : undefined;

  const isFullVideo =
    !!item?.playFull && item.type === 'media' && (source as MediaContent | undefined)?.type === 'video';

  // Advance the playlist on a timer — except "play full video" items, which
  // advance when the video actually ends.
  useEffect(() => {
    if (!item || playlist.length === 0 || isFullVideo) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }, Math.max(1, item.duration) * 1000);
    return () => clearTimeout(timer);
  }, [item, playlist.length, isFullVideo]);

  const handleVideoEnded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (!isFullVideo) return;
    if (playlist.length <= 1) {
      // Only item in the loop: restart it (the element isn't remounted).
      e.currentTarget.currentTime = 0;
      e.currentTarget.play().catch(() => undefined);
    } else {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }
  };

  // Proof-of-play logging, once per item shown.
  useEffect(() => {
    if (!id || !item || !source) return;
    if (reportedRef.current === item.id + ':' + currentIndex) return;
    reportedRef.current = item.id + ':' + currentIndex;
    const reportDuration = item.playFull ? ((source as MediaContent).duration ?? item.duration) : item.duration;
    dataService.reportPlayback(id, source.name, reportDuration);
  }, [id, item, source, currentIndex]);

  const message = (text: string) => (
    <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-mono text-xs uppercase tracking-widest cursor-none z-50">
      {text}
    </div>
  );

  if (loading) return message('Loading...');
  if (notFound) return message('Screen not found');
  if (!data) return message('Cannot reach server — retrying...');
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

  return (
    <div className="fixed inset-0 bg-black overflow-hidden cursor-none z-50">
      {item!.type === 'media' && (source as MediaContent).type === 'image' && (
        <img key={item!.id + currentIndex} src={mediaUrl(source as MediaContent)} alt="" className={`w-full h-full object-contain ${transitionClass}`} />
      )}
      {item!.type === 'media' && (source as MediaContent).type === 'video' && (
        <video
          key={item!.id + currentIndex}
          src={mediaUrl(source as MediaContent)}
          autoPlay
          muted
          loop={!isFullVideo}
          playsInline
          onEnded={handleVideoEnded}
          className={`w-full h-full object-contain ${transitionClass}`}
        />
      )}
      {item!.type === 'website' && (
        <iframe src={(source as Website).url} className={`w-full h-full border-0 ${transitionClass}`} title="Website Content" />
      )}
      {alertActive && (
        <div className="absolute bottom-0 inset-x-0 bg-red-600 text-white font-display font-bold text-2xl uppercase tracking-wide-ds text-center py-4 px-6">
          {alert!.message}
        </div>
      )}
    </div>
  );
}
