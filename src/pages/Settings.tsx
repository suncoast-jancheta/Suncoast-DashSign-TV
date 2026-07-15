import React, { useEffect, useState } from 'react';
import { useAppContext } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { dataService } from '../services/dataService';
import { User, UserRole, Screen, TransitionStyle } from '../types';
import { Shield, Users, MonitorPlay, Plus, Trash2, Pencil, X } from 'lucide-react';
import { TacticalPanel } from '../components/TacticalPanel';
import { TacticalButton } from '../components/TacticalButton';

const inputCls =
  'w-full px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-sans text-sm rounded-none';
const labelCls = 'block font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest mb-1';

interface UserFormState {
  id?: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  allowedScreens: string[];
}

const emptyForm: UserFormState = { name: '', username: '', password: '', role: 'Member', allowedScreens: [] };

export default function Settings() {
  const { workspace, user } = useAppContext();
  const { toast } = useToast();
  const isAdmin = user?.role === 'Admin';

  // Transition setting
  const [transition, setTransition] = useState<TransitionStyle>('fade');
  const [savingTransition, setSavingTransition] = useState(false);

  // My password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [screens, setScreens] = useState<Screen[]>([]);
  const [form, setForm] = useState<UserFormState | null>(null); // null = modal closed

  useEffect(() => {
    dataService.getSettings().then((s) => setTransition(s.transition)).catch(() => undefined);
    if (isAdmin) {
      Promise.all([dataService.getUsers(), dataService.getScreens()])
        .then(([u, s]) => {
          setUsers(u);
          setScreens(s);
        })
        .catch(() => undefined);
    }
  }, [isAdmin]);

  const saveTransition = async () => {
    setSavingTransition(true);
    try {
      await dataService.updateSettings({ transition });
      toast('Transition saved — screens pick it up within 30 seconds', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to save', 'error');
    }
    setSavingTransition(false);
  };

  const changeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) {
      toast('New passwords do not match', 'error');
      return;
    }
    setPwBusy(true);
    try {
      await dataService.changeMyPassword(currentPw, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      toast('Your password has been changed', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to change password', 'error');
    }
    setPwBusy(false);
  };

  const openAdd = () => setForm({ ...emptyForm });
  const openEdit = (u: User) =>
    setForm({
      id: u.id,
      name: u.name,
      username: u.username,
      password: '',
      role: u.role,
      allowedScreens: u.allowedScreens === '*' ? [] : u.allowedScreens,
    });

  const toggleFormScreen = (screenId: string) => {
    if (!form) return;
    const has = form.allowedScreens.includes(screenId);
    setForm({
      ...form,
      allowedScreens: has ? form.allowedScreens.filter((s) => s !== screenId) : [...form.allowedScreens, screenId],
    });
  };

  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    try {
      if (form.id) {
        const updated = await dataService.updateUser(form.id, {
          name: form.name,
          role: form.role,
          allowedScreens: form.allowedScreens,
          ...(form.password ? { password: form.password } : {}),
        });
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        toast(`User "${updated.name}" updated`, 'success');
      } else {
        const created = await dataService.createUser({
          name: form.name,
          username: form.username,
          password: form.password,
          role: form.role,
          allowedScreens: form.allowedScreens,
        });
        setUsers((prev) => [...prev, created]);
        toast(`User "${created.name}" created — they sign in with username "${created.username}"`, 'success');
      }
      setForm(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save user', 'error');
    }
  };

  const deleteUser = async (u: User) => {
    if (!window.confirm(`Delete user "${u.name}"? They will no longer be able to sign in.`)) return;
    try {
      await dataService.deleteUser(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      toast(`User "${u.name}" deleted`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete user', 'error');
    }
  };

  const screensLabel = (u: User) => {
    if (u.role === 'Admin' || u.allowedScreens === '*') return 'All screens';
    const n = u.allowedScreens.length;
    return `${n} screen${n === 1 ? '' : 's'}`;
  };

  return (
    <div className="max-w-4xl space-y-8 pb-10">
      <div>
        <h1 className="font-display font-black text-2xl text-white uppercase tracking-wide-ds mb-2">Settings</h1>
        <p className="font-mono text-xs text-suncoast-warm-gray uppercase tracking-widest">Manage your workspace preferences, users, and account.</p>
      </div>

      {/* --- Playback / transition (admin only) --- */}
      {isAdmin && (
        <TacticalPanel className="overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-suncoast-elevated">
            <div className="p-3 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
              <MonitorPlay size={24} />
            </div>
            <div>
              <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-lg">Playback</h2>
              <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">Global settings for {workspace?.name}</p>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div>
              <label className={labelCls}>Transition Between Items</label>
              <select
                value={transition}
                onChange={(e) => setTransition(e.target.value as TransitionStyle)}
                className="w-full max-w-md px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-mono text-xs uppercase tracking-widest appearance-none rounded-none"
              >
                <option value="none">None (Hard Cut)</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide Left</option>
                <option value="slide-up">Slide Up</option>
                <option value="zoom">Zoom In</option>
                <option value="flip">Flip</option>
                <option value="wipe">Wipe</option>
              </select>
              <p className="font-mono text-[10px] text-suncoast-warm-gray mt-2">
                Used between playlist items on every screen. Players pick up changes within 30 seconds.
              </p>
            </div>
          </div>
          <div className="bg-suncoast-elevated p-4 border-t border-white/5 flex justify-end">
            <TacticalButton onClick={saveTransition} disabled={savingTransition}>
              {savingTransition ? 'Saving...' : 'Save Playback Settings'}
            </TacticalButton>
          </div>
        </TacticalPanel>
      )}

      {/* --- Team members (admin only) --- */}
      {isAdmin && (
        <TacticalPanel className="overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between bg-suncoast-elevated">
            <div className="flex items-center gap-4">
              <div className="p-3 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
                <Users size={24} />
              </div>
              <div>
                <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-lg">Team Members</h2>
                <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                  Members can only control the screens you allow
                </p>
              </div>
            </div>
            <TacticalButton variant="secondary" onClick={openAdd}>
              <Plus size={14} />
              Add User
            </TacticalButton>
          </div>
          <div className="p-0 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-suncoast-elevated border-b border-white/5">
                <tr className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
                  <th className="p-4 font-normal">User</th>
                  <th className="p-4 font-normal">Role</th>
                  <th className="p-4 font-normal">Can Control</th>
                  <th className="p-4 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-none border border-suncoast-gold/30 bg-suncoast-black flex items-center justify-center text-suncoast-gold font-bold text-sm">
                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-sans text-sm font-medium text-white">
                            {u.name} {u.id === user?.id && <span className="text-suncoast-warm-gray">(You)</span>}
                          </div>
                          <div className="font-mono text-[10px] text-suncoast-light-gray uppercase tracking-widest">{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{u.role}</td>
                    <td className="p-4 font-mono text-xs text-suncoast-light-gray uppercase tracking-widest">{screensLabel(u)}</td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(u)}
                          title="Edit user / reset password"
                          className="text-suncoast-warm-gray hover:text-suncoast-gold p-1.5 hover:bg-suncoast-gold/10 transition-colors border border-transparent hover:border-suncoast-gold/20"
                        >
                          <Pencil size={15} />
                        </button>
                        {u.id !== user?.id && (
                          <button
                            onClick={() => deleteUser(u)}
                            title="Delete user"
                            className="text-suncoast-warm-gray hover:text-red-500 p-1.5 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TacticalPanel>
      )}

      {/* --- My account: change password --- */}
      <TacticalPanel className="overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center gap-4 bg-suncoast-elevated">
          <div className="p-3 border border-suncoast-gold/20 bg-suncoast-gold/5 text-suncoast-gold rounded-none">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="font-display font-bold text-white uppercase tracking-wide-ds text-lg">My Account</h2>
            <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest">
              Signed in as {user?.name} ({user?.username}) — change your password below
            </p>
          </div>
        </div>
        <form onSubmit={changeMyPassword} className="p-6 space-y-4 max-w-md">
          <div>
            <label className={labelCls}>Current Password</label>
            <input type="password" required autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>New Password (min 8 characters)</label>
            <input type="password" required minLength={8} autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <input type="password" required minLength={8} autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={inputCls} />
          </div>
          <div className="pt-2">
            <TacticalButton type="submit" disabled={pwBusy}>
              {pwBusy ? 'Changing...' : 'Change My Password'}
            </TacticalButton>
          </div>
        </form>
      </TacticalPanel>

      {/* --- Add / edit user modal --- */}
      {form && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <TacticalPanel className="w-full max-w-lg overflow-hidden flex flex-col z-50 shadow-2xl max-h-[90vh]">
            <div className="p-4 border-b border-suncoast-gold/20 flex justify-between items-center bg-suncoast-elevated shrink-0">
              <h2 className="font-display font-black text-white uppercase tracking-wide-ds text-sm">
                {form.id ? `Edit User — ${form.name || form.username}` : 'Add User'}
              </h2>
              <button onClick={() => setForm(null)} className="text-suncoast-warm-gray hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={saveUser} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Full Name</label>
                  <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jam Ancheta" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Username</label>
                  <input
                    type="text"
                    required
                    disabled={!!form.id}
                    autoCapitalize="none"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="e.g. jam"
                    className={`${inputCls} ${form.id ? 'opacity-50' : ''}`}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{form.id ? 'New Password (blank = keep current)' : 'Password (min 8 characters)'}</label>
                  <input
                    type="password"
                    required={!form.id}
                    minLength={8}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-suncoast-black border border-white/10 focus:outline-none focus:border-suncoast-gold text-white font-mono text-xs uppercase tracking-widest appearance-none rounded-none"
                  >
                    <option value="Member">Member (limited screens)</option>
                    <option value="Admin">Admin (everything)</option>
                  </select>
                </div>
              </div>
              {form.role === 'Member' && (
                <div>
                  <label className={labelCls}>Screens this user can control</label>
                  {screens.length === 0 ? (
                    <p className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest py-2">No screens yet — add screens first.</p>
                  ) : (
                    <div className="border border-white/10 divide-y divide-white/5 max-h-52 overflow-y-auto">
                      {screens.map((s) => (
                        <label key={s.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-suncoast-elevated transition-colors">
                          <input type="checkbox" checked={form.allowedScreens.includes(s.id)} onChange={() => toggleFormScreen(s.id)} className="accent-[#C49A3C]" />
                          <span className="font-sans text-sm text-white">{s.name}</span>
                          <span className="font-mono text-[10px] text-suncoast-warm-gray uppercase tracking-widest ml-auto">{s.status}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <p className="font-mono text-[10px] text-suncoast-warm-gray mt-2">Members only see and manage the screens checked here.</p>
                </div>
              )}
              <div className="pt-4 flex justify-end gap-3 border-t border-white/5 mt-4">
                <TacticalButton type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</TacticalButton>
                <TacticalButton type="submit">{form.id ? 'Save Changes' : 'Create User'}</TacticalButton>
              </div>
            </form>
          </TacticalPanel>
        </div>
      )}
    </div>
  );
}
