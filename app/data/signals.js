// DEPRECATED — seeded CxO signals removed.
//
// The O1 CxO Signals explorer no longer ships with fake emails, chats, or
// meeting notes. Signal companies are now ingested from the analyst's real
// M365 mailbox (via lib/ingest/signals.js) and persisted to Azure Cosmos DB;
// the app starts empty and fills only from real signals. See lib/store.js
// (getMailbox / getSignalCompanies / getCrm / ingestSignals).
//
// The previous seed content is archived at archive/seed/signals.legacy.js and
// archive/seed/signals.json for retrieval. This module is intentionally empty
// and no longer imported.

export const mailbox = { emails: [], chats: [], meetings: [] };
export function companiesWithSignals() {
  return [];
}
export function crmForCompany() {
  return null;
}
