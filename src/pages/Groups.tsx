import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { Screen, ScreenGroup } from '../types';
import { Plus, Search, FolderTree, MoreVertical, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Groups() {
  const [groups, setGroups] = useState<ScreenGroup[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [g, s] = await Promise.all([dataService.getGroups(), dataService.getScreens()]);
    setGroups(g);
    setScreens(s);
    setLoading(false);
  }

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const newGroup = await dataService.createGroup({
      name: groupName,
    });
    setIsModalOpen(false);
    setGroupName('');
    navigate(`/groups/${newGroup.id}`);
  };

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Screen Groups</h1>
        <TacticalButton onClick={() => setIsModalOpen(true)}>
          <Plus size={16} />
          CREATE GROUP
        </TacticalButton>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <TacticalPanel className="w-full max-w-md overflow-hidden flex flex-col z-50 shadow-2xl">
            <div className="p-4 border-b border-suncoast-gold/20 flex justify-between items-center bg-suncoast-elevated">
              <h2 className="font-display font-black text-white uppercase tracking-wide-ds text-sm">Create Screen Group</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-suncoast-warm-gray hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleAddGroup} className="p-6 space-y-4">
              <div>
                <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Group Name</label>
                <input 
                  type="text" 
                  required
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="e.g. East Wing Displays" 
                  className="w-full px-3 py-2 bg-suncoast-black border border-suncoast-gold/20 focus:outline-none focus:border-suncoast-gold text-white rounded-none font-sans text-sm"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-4">
                <TacticalButton type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</TacticalButton>
                <TacticalButton type="submit">Create Group</TacticalButton>
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
              placeholder="SEARCH GROUPS..." 
              className="w-full pl-10 pr-4 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white rounded-none placeholder:text-suncoast-warm-gray"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-suncoast-elevated border-b border-white/10 font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                <th className="p-4 font-normal">Name</th>
                <th className="p-4 font-normal">Screens Assigned</th>
                <th className="p-4 font-normal">Playlist Items</th>
                <th className="p-4 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center font-mono text-sm text-suncoast-warm-gray uppercase tracking-widest">
                    No groups created yet.
                  </td>
                </tr>
              ) : (
                groups.map((group) => {
                  const memberCount = screens.filter(s => s.groupId === group.id).length;
                  
                  return (
                    <tr 
                      key={group.id} 
                      onClick={() => navigate(`/groups/${group.id}`)}
                      className="hover:bg-suncoast-elevated/50 cursor-pointer transition-colors group"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 border border-suncoast-gold/20 bg-suncoast-gold/5 flex items-center justify-center text-suncoast-gold shrink-0">
                            <FolderTree size={20} />
                          </div>
                          <div className="font-sans text-sm font-medium text-white group-hover:text-suncoast-gold transition-colors">{group.name}</div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 border border-white/10 font-mono text-[10px] uppercase tracking-widest bg-suncoast-elevated text-suncoast-light-gray">
                          {memberCount} screens
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">
                        {group.playlist.length} items
                      </td>
                      <td className="p-4">
                        <button className="text-suncoast-warm-gray hover:text-white p-1.5 hover:bg-white/5 transition-colors border border-transparent hover:border-white/10" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical size={16} />
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
