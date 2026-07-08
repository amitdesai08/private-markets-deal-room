import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { initTeams, getSsoToken, type TeamsInfo } from './teams';
import { renderMarkdown } from './md';

type TeamsConfig = { demoMode: boolean; backend: string; sso: boolean; bot: boolean; backendUrl?: string };
type Persona = { id: string; name?: string; title?: string } | null;
type Deal = {
  id: string; company: string; sector?: string; stage?: string; stageName?: string;
  readiness?: number; daysToIC?: number; dealSize?: number; currency?: string;
};
type Msg = { role: 'user' | 'agent'; text: string; source?: string; tools?: string[]; pending?: boolean };

type Agent = {
  key: string; label: string; subtitle: string; initials: string;
  kind: 'orchestrator' | 'persona'; persona?: string; starters: string[];
};

// The orchestrator is always available (deal-agent). Persona MDs are layered on
// when the backend reports them configured. 'analyst' is covered by the orchestrator.
const ORCHESTRATOR: Agent = {
  key: 'orchestrator',
  label: 'Deal Room Analyst',
  subtitle: 'Portfolio & deal orchestrator',
  initials: 'DR',
  kind: 'orchestrator',
  starters: [
    'List every deal with its stage, status and IC readiness.',
    'Which deal is the highest priority right now, and why?',
    'Where is the pipeline light — what should we source next?',
  ],
};

const PERSONA_META: Record<string, { initials: string; subtitle: string; starters: string[] }> = {
  partner: { initials: 'EB', subtitle: 'Partner — deal sponsor & IC gatekeeper', starters: ['Give me your go/no-go read on the portfolio.', 'What conditions would you require to approve at IC?'] },
  'retail-md': { initials: 'RM', subtitle: 'Retail MD — commercial lane', starters: ['What commercial diligence should we prioritise?', 'Suggest a commercial value-creation lever.'] },
  'ai-md': { initials: 'AI', subtitle: 'AI MD — tech / AI lane', starters: ['Score AI-readiness and flag the tech risks.', 'Propose an AI / digital value-creation lever.'] },
  'supply-md': { initials: 'SM', subtitle: 'Supply Chain MD — operations lane', starters: ['Surface the supply-chain & concentration risks.', 'Suggest an operational cost-out lever.'] },
};
const PERSONA_ORDER = ['partner', 'retail-md', 'ai-md', 'supply-md'];

// Extra starters offered once a specific deal is in scope.
const DEAL_STARTERS = [
  'Give me the IC readiness verdict and what is blocking it.',
  'Show comparable deals and IC precedents from Fabric.',
  'What are the top risks and the compliance status?',
];

