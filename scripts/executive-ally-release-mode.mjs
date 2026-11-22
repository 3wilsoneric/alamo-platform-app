import assert from 'node:assert/strict';

// Release configuration, not API membership or a source grant. Keep the first
// real pilot owner-only; expand it only after that deployed journey is accepted.
export function executiveAllyReleaseMode(args) {
  assert(args.length <= 1 && args.every(arg => ['--enabled-preview', '--owner-pilot'].includes(arg)),
    'Use no option, --enabled-preview, or --owner-pilot.');
  const preview = args[0] === '--enabled-preview', pilot = args[0] === '--owner-pilot';
  const enabled = preview || pilot;
  const participants = preview ? [{ id: '11111111-1111-4111-8111-111111111111', name: 'Test executive' }]
    : pilot ? [{ id: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', name: 'Eric Wilson' }] : [];
  const origin = preview ? 'https://ally.invalid'
    : pilot ? 'https://alamo-ally-prod-api.wittysmoke-69c99f62.westus2.azurecontainerapps.io' : '';
  const scope = preview ? 'api://22222222-2222-4222-8222-222222222222/access_as_user'
    : pilot ? 'api://c71237ad-51a0-4f97-a137-72cb9a532583/access_as_user' : '';
  return { preview, pilot, enabled, participants,
    suffix: preview ? '-preview' : pilot ? '-pilot' : '',
    imageKind: preview ? 'preview' : pilot ? 'pilot' : 'disabled',
    display: { enabled: String(enabled), participants: JSON.stringify(participants), origin, scope } };
}
