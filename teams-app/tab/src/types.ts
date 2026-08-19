// Shared TypeScript shapes for the tab UI. These mirror the orchestrator's JSON API
// responses (app/server.js + app/lib) — keep them in sync when you change a payload.
// Intentionally loose (optional fields) so a minor backend addition never breaks the
// build; components tolerate missing fields.
export type Persona = { id: string; name?: string; title?: string } | null;

// The IC-readiness verdict, computed once in app/lib/icReadiness.js and carried on every
// deal summary. The UI renders this sentence; it does not compute its own. `gating` names
// the outstanding items as pre-joined sentences; `gatingItems` carries the SAME facts one
// level less joined, one entry per outstanding thing, for a UI that wants to show each as
// its own chip rather than parse a sentence back apart. At the status access tier the
// backend strips headline/gating/gatingItems and leaves only `state`, so all three are
// optional here by design, not by laziness.
export type GatingItem = { kind: 'required' | 'workstream' | 'risk' | 'obligation'; label: string; owner?: string | null; reason?: string | null };
export type ICVerdict = {
  state?: 'READY' | 'CONDITIONAL' | 'NOT-READY';
  headline?: string | null;
  gating?: string[];
  gatingItems?: GatingItem[];
  phase?: 'origination' | 'diligence' | 'post-committee';
  basis?: string | null;
};

export type Deal = {
  id: string; company: string; sector?: string; stage?: string; stageName?: string;
  status?: string; readiness?: number; daysToIC?: number; dealSize?: number; currency?: string;
  region?: string; tags?: string[];
  stageStepNumber?: number | null; stageStepTotal?: number | null;
  accessLevel?: 'full' | 'status' | 'none'; locked?: boolean;
  icVerdict?: ICVerdict;
};

export type DealGroup = { id: string; label: string; groupId?: string | null; groupPending?: boolean };
export type Region = { id: string; label: string };

export type Agent = {
  key: string; label: string; subtitle: string; initials: string;
  kind: 'orchestrator' | 'persona'; persona?: string; starters: string[];
};

export type Analytics = {
  deals?: number; inDiligence?: number; avgReadiness?: number;
  cycleReductionPct?: number; totalHoursSaved?: number; baselineDays?: number;
  avgDaysSaved?: number; fteWeeks?: number;
};

export type FunnelStep = { key: string; step: string; label: string; count: number; active: number };
export type Pipeline = {
  fundName?: string; fundStrategy?: string;
  counts?: { total: number; active: number; passed: number; parked: number; pursued: number };
  funnel?: FunnelStep[];
};

export type Comp = { company: string; ticker?: string; dealType?: string; impliedValuation?: number; status?: string };
export type Precedent = { deal: string; decision?: string; votesFor?: number; votesAgainst?: number; votesAbstain?: number; conditions?: string[]; meetingDate?: string };
export type Benchmark = { workstream: string; total: number; byRisk?: Record<string, number> };
export type FabricInfo = { mode?: string; live?: boolean; source?: string | null; freshness?: { label?: string } | null };
export type MarketIntel = {
  info?: FabricInfo; comparableDeals?: Comp[]; icPrecedents?: Precedent[]; benchmarkFindings?: Benchmark[]; companies?: unknown[];
};

export type BackendConfig = {
  personaAgents?: { configured?: boolean; agents?: { persona: string; label: string; agent: string }[] };
  fabric?: FabricInfo & { mode?: string };
  newsAgent?: string; dealAgent?: string;
};
