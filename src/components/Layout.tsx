import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAppContext } from '../contexts/AppContext';
import { dataService } from '../services/dataService';
import { LayoutDashboard, MonitorPlay, FolderTree, Image as ImageIcon, Globe, BarChart3, Settings, Bell, Sun, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { TacticalPanel } from './TacticalPanel';

export default function Layout() {
  const { workspace, user, loading } = useAppContext();
  const navigate = useNavigate();

  const handleLogout = () => {
    dataService.logout();
    navigate('/login');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-suncoast-black text-suncoast-warm-gray font-mono uppercase tracking-widest text-sm">Loading Suncoast...</div>;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/screens', icon: MonitorPlay, label: 'Screens' },
    { to: '/groups', icon: FolderTree, label: 'Groups' },
    { to: '/content', icon: ImageIcon, label: 'Content' },
    { to: '/websites', icon: Globe, label: 'Websites' },
    { to: '/reports', icon: BarChart3, label: 'Reports' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-suncoast-black flex flex-col md:flex-row text-white">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-suncoast-charcoal border-r border-suncoast-gold/20 flex flex-col shrink-0 z-20 relative">
        <div className="h-16 flex items-center px-6 border-b border-suncoast-gold/20">
          <div className="flex items-center gap-3 font-display font-bold text-xl tracking-wide-ds text-white uppercase">
            <div className="text-suncoast-gold">
              <Sun size={22} strokeWidth={2.5} />
            </div>
            Suncoast
          </div>
        </div>
        
        <nav className="flex-1 py-6 px-3 flex flex-col gap-2 overflow-y-auto">
          <div className="px-3 text-[10px] font-mono text-suncoast-warm-gray uppercase tracking-widest mb-2">Platform</div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-none text-sm transition-all duration-200 border border-transparent font-mono uppercase tracking-widest text-xs",
                  isActive
                    ? "border-suncoast-gold/30 bg-suncoast-gold/10 text-suncoast-gold shadow-[0_0_10px_rgba(196,154,60,0.1)]"
                    : "text-suncoast-light-gray hover:border-suncoast-gold/20 hover:bg-suncoast-gold/5 hover:text-suncoast-cream"
                )
              }
            >
              <item.icon size={16} className={cn("transition-colors")} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-suncoast-gold/20">
           <div className="flex items-center gap-3 px-3 py-3 bg-suncoast-elevated border border-white/5 rounded-none">
              <div className="w-8 h-8 bg-suncoast-charcoal border border-suncoast-gold/30 flex items-center justify-center text-suncoast-gold font-mono font-bold text-sm shrink-0">
                {user?.name.charAt(0)}
              </div>
              <div className="hidden sm:block text-sm overflow-hidden">
                <div className="font-mono text-xs text-white truncate uppercase">{user?.name}</div>
                <div className="font-mono text-[10px] text-suncoast-warm-gray truncate uppercase tracking-widest mt-0.5">{user?.role}</div>
              </div>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-suncoast-charcoal border-b border-suncoast-gold/20 flex items-center justify-between px-6 shrink-0 z-10 relative">
          <div className="flex items-center gap-4">
            <div className="px-4 py-1.5 bg-suncoast-elevated border border-suncoast-gold/20 text-suncoast-cream font-mono text-xs uppercase tracking-widest">
              {workspace?.name}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-suncoast-warm-gray hover:text-suncoast-gold transition-colors relative hover:bg-suncoast-elevated border border-transparent hover:border-suncoast-gold/20 rounded-none">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-none"></span>
            </button>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-2 text-suncoast-warm-gray hover:text-suncoast-gold transition-colors hover:bg-suncoast-elevated border border-transparent hover:border-suncoast-gold/20 rounded-none"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
