import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dataService, PlayerData } from '../services/dataService';
import { MediaContent, PlaylistItem, Website } from '../types';

const REFRESH_INTERVAL_MS = 30_000;

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

  const playlist = (data?.screen.playlist ?? []).filter(isItemActiveNow);
  const item = playlist.length > 0 ? playlist[currentIndex % playlist.length] : undefined;

  // Advance the playlist.
  useEffect(() => {
    if (!item || playlist.length === 0) return;
    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % playlist.length);
    }, Math.max(1, item.duration) * 1000);
    return () => clearTimeout(timer);
  }, [item, playlist.length]);

  const source: MediaContent | Website | undefined = item
    ? item.type === 'media'
      ? data?.content.find((c) => c.id === item.sourceId)
      : data?.websites.find((w) => w.id === item.sourceId)
    : undefined;

  // Proof-of-play logging, once per item shown.
  useEffect(() => {
    if (!id || !item || !source) return;
    if (reportedRef.current === item.id + ':' + currentIndex) return;
    reportedRef.current = item.id + ':' + currentIndex;
    dataService.reportPlayback(id, source.name, item.duration);
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

  return (
    <div className="fixed inset-0 bg-black overflow-hidden cursor-none z-50">
      {item!.type === 'media' && (source as MediaContent).type === 'image' && (
        <img key={item!.id + currentIndex} src={(source as MediaContent).url} alt="" className="w-full h-full object-contain animate-fade-in" />
      )}
      {item!.type === 'media' && (source as MediaContent).type === 'video' && (
        <video
          key={item!.id + currentIndex}
          src={(source as MediaContent).url}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-contain animate-fade-in"
        />
      )}
      {item!.type === 'website' && (
        <iframe src={(source as Website).url} className="w-full h-full border-0 animate-fade-in" title="Website Content" />
      )}
      {alertActive && (
        <div className="absolute bottom-0 inset-x-0 bg-red-600 text-white font-display font-bold text-2xl uppercase tracking-wide-ds text-center py-4 px-6">
          {alert!.message}
        </div>
      )}
    </div>
  );
}
