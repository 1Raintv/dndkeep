import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Campaign } from '../types';
import { getCampaignsByMember } from '../lib/supabase';
import { useAuth } from './AuthContext';

// v2.296.0 — Plumbing cleanup. CampaignContext used to also carry
// sessionState + updateSessionState, both of which targeted the
// session_states table. After the v2.286–v2.295 combat-system
// unification arc, that table held no useful state and was dropped
// in v2.296. The context value now only carries the campaign
// roster + active selection. Modern combat state lives on
// combat_encounters + combat_participants and is consumed via
// useCombat() / CombatProvider, mounted inside CampaignDashboard
// and (separately) inside CharacterSheet.
//
// useAuth import retained on the off-chance future ships need
// per-user gating; isPro is no longer read here (was previously a
// dependency of the session-state effect).

interface CampaignContextValue {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  loadingCampaigns: boolean;
  setActiveCampaign: (campaign: Campaign | null) => void;
  refreshCampaigns: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue>({
  campaigns: [],
  activeCampaign: null,
  loadingCampaigns: false,
  setActiveCampaign: () => {},
  refreshCampaigns: async () => {},
});

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaignState] = useState<Campaign | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const refreshCampaigns = useCallback(async () => {
    if (!user) return;
    setLoadingCampaigns(true);
    const { data } = await getCampaignsByMember();
    setCampaigns(data);
    setLoadingCampaigns(false);
  }, [user]);

  useEffect(() => { refreshCampaigns(); }, [refreshCampaigns]);

  function setActiveCampaign(campaign: Campaign | null) {
    setActiveCampaignState(campaign);
  }

  return (
    <CampaignContext.Provider value={{
      campaigns, activeCampaign, loadingCampaigns,
      setActiveCampaign, refreshCampaigns,
    }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  return useContext(CampaignContext);
}
