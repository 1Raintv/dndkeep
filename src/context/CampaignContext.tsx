import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Campaign, SessionState } from '../types';
import {
  supabase,
  subscribeToSessionState,
  getCampaignsByMember,
  getSessionState,
  upsertSessionState,
} from '../lib/supabase';
import { useAuth } from './AuthContext';

interface CampaignContextValue {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  sessionState: SessionState | null;
  loadingCampaigns: boolean;
  setActiveCampaign: (campaign: Campaign | null) => void;
  updateSessionState: (updates: Partial<SessionState>) => Promise<void>;
  refreshCampaigns: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextValue>({
  campaigns: [],
  activeCampaign: null,
  sessionState: null,
  loadingCampaigns: false,
  setActiveCampaign: () => {},
  updateSessionState: async () => {},
  refreshCampaigns: async () => {},
});

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user, isPro } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaignState] = useState<Campaign | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const refreshCampaigns = useCallback(async () => {
    if (!user) return;
    setLoadingCampaigns(true);
    const { data } = await getCampaignsByMember();
    setCampaigns(data);
    setLoadingCampaigns(false);
  }, [user]);

  useEffect(() => { refreshCampaigns(); }, [refreshCampaigns]);

  // Subscribe to session state changes when a campaign is active
  useEffect(() => {
    if (!activeCampaign) return;

    // Load current session state
    getSessionState(activeCampaign.id).then(({ data }) => {
      if (data) setSessionState(data);
    });

    // Subscribe to real-time updates
    const channel = subscribeToSessionState(activeCampaign.id, (state) => {
      setSessionState(state);
    });

    return () => { supabase.removeChannel(channel); };
  }, [activeCampaign, isPro]);

  function setActiveCampaign(campaign: Campaign | null) {
    setActiveCampaignState(campaign);
    if (!campaign) setSessionState(null);
  }

  async function updateSessionState(updates: Partial<SessionState>) {
    if (!activeCampaign) return;

    // v2.295.0 — Stripped the dead column defaults
    // (initiative_order/current_turn/round/combat_active). They were
    // dropped from session_states in this ship; including them in the
    // upsert payload would now cause a schema-error 400 from
    // PostgREST. Function itself is dead code (no live caller invokes
    // updateSessionState() after the v2.291–v2.294 migrations); kept
    // around so CampaignContext's typed shape survives without
    // forcing a coupled TS cleanup of the vestigial onUpdateSession
    // prop chain through DMScreen / DMlobby / NpcTokenQuickPanel /
    // BattleMapV2.
    const newState: Omit<SessionState, 'id' | 'updated_at'> = {
      campaign_id: activeCampaign.id,
      ...sessionState,
      ...updates,
    };

    const { data } = await upsertSessionState(newState);
    if (data) setSessionState(data);
  }

  return (
    <CampaignContext.Provider value={{
      campaigns, activeCampaign, sessionState, loadingCampaigns,
      setActiveCampaign, updateSessionState, refreshCampaigns,
    }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign() {
  return useContext(CampaignContext);
}
