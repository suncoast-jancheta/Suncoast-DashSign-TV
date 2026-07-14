import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { Screen, MediaContent } from '../types';
import { MonitorPlay, Activity, Image as ImageIcon, HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBytes } from '../lib/utils';
import { TacticalPanel } from '../components/TacticalPanel';

export default function Dashboard() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [content, setContent] = useState<MediaContent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, c] = await Promise.all([dataService.getScreens(), dataService.getContent()]);
      setScreens(s);
      setContent(c);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading dashboard...</div>;

  const onlineCount = screens.filter(s => s.status === 'Online').length;
  const offlineCount = screens.filter(s => s.status === 'Offline').length;
  const neverConnected = screens.filter(s => s.status === 'Never Connected').length;
  
  const totalStorage = 1024 * 1024 * 1024; // 1GB mock quota
  const usedStorage = content.reduce((acc, curr) => acc + curr.size, 0);

  const mockChartData = [
    { name: 'MON', plays: 4000 },
    { name: 'TUE', plays: 3000 },
    { name: 'WED', plays: 2000 },
    { name: 'THU', plays: 2780 },
    { name: 'FRI', plays: 1890 },
    { name: 'SAT', plays: 2390 },
    { name: 'SUN', plays: 3490 },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TacticalPanel className="p-6 flex items-center gap-4">
          <div className="p-3 bg-suncoast-elevated border border-suncoast-gold/20 text-suncoast-gold">
            <MonitorPlay size={24} />
          </div>
          <div>
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Total Screens</div>
            <div className="font-mono font-extrabold text-3xl text-white leading-none">{screens.length}</div>
          </div>
        </TacticalPanel>
        
        <TacticalPanel className="p-6 flex items-center gap-4">
          <div className="p-3 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400">
            <Activity size={24} />
          </div>
          <div>
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Online</div>
            <div className="font-mono font-extrabold text-3xl text-white leading-none">{onlineCount}</div>
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-1">
              <span className="text-red-400">{offlineCount} offline</span> / {neverConnected} unused
            </div>
          </div>
        </TacticalPanel>

        <TacticalPanel className="p-6 flex items-center gap-4">
          <div className="p-3 bg-suncoast-elevated border border-suncoast-gold/20 text-suncoast-gold">
            <ImageIcon size={24} />
          </div>
          <div>
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Content Items</div>
            <div className="font-mono font-extrabold text-3xl text-white leading-none">{content.length}</div>
          </div>
        </TacticalPanel>

        <TacticalPanel className="p-6 flex items-center gap-4">
          <div className="p-3 bg-suncoast-elevated border border-suncoast-gold/20 text-suncoast-gold">
            <HardDrive size={24} />
          </div>
          <div className="w-full">
            <div className="flex justify-between items-end mb-2">
              <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">Storage</div>
              <div className="font-mono text-xs text-white uppercase tracking-widest">{formatBytes(usedStorage)} / 1 GB</div>
            </div>
            <div className="w-full bg-suncoast-elevated h-1">
              <div className="bg-suncoast-gold h-1 transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (usedStorage/totalStorage)*100)}%` }}></div>
            </div>
          </div>
        </TacticalPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TacticalPanel className="p-6 col-span-2">
          <h2 className="font-display font-black text-sm text-suncoast-cream uppercase tracking-wide-ds mb-6">Proof of Play (7 Days)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockChartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#70685C', fontFamily: 'JetBrains Mono' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#70685C', fontFamily: 'JetBrains Mono' }} />
                <Tooltip cursor={{ fill: '#1A1814' }} contentStyle={{ backgroundColor: '#11100E', border: '1px solid rgba(196,154,60,0.18)', borderRadius: '0', fontFamily: 'JetBrains Mono', color: '#fff', fontSize: '12px' }} />
                <Bar dataKey="plays" fill="#C49A3C" radius={[0, 0, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TacticalPanel>

        <TacticalPanel className="p-6">
          <h2 className="font-display font-black text-sm text-suncoast-cream uppercase tracking-wide-ds mb-6">Recent Activity</h2>
          <div className="space-y-4">
            {[
              { id: 1, action: 'Playlist published to Lobby Displays', time: '10 MINS AGO', type: 'publish' },
              { id: 2, action: 'New content "Welcome Banner" uploaded', time: '1 HOUR AGO', type: 'upload' },
              { id: 3, action: 'Screen "Cafe North" went offline', time: '2 HOURS AGO', type: 'alert' },
              { id: 4, action: 'Screen "Warehouse Entry" paired', time: 'YESTERDAY', type: 'device' },
            ].map((item) => (
              <div key={item.id} className="flex gap-3 items-start border-b border-white/5 pb-4 last:border-0 last:pb-0">
                <div className="mt-1 flex-shrink-0 w-2 h-2 bg-suncoast-gold"></div>
                <div>
                  <p className="font-sans text-sm text-suncoast-cream">{item.action}</p>
                  <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-1">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </TacticalPanel>
      </div>
    </div>
  );
}
