import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { ReportEntry } from '../types';
import { Download, Search, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

type DateRange = '7d' | '30d' | 'month' | 'all';

function rangeCutoff(range: DateRange): number {
  const now = new Date();
  switch (range) {
    case '7d':
      return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    case '30d':
      return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'all':
      return 0;
  }
}

/** RFC 4180-style quoting so names with commas/quotes don't break the file. */
function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Reports() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState<DateRange>('7d');

  useEffect(() => {
    async function load() {
      const r = await dataService.getReports();
      setReports(r.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading reports...</div>;

  const q = query.trim().toLowerCase();
  const cutoff = rangeCutoff(range);
  const filtered = reports.filter((r) => {
    if (new Date(r.timestamp).getTime() < cutoff) return false;
    if (!q) return true;
    return r.contentName.toLowerCase().includes(q) || r.screenName.toLowerCase().includes(q);
  });

  const exportCsv = () => {
    const rows = [
      ['Content Name', 'Screen Name', 'Played At', 'Duration (s)'],
      ...filtered.map((r) => [r.contentName, r.screenName, r.timestamp, r.duration]),
    ];
    const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proof-of-play-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Proof of Play Reports</h1>
        <TacticalButton variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={16} />
          Export CSV ({filtered.length})
        </TacticalButton>
      </div>

      <TacticalPanel className="flex flex-col h-[calc(100vh-200px)] overflow-hidden">
        <div className="p-4 border-b border-white/5 flex flex-wrap gap-4 bg-suncoast-elevated shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH CONTENT OR SCREEN..."
              className="w-full pl-10 pr-4 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white rounded-none placeholder:text-suncoast-warm-gray"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as DateRange)}
              className="pl-10 pr-8 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white appearance-none rounded-none"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="month">This Month</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-suncoast-elevated border-b border-white/10 z-10 shadow-sm">
              <tr className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                <th className="p-4 font-normal bg-suncoast-elevated">Content Name</th>
                <th className="p-4 font-normal bg-suncoast-elevated">Screen Name</th>
                <th className="p-4 font-normal bg-suncoast-elevated">Played At</th>
                <th className="p-4 font-normal bg-suncoast-elevated text-right">Duration (s)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center font-mono text-sm text-suncoast-warm-gray uppercase tracking-widest">
                    {reports.length === 0
                      ? 'No plays logged yet — entries appear as soon as a screen starts displaying content.'
                      : 'No plays match the current search/date filter.'}
                  </td>
                </tr>
              ) : (
                filtered.map((report) => (
                  <tr key={report.id} className="hover:bg-suncoast-elevated/50 transition-colors">
                    <td className="p-4 font-sans text-sm font-medium text-white">{report.contentName}</td>
                    <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{report.screenName}</td>
                    <td className="p-4 font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest">{format(new Date(report.timestamp), 'MMM d, yyyy HH:mm:ss')}</td>
                    <td className="p-4 font-mono text-xs text-suncoast-gold text-right">{report.duration}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </TacticalPanel>
    </div>
  );
}
