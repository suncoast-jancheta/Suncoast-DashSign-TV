import React, { useEffect, useState } from 'react';
import { dataService } from '../services/dataService';
import { ReportEntry } from '../types';
import { Download, Search, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Reports() {
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const r = await dataService.getReports();
      setReports(r.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="font-mono text-suncoast-warm-gray uppercase tracking-widest text-sm">Loading reports...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds">Proof of Play Reports</h1>
        <TacticalButton variant="secondary">
          <Download size={16} />
          Export CSV
        </TacticalButton>
      </div>

      <TacticalPanel className="flex flex-col h-[calc(100vh-200px)] overflow-hidden">
        <div className="p-4 border-b border-white/5 flex flex-wrap gap-4 bg-suncoast-elevated shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <input 
              type="text" 
              placeholder="SEARCH CONTENT OR SCREEN..." 
              className="w-full pl-10 pr-4 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white rounded-none placeholder:text-suncoast-warm-gray"
            />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-suncoast-warm-gray" size={16} />
            <select className="pl-10 pr-8 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold font-mono text-xs uppercase tracking-widest text-white appearance-none rounded-none">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
              <option>This Month</option>
              <option>Custom Range...</option>
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
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-suncoast-elevated/50 transition-colors">
                  <td className="p-4 font-sans text-sm font-medium text-white">{report.contentName}</td>
                  <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{report.screenName}</td>
                  <td className="p-4 font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest">{format(new Date(report.timestamp), 'MMM d, yyyy HH:mm:ss')}</td>
                  <td className="p-4 font-mono text-xs text-suncoast-gold text-right">{report.duration}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TacticalPanel>
    </div>
  );
}
