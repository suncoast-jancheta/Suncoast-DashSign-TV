import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Workspace, User } from '../types';
import { dataService } from '../services/dataService';

interface AppState {
  workspace: Workspace | null;
  user: User | null;
  loading: boolean;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    workspace: null,
    user: null,
    loading: true,
  });

  useEffect(() => {
    async function load() {
      await dataService.init();
      const workspace = await dataService.getWorkspace();
      const user = await dataService.getUser();
      setState({ workspace, user, loading: false });
    }
    load();
  }, []);

  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
