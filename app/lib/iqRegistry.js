const IQS = Object.freeze([
  {
    id: 'foundry',
    label: 'Foundry IQ',
    agent: 'deal-room-foundry-iq',
    protocol: 'A2A',
    dataClass: 'internal-data',
    reason: 'firm knowledge, playbooks, citations, and cross-agent synthesis',
    signals: /\b(playbook|policy|precedent|citation|memo|deck|recommend|synthesi[sz]|agent|skill|methodology|framework)\b/i,
  },
  {
    id: 'fabric',
    label: 'Fabric IQ',
    agent: 'deal-room-fabric-iq',
    protocol: 'A2A',
    dataClass: 'internal-data',
    reason: 'fund, portfolio, model, and lakehouse analytics',
    signals: /\b(fabric|lakehouse|onelake|portfolio|fund|exposure|benchmark|trend|returns?|irr|moic|leverage|model|valuation|multiple|ebitda)\b/i,
  },
  {
    id: 'work',
    label: 'Work IQ',
    agent: 'deal-room-work-iq',
    protocol: 'A2A',
    dataClass: 'internal-data',
    reason: 'user-scoped Microsoft 365 mail, files, meetings, and conversations',
    signals: /\b(work iq|microsoft 365|m365|sharepoint|teams|channel|chat|mail|email|outlook|meeting|calendar|file|document|message|correspondence)\b/i,
  },
  {
    id: 'web',
    label: 'Web IQ',
    agent: 'deal-room-web-iq',
    protocol: 'A2A',
    dataClass: 'external-web',
    reason: 'current public-web company, market, and news intelligence',
    signals: /\b(web iq|public web|internet|latest news|current news|news|press release|website|online|market update|public source|search the web)\b/i,
  },
]);

export function listIqRoutes() {
  return IQS.map(({ signals, ...iq }) => ({ ...iq }));
}

export function routePromptToIq(prompt) {
  const text = String(prompt || '').trim();
  const matched = IQS.filter((iq) => iq.signals.test(text));
  const primary = matched[0] || IQS[0];
  const blockedCombination = matched.some((iq) => iq.id === 'web')
    && matched.some((iq) => iq.dataClass === 'internal-data');
  return {
    ...listIqRoutes().find((iq) => iq.id === primary.id),
    matched: matched.map((iq) => iq.id),
    blockedCombination,
    decision: matched.length
      ? `Prompt matched ${primary.label}: ${primary.reason}.`
      : `No specialist data signal matched; ${primary.label} owns orchestration and synthesis.`,
  };
}