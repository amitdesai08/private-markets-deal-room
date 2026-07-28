// Right-hand agents panel. Pick an agent (the Deal Room orchestrator or one of the
// role-gated persona agents) and chat; answers are grounded in the live record via
// the orchestrator's agent endpoints. `agents` is already filtered to what the
// caller may use; `focusDealId` scopes the conversation to a deal; `viewAsRole` is
// forwarded so the backend answers as the impersonated (never-elevated) role.
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from './md';
import { af } from './authFetch';
import type { Agent, Deal } from './types';

type ProposedAction = { id: string; kind: string; label: string; summary: string; args: Record<string, unknown>; sources?: string[] };
type Msg = { role: 'user' | 'agent'; text: string; source?: string; tools?: string[]; pending?: boolean; proposed?: ProposedAction[]; applied?: string[] };

const DEAL_STARTERS = [
  'Give me the IC readiness verdict and what is blocking it.',
  'Show comparable deals and IC precedents.',
  'What are the top risks and the compliance status?',
];

export default function ChatPanel({ agents, deals, focusDealId, onClose, viewAsRole }: {
  agents: Agent[]; deals: Deal[]; focusDealId: string; onClose: () => void; viewAsRole?: string;
}) {
  const [agentKey, setAgentKey] = useState('orchestrator');
  const [dealId, setDealId] = useState('');
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [prevId, setPrevId] = useState<Record<string, string | undefined>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (focusDealId) setDealId(focusDealId); }, [focusDealId]);

  const agent = agents.find((a) => a.key === agentKey) || agents[0];
  const threadKey = `${agent?.key}:${dealId || 'portfolio'}`;
  const messages = threads[threadKey] || [];
  const activeDeal = deals.find((x) => x.id === dealId) || null;
  // Deal-state-aware suggested actions: the assistant proposes the next concrete step
  // for THIS deal's state (never acts on its own — the user approves by clicking).
  const contextActions = useMemo(() => {
    const d = activeDeal;
    if (!d) return [] as string[];
    const r = d.readiness ?? 0;
    const days = typeof d.daysToIC === 'number' ? d.daysToIC : null;
    const co = d.company;
    const out: string[] = [];
    if (days != null && days >= 0 && days <= 21 && r < 80) out.push(`What must clear before ${co}'s IC in ${days} days?`);
    if (r < 40) out.push(`Which diligence workstreams should we prioritise for ${co}?`);
    if (r >= 80) out.push(`Draft the IC recommendation summary for ${co}.`);
    out.push(`Summarise what changed on ${co} since the last review.`);
    return out.slice(0, 3);
  }, [activeDeal]);
  const starters = useMemo(() => (dealId ? contextActions.concat(DEAL_STARTERS) : agent?.starters.slice() || []), [agent, dealId, contextActions]);

  useEffect(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, sending]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending || !agent) return;
    setInput('');
    setThreads((t) => ({ ...t, [threadKey]: [...(t[threadKey] || []), { role: 'user', text: msg }, { role: 'agent', text: '', pending: true }] }));
    setSending(true);
    const endpoint = agent.kind === 'orchestrator' ? '/api/deal-agent/chat' : `/api/persona-agents/${agent.persona}/chat`;
    const body: Record<string, unknown> = { message: msg, previousResponseId: prevId[threadKey] };
    if (dealId) body.dealId = dealId;
    if (agent.kind === 'orchestrator') body.scope = dealId ? 'deal' : 'portfolio';
    if (viewAsRole) body.viewAsRole = viewAsRole;
    try {
      const res = await af(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = data?.reply || data?.error || 'No response.';
      const tools = Array.isArray(data?.toolCalls) && data.toolCalls.length ? Array.from(new Set(data.toolCalls)) as string[] : undefined;
      const proposed = Array.isArray(data?.proposedActions) && data.proposedActions.length ? data.proposedActions as ProposedAction[] : undefined;
      if (data?.responseId) setPrevId((p) => ({ ...p, [threadKey]: data.responseId }));
      setThreads((t) => { const arr = (t[threadKey] || []).slice(); arr[arr.length - 1] = { role: 'agent', text: reply, source: data?.source, tools, proposed }; return { ...t, [threadKey]: arr }; });
    } catch (e: any) {
      setThreads((t) => { const arr = (t[threadKey] || []).slice(); arr[arr.length - 1] = { role: 'agent', text: `Sorry — I couldn't reach the assistant (${String(e?.message || e)}).`, source: 'error' }; return { ...t, [threadKey]: arr }; });
    } finally { setSending(false); }
  }

  // Apply an assistant-proposed action after the user approves it. Writes a fully
  // attributed audit-trail entry server-side (actor = signed-in user, via = assistant).
  async function applyAction(msgIdx: number, a: ProposedAction) {
    if (applying || !dealId) return;
    setApplying(a.id);
    try {
      const res = await af(`/api/deals/${dealId}/assistant-actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: a.kind, args: a.args, viewAsRole: viewAsRole || undefined }) });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(data?.detail || data?.error || 'apply failed');
      setThreads((t) => {
        const arr = (t[threadKey] || []).slice();
        const m = arr[msgIdx];
        if (m) arr[msgIdx] = { ...m, applied: [...(m.applied || []), a.id], proposed: (m.proposed || []).filter((p) => p.id !== a.id) };
        arr.push({ role: 'agent', text: `✓ Applied — ${a.label.toLowerCase()}: “${a.summary}”. Recorded to the deal's activity trail under your name.`, source: 'applied' });
        return { ...t, [threadKey]: arr };
      });
    } catch (e: any) {
      setThreads((t) => { const arr = (t[threadKey] || []).slice(); arr.push({ role: 'agent', text: `Couldn't apply that (${String(e?.message || e)}).`, source: 'error' }); return { ...t, [threadKey]: arr }; });
    } finally { setApplying(''); }
  }
  return (
    <aside className="chatpanel">
      <div className="chat-head">
        <div className="chat-title">{agents.length > 1 ? 'Ask the agents' : agent.label}</div>
        <button className="iconbtn" onClick={onClose} aria-label="Close chat">✕</button>
      </div>

      {agents.length > 1 ? (
        <div className="rail-v">
          {agents.map((a) => (
            <button key={a.key} onClick={() => setAgentKey(a.key)} className={`agent${a.key === agentKey ? ' on' : ''}`} title={a.subtitle}>
              <span className="av">{a.initials}</span>
              <span className="al"><span className="an">{a.label}</span><span className="as">{a.subtitle}</span></span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="scopebar">
        <span className="scope-l">Focus</span>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className="scope">
          <option value="">Whole portfolio</option>
          {deals.map((d) => (<option key={d.id} value={d.id}>{d.company}{d.stageName ? ` · ${d.stageName}` : ''}</option>))}
        </select>
      </div>

      <div ref={scrollRef} className="thread">
        {messages.length === 0 ? (
          <div className="empty">
            <div className="av-lg">{agent.initials}</div>
            <div className="empty-t">Ask {agent.label}</div>
            <div className="empty-s">{agent.subtitle}{activeDeal ? ` · ${activeDeal.company}` : ''}</div>
            <div className="starters">{starters.map((s, i) => (<button key={i} className="starter" onClick={() => send(s)}>{s}</button>))}</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              {m.role === 'agent' ? <span className="msg-av">{agent.initials}</span> : null}
              <div className={`bubble ${m.role}`}>
                {m.pending ? (<span className="typing"><span></span><span></span><span></span></span>)
                    : m.role === 'agent' ? (<><div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />{m.tools?.length ? <div className="tools">Sources: {m.tools.join(', ')}</div> : m.source === 'live' ? <div className="tools">live</div> : null}</>)
                    : (<div>{m.text}</div>)}
                {m.proposed?.length ? (
                  <div className="proposed">
                    <div className="proposed-h">Suggested actions — you approve, I apply</div>
                    {m.proposed.map((a) => (
                      <div key={a.id} className="proposed-row">
                        <div className="proposed-main">
                          <span className="proposed-label">{a.label}</span>
                          <span className="proposed-sum">{a.summary}</span>
                          {a.sources?.length ? <span className="proposed-src">source: {a.sources[0]}</span> : null}
                        </div>
                        <button className="proposed-apply" disabled={!!applying} onClick={() => applyAction(i, a)}>{applying === a.id ? 'Applying…' : 'Apply ▸'}</button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea className="input" placeholder={`Message ${agent.label}…`} value={input} rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <button className="send" type="submit" disabled={sending || !input.trim()} aria-label="Send">{sending ? '…' : '➤'}</button>
      </form>
    </aside>
  );
}
