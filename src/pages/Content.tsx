import React, { useEffect, useRef, useState } from 'react';
import { dataService } from '../services/dataService';
import { useToast } from '../contexts/ToastContext';
import { MediaContent, Folder } from '../types';
import { Upload, FolderPlus, Search, Image as ImageIcon, Video, CheckSquare, Trash2, Folder as FolderIcon, Download, X } from 'lucide-react';
import { formatBytes } from '../lib/utils';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

/** Real length of a video file in seconds, read from its metadata before
 *  upload — used for playlist timing and synchronized playback. */
function getVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d) : undefined);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    v.src = url;
  });
}

export default function Content() {
  const { toast } = useToast();
  const [content, setContent] = useState<MediaContent[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [c, f] = await Promise.all([dataService.getContent(), dataService.getFolders()]);
    setContent(c);
    setFolders(f);
    setLoading(false);
  }

  /** Shared by the Upload button and drag-and-drop. */
  const uploadFiles = async (files: File[]) => {
    const mediaFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (mediaFiles.length === 0) {
      toast('Only image and video files can be uploaded', 'error');
      return;
    }
    setUploading(true);
    try {
      for (const file of mediaFiles) {
        const type = file.type.startsWith('image/') ? 'image' : 'video';
        const duration = type === 'video' ? ((await getVideoDuration(file)) ?? 10) : undefined;
        await dataService.createContent({
          name: file.name,
          type,
          url: '', // Will be replaced by service
          size: file.size,
          duration,
          folderId: currentFolderId,
          orientation: 'landscape'
        }, file);
      }
      toast(`Uploaded ${mediaFiles.length} file${mediaFiles.length === 1 ? '' : 's'}`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed', 'error');
    }
    setUploading(false);
    await load();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await uploadFiles(Array.from(e.dataTransfer.files) as File[]);
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file later
    if (files.length > 0) await uploadFiles(files);
  };

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name:');
    if (!name?.trim()) return;
    try {
      await dataService.createFolder(name.trim(), currentFolderId);
      toast(`Folder "${name.trim()}" created`, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create folder', 'error');
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    if (!window.confirm(`Delete folder "${folder.name}"? Files inside it move up one level (nothing is deleted).`)) return;
    try {
      await dataService.deleteFolder(folder.id);
      toast(`Folder "${folder.name}" deleted`, 'success');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to delete folder', 'error');
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} selected item${selectedIds.size === 1 ? '' : 's'}? Screens using them will skip them.`)) return;
    setLoading(true);
    await dataService.deleteContent(Array.from(selectedIds));
    setSelectedIds(new Set());
    await load();
  };

  // Searching looks through the whole library; otherwise show the open folder.
  const q = query.trim().toLowerCase();
  const currentContent = q
    ? content.filter(c => c.name.toLowerCase().includes(q))
    : content.filter(c => c.folderId === currentFolderId);
  const currentSubfolders = q
    ? folders.filter(f => f.name.toLowerCase().includes(q))
    : folders.filter(f => f.parentId === currentFolderId);

  if (loading && content.length === 0) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading...</div>;

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Content Library</h1>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <TacticalButton variant="danger" onClick={handleDelete}>
              <Trash2 size={16} />
              Delete ({selectedIds.size})
            </TacticalButton>
          )}
          <TacticalButton variant="secondary" onClick={handleNewFolder}>
            <FolderPlus size={16} />
            New Folder
          </TacticalButton>
          <TacticalButton onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={16} />
            {uploading ? 'Uploading...' : 'Upload'}
          </TacticalButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={handleFilePick}
            className="hidden"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest shrink-0">
        <button onClick={() => setCurrentFolderId(undefined)} className="hover:text-suncoast-gold hover:underline transition-colors">Root</button>
        {currentFolderId && (
           <>
            <span className="text-white/30">/</span>
            <span className="text-suncoast-gold font-bold">{folders.find(f => f.id === currentFolderId)?.name}</span>
           </>
        )}
      </div>

      <TacticalPanel 
        className={`flex-1 flex flex-col overflow-hidden transition-colors ${isDragging ? 'border-suncoast-gold shadow-[inset_0_0_50px_rgba(196,154,60,0.1)]' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-suncoast-elevated sticky top-0 z-10 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH CONTENT..."
              className="w-full pl-10 pr-8 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white rounded-none placeholder:text-suncoast-warm-gray"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-suncoast-warm-gray hover:text-white transition-colors" title="Clear search">
                <X size={14} />
              </button>
            )}
          </div>
          {q && (
            <span className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
              Searching whole library — {currentContent.length + currentSubfolders.length} match{currentContent.length + currentSubfolders.length === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {currentSubfolders.length === 0 && currentContent.length === 0 ? (
            q ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-suncoast-warm-gray m-8 p-12">
                <Search size={48} className="mb-4 text-suncoast-gold/50" />
                <p className="font-display font-bold text-white uppercase tracking-wide-ds text-sm mb-2">No matches for "{query}"</p>
                <p className="font-mono text-[10px] uppercase tracking-widest">Try a different search term</p>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-suncoast-warm-gray border-2 border-dashed border-white/10 m-8 p-12">
                <Upload size={48} className="mb-4 text-suncoast-gold/50" />
                <p className="font-display font-bold text-white uppercase tracking-wide-ds text-sm mb-2">Drag and drop media here</p>
                <p className="font-mono text-[10px] uppercase tracking-widest">Or use the upload button to add content</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {currentSubfolders.map(folder => (
                <div
                  key={folder.id}
                  onClick={() => {
                    setQuery(''); // leave search mode when opening a folder
                    setCurrentFolderId(folder.id);
                  }}
                  className="group relative aspect-square bg-suncoast-black border border-white/5 hover:border-suncoast-gold/50 cursor-pointer transition-all flex flex-col items-center justify-center gap-3 p-4 rounded-none"
                >
                  <FolderIcon size={48} className="text-suncoast-warm-gray group-hover:text-suncoast-gold transition-colors" />
                  <span className="font-mono text-[10px] text-white text-center uppercase tracking-widest line-clamp-2">{folder.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder);
                    }}
                    title="Delete folder (files move up a level)"
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center border border-white/30 bg-suncoast-black/80 text-white opacity-0 group-hover:opacity-100 hover:border-red-500 hover:text-red-500 transition-all rounded-none"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              
              {currentContent.map(item => (
                <div 
                  key={item.id}
                  onClick={() => toggleSelect(item.id)}
                  className={`group relative aspect-square border overflow-hidden cursor-pointer transition-all rounded-none ${
                    selectedIds.has(item.id) ? 'border-suncoast-gold shadow-[0_0_15px_rgba(196,154,60,0.3)]' : 'border-white/5 hover:border-suncoast-gold/50'
                  }`}
                >
                  <div className="absolute inset-0 bg-suncoast-black">
                    {item.type === 'image' ? (
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-suncoast-black relative">
                        <video src={item.url} className="w-full h-full object-cover opacity-30 group-hover:opacity-60 transition-opacity" />
                        <Video size={32} className="absolute text-white/50 group-hover:text-white transition-colors" />
                      </div>
                    )}
                  </div>
                  
                  <div className={`absolute top-2 left-2 transition-opacity ${selectedIds.has(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    <div className={`w-6 h-6 flex items-center justify-center border rounded-none ${selectedIds.has(item.id) ? 'bg-suncoast-gold border-suncoast-gold text-suncoast-black' : 'bg-suncoast-black/80 border-white/30 text-transparent'}`}>
                      <CheckSquare size={14} />
                    </div>
                  </div>

                  <a
                    href={`${item.url}${item.url.includes('?') ? '&' : '?'}download=1`}
                    download={item.name}
                    onClick={(e) => e.stopPropagation()}
                    title="Download file"
                    className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center border border-white/30 bg-suncoast-black/80 text-white opacity-0 group-hover:opacity-100 hover:border-suncoast-gold hover:text-suncoast-gold transition-all rounded-none"
                  >
                    <Download size={13} />
                  </a>

                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
                    <p className="text-white text-sm font-sans font-medium truncate">{item.name}</p>
                    <div className="flex items-center gap-2 text-suncoast-warm-gray font-mono text-[10px] uppercase tracking-widest mt-1">
                      {item.type === 'image' ? <ImageIcon size={10} /> : <Video size={10} />}
                      <span>{formatBytes(item.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </TacticalPanel>
    </div>
  );
}
