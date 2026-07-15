import React, { useState } from 'react';
import { Sun, Lock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await dataService.login(username, password);
      // Full reload so AppContext re-fetches workspace/user with the new token.
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-suncoast-black flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 font-display font-bold text-xl tracking-wide-ds text-white uppercase mb-8">
          <div className="text-suncoast-gold">
            <Sun size={28} strokeWidth={2.5} />
          </div>
          Suncoast Signages
        </div>
        <TacticalPanel className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
              <Lock size={18} />
            </div>
            <div>
              <h1 className="font-display font-bold text-white uppercase tracking-wide-ds text-sm">Sign In</h1>
              <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mt-0.5">Enter your username and password</p>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              autoFocus
              autoCapitalize="none"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="USERNAME"
              className="w-full px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-mono text-xs uppercase tracking-widest rounded-none placeholder:text-suncoast-warm-gray"
            />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="PASSWORD"
              className="w-full px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-mono text-xs uppercase tracking-widest rounded-none placeholder:text-suncoast-warm-gray"
            />
            {error && (
              <p className="font-mono text-[10px] text-red-500 uppercase tracking-widest">{error}</p>
            )}
            <TacticalButton type="submit" className="w-full justify-center" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </TacticalButton>
          </form>
        </TacticalPanel>
      </div>
    </div>
  );
}