export default function App() {
  const [, setTeams] = useState<TeamsInfo | null>(null);
  const [cfg, setCfg] = useState<TeamsConfig | null>(null);
  const [persona, setPersona] = useState<Persona>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [agents, setAgents] = useState<Agent[]>([ORCHESTRATOR]);
  const [agentKey, setAgentKey] = useState<string>('orchestrator');
  const [dealId, setDealId] = useState<string>('');
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [prevId, setPrevId] = useState<Record<string, string | undefined>>({});
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agent = agents.find((a) => a.key === agentKey) || ORCHESTRATOR;
  const threadKey = `${agent.key}:${dealId || 'portfolio'}`;
  const messages = threads[threadKey] || [];

  useEffect(() => {
    (async () => {
      setTeams(await initTeams());

      // Independent loads — a hanging SSO handshake must not block the console.
      fetch('/api/teams/config').then((r) => r.json()).then(setCfg).catch(() => {});

      fetch('/api/config').then((r) => r.json()).then((backendCfg) => {
        const list: Agent[] = [ORCHESTRATOR];
        if (backendCfg?.personaAgents?.configured) {
          for (const p of PERSONA_ORDER) {
            const found = (backendCfg.personaAgents.agents || []).find((x: any) => x.persona === p);
            const meta = PERSONA_META[p];
            if (found && meta) list.push({ key: p, label: shortLabel(found.label, p), subtitle: meta.subtitle, initials: meta.initials, kind: 'persona', persona: p, starters: meta.starters });
          }
        }
        setAgents(list);
      }).catch(() => {});

      fetch('/api/deals').then((r) => (r.ok ? r.json() : [])).then((d) => { if (Array.isArray(d)) setDeals(d); }).catch(() => {});

      // Per-user context (Teams SSO -> OBO -> persona). Non-blocking; hangs gracefully outside Teams.
      getSsoToken().then((token) =>
        fetch('/api/teams/context', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ssoToken: token }) }).then((r) => r.json())
      ).then((ctx) => { if (ctx?.persona) setPersona(ctx.persona); }).catch(() => {});
    })();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, sending]);

  const activeDeal = deals.find((x) => x.id === dealId) || null;
  const starters = useMemo(() => (dealId ? DEAL_STARTERS.concat(agent.starters.slice(0, 1)) : agent.starters.slice()), [agent, dealId]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setInput('');
    setThreads((t) => ({ ...t, [threadKey]: [...(t[threadKey] || []), { role: 'user', text: msg }, { role: 'agent', text: '', pending: true }] }));
    setSending(true);

    const endpoint = agent.kind === 'orchestrator' ? '/api/deal-agent/chat' : `/api/persona-agents/${agent.persona}/chat`;
    const body: Record<string, unknown> = { message: msg, previousResponseId: prevId[threadKey] };
    if (dealId) body.dealId = dealId;
    if (agent.kind === 'orchestrator') body.scope = dealId ? 'deal' : 'portfolio';

    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      const reply = data?.reply || data?.error || 'No response.';
      const tools: string[] | undefined = Array.isArray(data?.toolCalls) && data.toolCalls.length ? Array.from(new Set(data.toolCalls)) as string[] : undefined;
      if (data?.responseId) setPrevId((p) => ({ ...p, [threadKey]: data.responseId }));
      setThreads((t) => {
        const arr = (t[threadKey] || []).slice();
        arr[arr.length - 1] = { role: 'agent', text: reply, source: data?.source, tools };
        return { ...t, [threadKey]: arr };
      });
    } catch (e: any) {
      setThreads((t) => {
        const arr = (t[threadKey] || []).slice();
        arr[arr.length - 1] = { role: 'agent', text: `Sorry — I couldn't reach the agent (${String(e?.message || e)}).`, source: 'error' };
        return { ...t, [threadKey]: arr };
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={S.shell}>
      <style>{GLOBAL_CSS}</style>

      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.logo}>◆</div>
          <div>
            <div style={S.title}>The Deal Room</div>
            <div style={S.subtitle}>Ask your deal-flow agents — grounded in live pipeline data</div>
          </div>
        </div>
        <div style={S.headerRight}>
          {persona?.name ? <span className="badge" title="Signed-in persona">{persona.name}{persona.title ? ` · ${persona.title}` : ''}</span> : null}
          {cfg?.backendUrl ? <a className="dashlink" href={cfg.backendUrl} target="_blank" rel="noopener noreferrer">Full dashboard ↗</a> : null}
        </div>
      </header>

      <nav style={S.rail} aria-label="Agents">
        {agents.map((a) => (
          <button key={a.key} onClick={() => setAgentKey(a.key)} className={`agent${a.key === agentKey ? ' on' : ''}`} title={a.subtitle}>
            <span className="av">{a.initials}</span>
            <span className="al"><span className="an">{a.label}</span><span className="as">{a.subtitle}</span></span>
          </button>
        ))}
      </nav>

      <div style={S.scopebar}>
        <span style={S.scopeLabel}>Focus</span>
        <select value={dealId} onChange={(e) => setDealId(e.target.value)} className="scope">
          <option value="">Whole portfolio</option>
          {deals.map((d) => (<option key={d.id} value={d.id}>{d.company}{d.sector ? ` · ${d.sector}` : ''}{d.stageName ? ` · ${d.stageName}` : ''}</option>))}
        </select>
        {activeDeal ? (
          <span className="dealmeta">{typeof activeDeal.readiness === 'number' ? `IC readiness ${activeDeal.readiness}%` : ''}{typeof activeDeal.daysToIC === 'number' ? ` · IC in ${activeDeal.daysToIC}d` : ''}</span>
        ) : (
          <span className="dealmeta">{deals.length} live deal{deals.length === 1 ? '' : 's'}</span>
        )}
      </div>

      <div ref={scrollRef} style={S.thread}>
        {messages.length === 0 ? (
          <div style={S.empty}>
            <div className="av-lg">{agent.initials}</div>
            <div style={S.emptyTitle}>Ask {agent.label}</div>
            <div style={S.emptySub}>{agent.subtitle}{activeDeal ? ` · focused on ${activeDeal.company}` : ''}</div>
            <div style={S.starters}>{starters.map((s, i) => (<button key={i} className="starter" onClick={() => send(s)}>{s}</button>))}</div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`row ${m.role}`}>
              {m.role === 'agent' ? <span className="msg-av">{agent.initials}</span> : null}
              <div className={`bubble ${m.role}`}>
                {m.pending ? (
                  <span className="typing"><span></span><span></span><span></span></span>
                ) : m.role === 'agent' ? (
                  <>
                    <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                    {m.tools?.length ? <div className="tools">grounded via {m.tools.join(', ')}</div> : m.source === 'live' ? <div className="tools">live</div> : null}
                  </>
                ) : (
                  <div>{m.text}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form style={S.composer} onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <textarea
          className="input" placeholder={`Message ${agent.label}…`} value={input} rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        <button className="send" type="submit" disabled={sending || !input.trim()} aria-label="Send">{sending ? '…' : '➤'}</button>
      </form>
    </div>
  );
}

function shortLabel(label: string | undefined, persona: string): string {
  if (!label) return persona;
  return label.split('—')[0].split('(')[0].trim() || label;
}

const S: Record<string, CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--fg)', font: '14px/1.5 "Segoe UI", system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  brand: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 34, height: 34, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-fg)', display: 'grid', placeItems: 'center', fontSize: 18 },
  title: { fontWeight: 700, fontSize: 16 },
  subtitle: { color: 'var(--muted)', fontSize: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  rail: { display: 'flex', gap: 8, padding: '10px 16px', overflowX: 'auto', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  scopebar: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: '1px solid var(--border)' },
  scopeLabel: { color: 'var(--muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
  thread: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 },
  empty: { margin: 'auto', textAlign: 'center', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: 700 },
  emptySub: { color: 'var(--muted)' },
  starters: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14, width: '100%' },
  composer: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border)', background: 'var(--surface)' },
};

