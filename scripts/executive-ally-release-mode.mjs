import assert from 'node:assert/strict';

// Release configuration, not API membership or a source grant. Keep the first
// real pilot owner-only; the separately authorized executive release is explicit.
export function executiveAllyReleaseMode(args) {
  assert(args.length <= 1 && args.every(arg => ['--enabled-preview', '--owner-pilot', '--executives'].includes(arg)),
    'Use no option, --enabled-preview, --owner-pilot, or --executives.');
  const preview = args[0] === '--enabled-preview', pilot = args[0] === '--owner-pilot';
  const executives = args[0] === '--executives';
  const enabled = preview || pilot || executives;
  const participants = preview ? [{ id: '11111111-1111-4111-8111-111111111111', name: 'Test executive' }]
    : executives ? [{ id: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', name: 'Eric Wilson' }, { id: 'e9f39185-d751-45c0-bcf5-c24d3565bdd9', name: 'Andrew Dominici' }, { id: '424b21d4-605a-43a6-8dff-2a89a846e698', name: 'Betty Dominici' }]
    : pilot ? [{ id: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', name: 'Eric Wilson' }] : [];
  const origin = preview ? 'https://ally.invalid'
    : pilot || executives ? 'https://alamo-ally-prod-api.wittysmoke-69c99f62.westus2.azurecontainerapps.io' : '';
  const scope = preview ? 'api://22222222-2222-4222-8222-222222222222/access_as_user'
    : pilot || executives ? 'api://c71237ad-51a0-4f97-a137-72cb9a532583/access_as_user' : '';
  return { preview, pilot, executives, enabled, participants,
    suffix: preview ? '-preview' : executives ? '-executives' : pilot ? '-pilot' : '',
    imageKind: preview ? 'preview' : executives ? 'executives' : pilot ? 'pilot' : 'disabled',
    display: { enabled: String(enabled), participants: JSON.stringify(participants), origin, scope } };
}
