import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { Screen, ScreenGroup } from '../types';
import { Plus, Search, Monitor, Trash2, X, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Screens() {
  const { user } = useAppContext();
  const isAdmin = user?.role === 'Admin';
  const [screens, setScreens] = useState<Screen[]>([]);
  const [groups, setGroups] = useState<ScreenGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [screenName, setScreenName] = useState('');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    load();
    // Keep Online/Offline live — players check in every 30s.
    const t = setInterval(async () => {
      try {
        const [s, g] = await Promise.all([dataService.getScreens(), dataService.getGroups()]);
        setScreens(s);
        setGroups(g);
      } catch {
        // transient network error — next tick will retry
      }
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    const [s, g] = await Promise.all([dataService.getScreens(), dataService.getGroups()]);
    setScreens(s);
    setGroups(g);
    setLoading(false);
  }

  const handleDeleteScreen = async (screen: Screen) => {
    if (!window.confirm(`Delete screen "${screen.name}"? Its player link will stop working.`)) return;
    setLoading(true);
    await dataService.deleteScreen(screen.id);
    await load();
  };

  const handleAddScreen = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const created = await dataService.createScreen({
      name: screenName,
      deviceType: 'Web Player',
      orientation: 'landscape',
    });
    setIsModalOpen(false);
    setScreenName('');
    // Go straight to the new screen so its player link/QR is right there.
    navigate(`/screens/${created.id}`);
  };

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading screens...</div>;

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Online': return 'bg-emerald-950/20 text-emerald-400 border-emerald-900/40';
      case 'Offline': return 'bg-red-950/80 text-red-500 border-red-500/20';
      default: return 'bg-suncoast-elevated text-suncoast-warm-gray border-white/10';
    }
  };

  const q = query.trim().toLowerCase();
  const visibleScreens = q
    ? screens.filter((s) => {
        const groupName = s.groupId ? groups.find((g) => g.id === s.groupId)?.name ?? '' : '';
        return s.name.toLowerCase().includes(q) || groupName.toLowerCase().includes(q);
      })
    : screens;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Screens</h1>
        {isAdmin && (
          <TacticalButton onClick={() => setIsModalOpen(true)}>
            <Plus size={16} />
            ADD SCREEN
          </TacticalButton>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <TacticalPanel className="w-full max-w-md overflow-hidden flex flex-col z-50 shadow-2xl">
            <div className="p-4 border-b border-suncoast-gold/20 flex justify-between items-center bg-suncoast-elevated">
              <h2 className="font-display font-black text-white uppercase tracking-wide-ds text-sm">Add Screen</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-suncoast-warm-gray hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddScreen} className="p-6 space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Screen Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={screenName}
                  onChange={e => setScreenName(e.target.value)}
                  placeholder="e.g. Lobby Entrance"
                  className="w-full px-3 py-2 bg-suncoast-black border border-suncoast-gold/20 focus:outline-none focus:border-suncoast-gold text-white rounded-none font-sans text-sm"
                />
                <p className="font-mono text-[10px] text-suncoast-warm-gray mt-2 leading-relaxed">
                  After adding, you'll get a player link and QR code — open it in the browser on any TV and that TV becomes this screen.
                </p>
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-4">
                <TacticalButton type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</TacticalButton>
                <TacticalButton type="submit">Add Screen</TacticalButton>
              </div>
            </form>
          </TacticalPanel>
        </div>
      )}

      <TacticalPanel className="overflow-hidden">
        <div className="p-4 border-b border-white/5 flex items-center gap-4 bg-suncoast-elevated">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH SCREENS..."
              className="w-full pl-10 pr-4 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white rounded-none placeholder:text-suncoast-warm-gray"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-suncoast-elevated border-b border-white/10 font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                <th className="p-4 font-normal">Name</th>
                <th className="p-4 font-normal">Status</th>
                <th className="p-4 font-normal">Assignment</th>
                <th className="p-4 font-normal">Device Type</th>
                <th className="p-4 font-normal">Last Check-in</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {visibleScreens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center font-mono text-sm text-suncoast-warm-gray uppercase tracking-widest">
                    {screens.length === 0
                      ? 'No screens yet. Click "Add Screen" to get started.'
                      : `No screens match "${query}".`}
                  </td>
                </tr>
              ) : (
                visibleScreens.map((screen) => {
                  const group = screen.groupId ? groups.find(g => g.id === screen.groupId) : null;
                  
                  return (
                    <tr 
                      key={screen.id} 
                      onClick={() => navigate(`/screens/${screen.id}`)}
                      className="hover:bg-suncoast-elevated/50 cursor-pointer transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 border border-suncoast-gold/20 bg-suncoast-gold/5 flex items-center justify-center text-suncoast-gold shrink-0">
                            <Monitor size={20} />
                          </div>
                          <div>
                            <div className="font-sans text-sm font-medium text-white group-hover:text-suncoast-gold transition-colors">{screen.name}</div>
                            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">{screen.orientation}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 border font-mono text-[10px] uppercase tracking-widest ${getStatusStyle(screen.status)}`}>
                          {screen.status === 'Offline' && <span className="w-1.5 h-1.5 rounded-none bg-red-500 mr-2 animate-pulse"></span>}
                          {screen.status === 'Online' && <span className="w-1.5 h-1.5 rounded-none bg-emerald-400 mr-2"></span>}
                          {screen.status}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">
                        {group ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-none bg-suncoast-gold"></span>
                            {group.name}
                          </div>
                        ) : (
                          <span className="text-suncoast-warm-gray">Individual</span>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{screen.deviceType}</td>
                      <td className="p-4 font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                        {screen.lastCheckIn ? formatDistanceToNow(new Date(screen.lastCheckIn), { addSuffix: true }) : 'NEVER'}
                      </td>
                      <td className="p-4 flex items-center gap-2">
                        <button 
                          className="text-suncoast-warm-gray hover:text-suncoast-gold p-1.5 hover:bg-suncoast-gold/10 transition-colors border border-transparent hover:border-suncoast-gold/20" 
                          title="Open Player"
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            window.open(`/play/${screen.id}`, '_blank');
                          }}
                        >
                          <ExternalLink size={16} />
                        </button>
                        <button
                          className="text-suncoast-warm-gray hover:text-red-500 p-1.5 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                          title="Delete Screen"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteScreen(screen);
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </TacticalPanel>
    </div>
  );
}
