import React, { createContext, useContext, useState, useCallback } from 'react';

type UIState = { sidebarOpen: boolean; openSidebar: () => void; closeSidebar: () => void };
const UIContext = createContext<UIState>({} as UIState);
export const useUI = () => useContext(UIContext);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setOpen] = useState(false);
  const openSidebar = useCallback(() => setOpen(true), []);
  const closeSidebar = useCallback(() => setOpen(false), []);
  return <UIContext.Provider value={{ sidebarOpen, openSidebar, closeSidebar }}>{children}</UIContext.Provider>;
}
