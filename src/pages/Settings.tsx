import React from 'react';
import { useAppContext } from '../contexts/AppContext';
import { User, Shield, Users, MonitorPlay, Moon, Sliders } from 'lucide-react';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Settings() {
  const { workspace, user } = useAppContext();

  return (
    <div className="max-w-4xl space-y-8 pb-10">
      <div>
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds mb-2">Settings</h1>
        <p className="font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest">Manage your workspace preferences, users, and account.</p>
      </div>

      <TacticalPanel className="overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-suncoast-elevated">
          <div className="p-3 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
            <MonitorPlay size={24} />
          </div>
          <div>
            <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-lg">Workspace Settings</h2>
            <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">Global settings for {workspace?.name}</p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          <div>
            <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Workspace Name</label>
            <input type="text" defaultValue={workspace?.name} className="w-full max-w-md px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-sans text-sm rounded-none" />
          </div>
          
          <div>
            <label className="block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1">Default Transition Style</label>
            <select className="w-full max-w-md px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-mono text-xs uppercase tracking-widest appearance-none rounded-none">
              <option>None (Hard Cut)</option>
              <option>Fade</option>
              <option>Slide</option>
            </select>
            <p className="font-mono text-[10px] text-suncoast-warm-gray mt-2">This is the default transition used between items on screens. Can be overridden per screen.</p>
          </div>
        </div>
        <div className="bg-suncoast-elevated p-4 border-t border-white/5 flex justify-end">
          <TacticalButton>
            Save Workspace
          </TacticalButton>
        </div>
      </TacticalPanel>

      <TacticalPanel className="overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-suncoast-elevated">
          <div className="flex items-center gap-4">
            <div className="p-3 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
              <Users size={24} />
            </div>
            <div>
              <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-lg">Team Members</h2>
              <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">Manage who has access to this workspace</p>
            </div>
          </div>
          <TacticalButton variant="secondary">
            Invite User
          </TacticalButton>
        </div>
        <div className="p-0">
          <table className="w-full text-left">
            <thead className="bg-suncoast-elevated border-b border-white/5">
              <tr className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                <th className="p-4 font-normal">User</th>
                <th className="p-4 font-normal">Role</th>
                <th className="p-4 text-right font-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-none border border-suncoast-gold/30 bg-suncoast-black flex items-center justify-center text-suncoast-gold font-bold text-sm">
                    {user?.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-sans text-sm font-medium text-white">{user?.name} <span className="text-suncoast-warm-gray">(You)</span></div>
                    <div className="font-mono text-[10px] text-suncoast-light-gray uppercase tracking-widest">{user?.email}</div>
                  </div>
                </td>
                <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{user?.role}</td>
                <td className="p-4 text-right"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </TacticalPanel>

      <TacticalPanel className="overflow-hidden border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]">
        <div className="p-6 border-b border-red-500/20 flex items-center gap-4 bg-red-950/10">
          <div className="p-3 border border-red-500/30 bg-red-500/10 text-red-500 rounded-none">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="font-display font-bold text-red-50 uppercase tracking-wide-ds text-lg">Security</h2>
            <p className="font-mono text-[10px] text-red-300/60 uppercase tracking-widest">Protect your account</p>
          </div>
        </div>
        <div className="p-6 bg-suncoast-charcoal">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-sans text-sm font-medium text-white">Two-Factor Authentication (2FA)</h3>
              <p className="font-mono text-[10px] text-suncoast-warm-gray mt-1">Add an extra layer of security to your account.</p>
            </div>
            <button className="relative inline-flex h-6 w-11 items-center rounded-none bg-suncoast-elevated border border-white/20 transition-colors focus:outline-none">
              <span className="inline-block h-4 w-4 translate-x-1 rounded-none bg-suncoast-warm-gray transition-transform"></span>
            </button>
          </div>
        </div>
      </TacticalPanel>
    </div>
  );
}
