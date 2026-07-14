import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { Website } from '../types';
import { Plus, Globe, ExternalLink, MoreVertical, X } from 'lucide-react';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Websites() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const w = await dataService.getWebsites();
    setWebsites(w);
    setLoading(false);
  }

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await dataService.createWebsite({
      name,
      url,
    });
    setIsModalOpen(false);
    setName('');
    setUrl('');
    await load();
  };

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading websites...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Live Websites</h1>
        <TacticalButton onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          ADD WEBSITE
        </TacticalButton>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <TacticalPanel className="w-full max-w-md overflow-hidden flex flex-col z-50 shadow-2xl">
            <div className="p-4 border-b border-suncoast-gold/20 flex justify-between items-center bg-suncoast-elevated">
              <h2 className="font-display font-black text-white uppercase tracking-wide-ds text-sm">Add Live Website</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-suncoast-warm-gray hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddWebsite} className="p-6 space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Website URL</label>
                <input 
                  type="url" 
                  required
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/dashboard" 
                  className="w-full px-3 py-2 bg-suncoast-black border border-suncoast-gold/20 focus:outline-none focus:border-suncoast-gold text-white rounded-none font-mono text-sm tracking-wide"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Descriptive Name</label>
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Sales Metrics" 
                  className="w-full px-3 py-2 bg-suncoast-black border border-suncoast-gold/20 focus:outline-none focus:border-suncoast-gold text-white rounded-none font-sans text-sm"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-4">
                <TacticalButton type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</TacticalButton>
                <TacticalButton type="submit">Add Website</TacticalButton>
              </div>
            </form>
          </TacticalPanel>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {websites.map((website) => (
          <TacticalPanel key={website.id} className="group overflow-hidden">
            <div className="aspect-video bg-suncoast-black relative overflow-hidden flex items-center justify-center">
              {website.thumbnail ? (
                <img src={website.thumbnail} alt={website.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-suncoast-warm-gray group-hover:text-suncoast-gold transition-colors bg-suncoast-elevated">
                  <Globe size={48} />
                </div>
              )}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button className="w-12 h-12 bg-suncoast-black border border-suncoast-gold flex items-center justify-center text-suncoast-gold hover:bg-suncoast-gold/20 transition-colors rounded-none" title="Preview">
                  <ExternalLink size={20} />
                </button>
              </div>
            </div>
            <div className="p-4 flex justify-between items-start border-t border-white/5 bg-suncoast-charcoal">
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-bold text-white truncate text-sm uppercase tracking-wide">{website.name}</h3>
                <p className="font-mono text-[10px] text-suncoast-warm-gray truncate mt-1 tracking-widest">{website.url}</p>
              </div>
              <button className="text-suncoast-warm-gray hover:text-white p-1 -mt-1 -mr-1 hover:bg-white/5 transition-colors border border-transparent hover:border-white/10 rounded-none shrink-0 ml-2">
                <MoreVertical size={16} />
              </button>
            </div>
          </TacticalPanel>
        ))}
      </div>
    </div>
  );
}
