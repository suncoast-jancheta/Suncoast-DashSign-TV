import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dataService } from '../services/dataService';
import { useToast } from '../contexts/ToastContext';
import { Screen, MediaContent, Website, PlaylistItem } from '../types';
import { ArrowLeft, Save, Clock, Trash2, GripVertical, PlayCircle, Image as ImageIcon, Video, Globe, ExternalLink } from 'lucide-react';
import { generateId, formatBytes } from '../lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function ManageScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [screen, setScreen] = useState<Screen | null>(null);
  const [content, setContent] = useState<MediaContent[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'content' | 'websites'>('content');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [playerOrigin, setPlayerOrigin] = useState(window.location.origin);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const [s, c, w, origin] = await Promise.all([
        dataService.getScreen(id),
        dataService.getContent(),
        dataService.getWebsites(),
        dataService.getPlayerOrigin()
      ]);
      setPlayerOrigin(origin);
      if (s) {
        setScreen(s);
        setPlaylist(s.playlist || []);
      }
      setContent(c);
      setWebsites(w);
      setLoading(false);
    }
    load();
  }, [id]);

  const handleDragEnd = (result: DropResult) => {
    const { source, destination } = result;

    if (!destination) return;

    if (source.droppableId === destination.droppableId && source.droppableId === 'playlist') {
      const items = Array.from(playlist);
      const [reorderedItem] = items.splice(source.index, 1);
      items.splice(destination.index, 0, reorderedItem);
      setPlaylist(items);
      setHasUnsaved(true);
    } else if (source.droppableId === 'library' && destination.droppableId === 'playlist') {
      const sourceItemStr = result.draggableId;
      const [type, sourceId] = sourceItemStr.split('::');
      
      let duration = 10;
      if (type === 'media') {
        const item = content.find(c => c.id === sourceId);
        if (item?.type === 'video') duration = item.duration || 10;
      } else {
        duration = 15;
      }

      const newItem: PlaylistItem = {
        id: generateId(),
        sourceId,
        type: type as 'media' | 'website',
        duration
      };

      const items = Array.from(playlist);
      items.splice(destination.index, 0, newItem);
      setPlaylist(items);
      setHasUnsaved(true);
    }
  };

  const removePlaylistItem = (index: number) => {
    const items = Array.from(playlist);
    items.splice(index, 1);
    setPlaylist(items);
    setHasUnsaved(true);
  };

  const updateDuration = (index: number, duration: number) => {
    const items = Array.from(playlist);
    const item = items[index];
    if (item) {
      items[index] = Object.assign({}, item, { duration });
      setPlaylist(items);
      setHasUnsaved(true);
    }
  };

  const handleSave = async () => {
    if (!screen) return;
    setLoading(true);
    await dataService.updateScreen(screen.id, { playlist });
    setHasUnsaved(false);
    setLoading(false);
    toast('Playlist published — screen is downloading content', 'success');
  };

  if (loading && !screen) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading...</div>;
  if (!screen) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Screen not found</div>;

  const totalDuration = playlist.reduce((acc, curr) => acc + curr.duration, 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] -m-6">
      <div className="min-h-[4rem] py-3 bg-suncoast-charcoal border-b border-suncoast-gold/20 px-6 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/screens')} className="text-suncoast-warm-gray hover:text-suncoast-gold transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="flex gap-4">
            <div>
              <h1 className="font-display font-black text-white uppercase tracking-wide-ds text-lg leading-none">{screen.name}</h1>
              <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-1 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-none ${screen.status === 'Online' ? 'bg-emerald-400' : 'bg-red-500'}`}></span>
                {screen.status} • {screen.deviceType} • {screen.orientation}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                <div className="flex items-center gap-2 bg-suncoast-black border border-white/10 px-2 py-1 w-fit">
                  <span className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest select-none">LOCAL IP (BSN):</span>
                  <code className="font-mono text-[10px] text-suncoast-gold select-all">{screen.ipAddress || '192.168.1.100'}</code>
                </div>
                <div className="flex items-center gap-2 bg-suncoast-black border border-white/10 px-2 py-1 w-fit">
                  <span className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest select-none">PLAYER LINK (TV / PHONE):</span>
                  <code className="font-mono text-[10px] text-suncoast-gold select-all">{playerOrigin}/play/{screen.id}</code>
                </div>
              </div>
            </div>
            <div className="hidden sm:block p-1 bg-white/90">
               <QRCodeSVG value={`${playerOrigin}/play/${screen.id}`} size={72} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <TacticalButton variant="secondary" onClick={() => window.open(`/play/${screen.id}`, '_blank')}>
            <ExternalLink size={14} />
            Open Player
          </TacticalButton>
          {hasUnsaved && <span className="font-mono text-[10px] text-suncoast-gold uppercase tracking-widest animate-pulse">Unsaved changes</span>}
          <TacticalButton onClick={handleSave} disabled={!hasUnsaved || loading} className={!hasUnsaved ? 'opacity-50 cursor-not-allowed border-suncoast-warm-gray text-suncoast-warm-gray hover:bg-transparent hover:text-suncoast-warm-gray' : ''}>
            <Save size={14} />
            Publish to Screen
          </TacticalButton>
        </div>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 bg-suncoast-black flex flex-col min-w-0">
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-suncoast-elevated shrink-0">
              <div>
                <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-sm">Active Playlist</h2>
                <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-0.5">{playlist.length} items • {totalDuration} sec total loop</p>
              </div>
              <div className="flex items-center gap-2 font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                <PlayCircle size={14} className="text-suncoast-gold" />
                Looping
              </div>
            </div>

            <Droppable droppableId="playlist">
              {(provided, snapshot) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 transition-colors ${snapshot.isDraggingOver ? 'bg-suncoast-gold/5' : ''}`}
                >
                  {playlist.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-suncoast-warm-gray">
                      <div className="w-16 h-16 rounded-none border border-suncoast-gold/20 border-dashed flex items-center justify-center mb-4">
                        <ImageIcon size={24} className="text-suncoast-gold/50" />
                      </div>
                      <p className="font-mono text-sm text-suncoast-cream uppercase tracking-widest mb-1">Playlist is empty</p>
                      <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">Drag content here from the library</p>
                    </div>
                  ) : (
                    playlist.map((item, index) => {
                      const c = item.type === 'media' 
                        ? content.find(x => x.id === item.sourceId)
                        : websites.find(x => x.id === item.sourceId);
                      
                      if (!c) return null;

                      return (
                        <Draggable key={`${item.id}-${index}`} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`bg-suncoast-elevated border rounded-none p-3 flex items-center gap-4 transition-all ${
                                snapshot.isDragging ? 'border-suncoast-gold shadow-[0_0_15px_rgba(196,154,60,0.15)] z-50' : 'border-white/10 hover:border-suncoast-gold/30'
                              }`}
                            >
                              <div {...provided.dragHandleProps} className="text-suncoast-warm-gray hover:text-white cursor-grab p-1">
                                <GripVertical size={16} />
                              </div>
                              
                              <div className="w-16 h-16 bg-suncoast-black border border-white/5 rounded-none overflow-hidden shrink-0 flex items-center justify-center relative">
                                {item.type === 'media' && (c as MediaContent).type === 'image' && (
                                  <img src={(c as MediaContent).url} className="w-full h-full object-cover opacity-80" />
                                )}
                                {item.type === 'media' && (c as MediaContent).type === 'video' && (
                                  <>
                                    <video src={(c as MediaContent).url} className="w-full h-full object-cover opacity-30" />
                                    <Video size={16} className="absolute text-suncoast-gold" />
                                  </>
                                )}
                                {item.type === 'website' && (
                                  (c as Website).thumbnail ? (
                                     <img src={(c as Website).thumbnail} className="w-full h-full object-cover opacity-80" />
                                  ) : <Globe size={20} className="text-suncoast-warm-gray" />
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <h4 className="font-sans text-sm font-medium text-white truncate">{c.name}</h4>
                                <p className="font-mono text-[10px] text-suncoast-warm-gray mt-1 uppercase tracking-widest">{item.type}</p>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-suncoast-black border border-white/10 px-3 py-1.5 rounded-none">
                                  <Clock size={12} className="text-suncoast-warm-gray" />
                                  <input 
                                    type="number" 
                                    min={1}
                                    value={item.duration}
                                    onChange={(e) => updateDuration(index, parseInt(e.target.value) || 10)}
                                    className="w-12 bg-transparent font-mono text-xs text-white focus:outline-none text-center"
                                  />
                                  <span className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">sec</span>
                                </div>
                                <button 
                                  onClick={() => removePlaylistItem(index)}
                                  className="p-2 text-suncoast-warm-gray hover:text-red-500 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          <div className="w-80 md:w-96 bg-suncoast-charcoal border-l border-suncoast-gold/20 flex flex-col shrink-0">
            <div className="flex items-center border-b border-suncoast-gold/20 bg-suncoast-elevated shrink-0">
              <button 
                onClick={() => setActiveTab('content')}
                className={`flex-1 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'content' ? 'border-suncoast-gold text-suncoast-gold bg-suncoast-gold/5' : 'border-transparent text-suncoast-warm-gray hover:text-suncoast-cream hover:bg-white/5'}`}
              >
                Media Library
              </button>
              <button 
                onClick={() => setActiveTab('websites')}
                className={`flex-1 py-3 font-mono text-xs uppercase tracking-widest border-b-2 transition-colors ${activeTab === 'websites' ? 'border-suncoast-gold text-suncoast-gold bg-suncoast-gold/5' : 'border-transparent text-suncoast-warm-gray hover:text-suncoast-cream hover:bg-white/5'}`}
              >
                Websites
              </button>
            </div>
            
            <Droppable droppableId="library" isDropDisabled={true}>
              {(provided) => (
                <div 
                  ref={provided.innerRef} 
                  {...provided.droppableProps}
                  className="flex-1 overflow-y-auto p-4 flex flex-col gap-3"
                >
                  {activeTab === 'content' && content.map((item, index) => (
                    // @ts-ignore
                    <Draggable key={`media::${item.id}`} draggableId={`media::${item.id}`} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`bg-suncoast-elevated rounded-none border p-2 flex items-center gap-3 transition-colors ${
                            snapshot.isDragging ? 'border-suncoast-gold shadow-[0_0_10px_rgba(196,154,60,0.15)] z-50' : 'border-white/5 hover:border-suncoast-gold/30'
                          }`}
                        >
                          <div className="w-12 h-12 bg-suncoast-black border border-white/5 overflow-hidden relative shrink-0">
                             {item.type === 'image' ? (
                                <img src={item.url} className="w-full h-full object-cover opacity-80" />
                              ) : (
                                <>
                                  <video src={item.url} className="w-full h-full object-cover opacity-30" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Video size={14} className="text-suncoast-gold drop-shadow-md" />
                                  </div>
                                </>
                              )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-sans text-sm font-medium text-white truncate">{item.name}</h4>
                            <p className="font-mono text-[10px] text-suncoast-warm-gray mt-1 uppercase tracking-widest">{item.type} • {formatBytes(item.size)}</p>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  
                  {activeTab === 'websites' && websites.map((item, index) => (
                    // @ts-ignore
                    <Draggable key={`website::${item.id}`} draggableId={`website::${item.id}`} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={`bg-suncoast-elevated rounded-none border p-2 flex items-center gap-3 transition-colors ${
                            snapshot.isDragging ? 'border-suncoast-gold shadow-[0_0_10px_rgba(196,154,60,0.15)] z-50' : 'border-white/5 hover:border-suncoast-gold/30'
                          }`}
                        >
                          <div className="w-12 h-12 bg-suncoast-black border border-suncoast-gold/20 flex items-center justify-center shrink-0 text-suncoast-gold">
                             {item.thumbnail ? (
                                <img src={item.thumbnail} className="w-full h-full object-cover opacity-80" />
                              ) : <Globe size={18} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-sans text-sm font-medium text-white truncate">{item.name}</h4>
                            <p className="font-mono text-[10px] text-suncoast-warm-gray mt-1 uppercase tracking-widest truncate">{item.url}</p>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
