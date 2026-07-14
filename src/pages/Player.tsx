import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { dataService } from '../services/dataService';
import { Screen, MediaContent, Website } from '../types';

export default function Player() {
  const { id } = useParams();
  const [screen, setScreen] = useState<Screen | null>(null);
  const [content, setContent] = useState<MediaContent[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const [s, c, w] = await Promise.all([
        dataService.getScreen(id),
        dataService.getContent(),
        dataService.getWebsites()
      ]);
      setScreen(s || null);
      setContent(c);
      setWebsites(w);
      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    if (!screen || !screen.playlist || screen.playlist.length === 0) return;

    const currentItem = screen.playlist[currentIndex];
    if (!currentItem) {
       setCurrentIndex(0);
       return;
    }

    const timer = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % screen.playlist.length);
    }, currentItem.duration * 1000);

    return () => clearTimeout(timer);
  }, [screen, currentIndex]);

  if (loading) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-mono text-xs uppercase tracking-widest cursor-none z-50">Loading...</div>;
  }

  if (!screen) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-mono text-xs uppercase tracking-widest cursor-none z-50">Screen not found</div>;
  }

  if (!screen.playlist || screen.playlist.length === 0) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-display font-bold text-lg uppercase tracking-wide-ds cursor-none z-50">No content assigned to this screen</div>;
  }

  const item = screen.playlist[currentIndex];
  const source = item.type === 'media' ? content.find(c => c.id === item.sourceId) : websites.find(w => w.id === item.sourceId);

  if (!source) {
    return <div className="fixed inset-0 flex items-center justify-center bg-black text-white font-mono text-xs uppercase tracking-widest cursor-none z-50">Content missing</div>;
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden cursor-none z-50">
      {item.type === 'media' && (source as MediaContent).type === 'image' && (
        <img src={(source as MediaContent).url} alt="" className="w-full h-full object-cover animate-fade-in" />
      )}
      {item.type === 'media' && (source as MediaContent).type === 'video' && (
        <video 
           src={(source as MediaContent).url} 
           autoPlay 
           muted 
           loop
           className="w-full h-full object-cover animate-fade-in" 
        />
      )}
      {item.type === 'website' && (
        <iframe src={(source as Website).url} className="w-full h-full border-0 animate-fade-in" title="Website Content" />
      )}
    </div>
  );
}
