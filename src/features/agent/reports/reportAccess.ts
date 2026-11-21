import { useMsal } from '@azure/msal-react';
import { isE2EAuthBypassEnabled } from '../../../app/auth/authConfig';
import { agentChatConfigured } from '../conversations/agentTransport';

// Display configuration only. API membership and current source grants are
// independent checks. Empty by default; no all-staff or email-domain fallback.
export function reportParticipants(): Array<{id: string; name: string}> {
  try {
    const values: unknown = JSON.parse(import.meta.env.VITE_ALLY_REPORT_PARTICIPANTS || '[]');
    if (!Array.isArray(values) || values.length > 10 || values.some(v => !v || typeof v.name !== 'string' || v.name.length > 100 || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.id)) || new Set(values.map(v => v.id)).size !== values.length) return [];
    return values;
  } catch { return []; }
}
export function useExecutiveReportAccess() {
  const {instance, accounts} = useMsal();
  const claims = (instance.getActiveAccount() ?? accounts[0])?.idTokenClaims;
  const preview = isE2EAuthBypassEnabled && ['localhost', '127.0.0.1'].includes(location.hostname);
  return import.meta.env.VITE_ALLY_REPORTS_ENABLED === 'true' && (preview || agentChatConfigured && claims?.tid === 'd72d9036-cff8-4f5f-a6fa-d698f621d420' && reportParticipants().some(v => v.id === claims?.oid));
}