const GLOBAL_CSS = `
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
.badge { background: var(--chip); color: var(--fg); padding: 4px 10px; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.dashlink { color: var(--accent); text-decoration: none; font-size: 12px; font-weight: 600; }
.dashlink:hover { text-decoration: underline; }
.agent { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--border); background: var(--card); border-radius: 10px; cursor: pointer; color: var(--fg); white-space: nowrap; box-shadow: var(--shadow); }
.agent:hover { background: var(--hover); }
.agent.on { border-color: var(--accent); outline: 2px solid var(--accent); }
.agent .av { width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.agent .al { display: flex; flex-direction: column; text-align: left; }
.agent .an { font-weight: 600; font-size: 13px; }
.agent .as { color: var(--muted); font-size: 11px; }
.scope { background: var(--input-bg); color: var(--fg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font: inherit; max-width: 320px; }
.dealmeta { color: var(--muted); font-size: 12px; margin-left: auto; }
.av-lg { width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 20px; font-weight: 700; }
.starter { text-align: left; padding: 12px 14px; border: 1px solid var(--border); background: var(--card); color: var(--fg); border-radius: 10px; cursor: pointer; font: inherit; box-shadow: var(--shadow); }
.starter:hover { background: var(--hover); border-color: var(--accent); }
.row { display: flex; gap: 8px; align-items: flex-end; }
.row.user { justify-content: flex-end; }
.msg-av { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 11px; font-weight: 700; flex: 0 0 auto; }
.bubble { max-width: 78%; padding: 10px 14px; border-radius: 14px; box-shadow: var(--shadow); }
.bubble.user { background: var(--bubble-user); border-bottom-right-radius: 4px; }
.bubble.agent { background: var(--bubble-agent); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.bubble .tools { margin-top: 6px; color: var(--muted); font-size: 11px; border-top: 1px dashed var(--border); padding-top: 6px; }
.md > *:first-child { margin-top: 0; }
.md > *:last-child { margin-bottom: 0; }
.md p { margin: 8px 0; }
.md h3, .md h4, .md h5 { margin: 12px 0 6px; font-size: 14px; }
.md ul, .md ol { margin: 6px 0; padding-left: 20px; }
.md li { margin: 3px 0; }
.md code { background: var(--chip); padding: 1px 5px; border-radius: 4px; font-size: 12px; }
.md pre { background: var(--chip); padding: 10px; border-radius: 8px; overflow-x: auto; }
.md pre code { background: none; padding: 0; }
.md a { color: var(--accent); }
.typing { display: inline-flex; gap: 4px; }
.typing span { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); animation: b 1.2s infinite ease-in-out; }
.typing span:nth-child(2) { animation-delay: .2s; }
.typing span:nth-child(3) { animation-delay: .4s; }
@keyframes b { 0%, 80%, 100% { opacity: .3; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.input { flex: 1; resize: none; max-height: 140px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--input-bg); color: var(--fg); font: inherit; }
.input:focus { outline: 2px solid var(--accent); border-color: var(--accent); }
.send { width: 44px; border: none; border-radius: 10px; background: var(--accent); color: var(--accent-fg); cursor: pointer; font-size: 16px; }
.send:disabled { opacity: .5; cursor: default; }
`;
