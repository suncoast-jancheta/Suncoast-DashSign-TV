import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { Screen, MediaContent, ReportEntry } from '../types';
import { MonitorPlay, Activity, Image as ImageIcon, HardDrive } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { formatBytes } from '../lib/utils';
import { TacticalPanel } from '../components/TacticalPanel';
import { formatDistanceToNow } from 'date-fns';

interface ActivityItem {
  id: string;
  action: string;
  timestamp: string;
}

/** Play counts per day for the last 7 days, from real proof-of-play reports. */
function buildChartData(reports: ReportEntry[]) {
  const days: { name: string; plays: number; date: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      name: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      plays: 0,
      date: d.toDateString(),
    });
  }
  for (const r of reports) {
    const day = days.find((d) => d.date === new Date(r.timestamp).toDateString());
    if (day) day.plays++;
  }
  return days;
}

/** Recent activity from real events: playback reports and content uploads. */
function buildActivity(reports: ReportEntry[], content: MediaContent[]): ActivityItem[] {
  const items: ActivityItem[] = [
    ...reports.slice(0, 10).map((r) => ({
      id: `r-${r.id}`,
      action: `"${r.contentName}" played on ${r.screenName}`,
      timestamp: r.timestamp,
    })),
    ...content.map((c) => ({
      id: `c-${c.id}`,
      action: `Content "${c.name}" uploaded`,
      timestamp: c.uploadDate,
    })),
  ];
  return items
    .filter((i) => !isNaN(new Date(i.timestamp).getTime()))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);
}

export default function Dashboard() {
  const [screens, setScreens] = useState<Screen[]>([]);
  const [content, setContent] = useState<MediaContent[]>([]);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [s, c, r] = await Promise.all([
        dataService.getScreens(),
        dataService.getContent(),
        dataService.getReports(),
      ]);
      setScreens(s);
      setContent(c);
      setReports(r);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading dashboard...</div>;

  const onlineCount = screens.filter(s => s.status === 'Online').length;
  const offlineCount = screens.filter(s => s.status === 'Offline').length;
  const neverConnected = screens.filter(s => s.status === 'Never Connected').length;

  const usedStorage = content.reduce((acc, curr) => acc + curr.size, 0);

  const chartData = buildChartData(reports);
  const activity = buildActivity(reports, content);

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
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Storage Used</div>
            <div className="font-mono font-extrabold text-2xl text-white leading-none mb-1">{formatBytes(usedStorage)}</div>
            <div className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
              {content.length} file{content.length === 1 ? '' : 's'} in library
            </div>
          </div>
        </TacticalPanel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <TacticalPanel className="p-6 col-span-2">
          <h2 className="font-display font-black text-sm text-suncoast-cream uppercase tracking-wide-ds mb-6">Plays This Week</h2>
          <div className="h-64">
            {reports.length === 0 ? (
              <div className="h-full flex items-center justify-center font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest text-center px-6">
                No playback yet — plays are logged here once a screen starts displaying content
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#70685C', fontFamily: 'JetBrains Mono' }} />
                  <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: '#70685C', fontFamily: 'JetBrains Mono' }} />
                  <Tooltip cursor={{ fill: '#1A1814' }} contentStyle={{ backgroundColor: '#11100E', border: '1px solid rgba(196,154,60,0.18)', borderRadius: '0', fontFamily: 'JetBrains Mono', color: '#fff', fontSize: '12px' }} />
                  <Bar dataKey="plays" fill="#C49A3C" radius={[0, 0, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </TacticalPanel>

        <TacticalPanel className="p-6">
          <h2 className="font-display font-black text-sm text-suncoast-cream uppercase tracking-wide-ds mb-6">Recent Activity</h2>
          <div className="space-y-4">
            {activity.length === 0 ? (
              <p className="font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest">
                No activity yet — upload content or connect a screen to get started
              </p>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="flex gap-3 items-start border-b border-white/5 pb-4 last:border-0 last:pb-0">
                  <div className="mt-1 flex-shrink-0 w-2 h-2 bg-suncoast-gold"></div>
                  <div>
                    <p className="font-sans text-sm text-suncoast-cream">{item.action}</p>
                    <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-1">
                      {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </TacticalPanel>
      </div>
    </div>
  );
}
