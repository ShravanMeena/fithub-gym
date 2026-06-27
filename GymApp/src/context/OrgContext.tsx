import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setBrandColor } from '../theme';
import { OrgAPI } from '../api/client';

export type Org = {
  id: number;
  slug: string;
  name: string;
  tagline?: string;
  primary_color?: string;
  logo_url?: string | null;
};

const ORG_KEY = 'gym.org';

type OrgState = {
  org: Org | null;
  loading: boolean;
  selectOrg: (org: Org) => Promise<void>;
  clearOrg: () => Promise<void>;
  refreshOrg: (slug?: string) => Promise<void>;
};

const OrgContext = createContext<OrgState>({} as OrgState);
export const useOrg = () => useContext(OrgContext);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [org, setOrg] = useState<Org | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(ORG_KEY);
      if (raw) {
        const o = JSON.parse(raw) as Org;
        setOrg(o);
        setBrandColor(o.primary_color);
      }
      setLoading(false);
    })();
  }, []);

  const selectOrg = useCallback(async (o: Org) => {
    await AsyncStorage.setItem(ORG_KEY, JSON.stringify(o));
    setBrandColor(o.primary_color);
    setOrg(o);
  }, []);

  const clearOrg = useCallback(async () => {
    await AsyncStorage.removeItem(ORG_KEY);
    setBrandColor(null);
    setOrg(null);
  }, []);

  // Re-fetch the gym's branding from the server (picks up admin renames/recolours).
  const refreshOrg = useCallback(async (slugArg?: string) => {
    const slug = slugArg || org?.slug;
    if (!slug) return;
    try {
      const { organization } = await OrgAPI.get(slug);
      if (organization) {
        await AsyncStorage.setItem(ORG_KEY, JSON.stringify(organization));
        setBrandColor(organization.primary_color);
        setOrg(organization);
      }
    } catch { /* offline — keep cached */ }
  }, [org?.slug]);

  return (
    <OrgContext.Provider value={{ org, loading, selectOrg, clearOrg, refreshOrg }}>
      {children}
    </OrgContext.Provider>
  );
}
