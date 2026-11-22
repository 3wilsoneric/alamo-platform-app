// The Admissions page and aggregate consumers share one active population and
// one mutually exclusive stage classification. Board columns alone overlap
// decisions under review with accepted clients awaiting move-in.
export const INTAKE_STAGES = Object.freeze([
  Object.freeze({ key: 'new', label: 'Just referred' }),
  Object.freeze({ key: 'assessment', label: 'Being assessed' }),
  Object.freeze({ key: 'decision', label: 'Under review' }),
  Object.freeze({ key: 'arrival', label: 'Accepted, awaiting move-in' })
]);
export function isAcceptedReferral(status) {
  const normalized = status.trim().toLowerCase();
  return normalized.startsWith('accept') || normalized === 'awaiting admit' || normalized === 'meet the client not sent';
}
export function activeIntakeCards(pipeline) {
  return pipeline.board.cards.filter(card => !/^(declined|denied)$/i.test(card.status.trim()) && !card.status.trim().toLowerCase().startsWith('admitted') && card.status.trim().toLowerCase() !== 'did not move in');
}
export function intakeStage(card) {
  return isAcceptedReferral(card.status) ? 'arrival' : card.column === 'received' ? 'new' : card.column === 'in_progress' ? 'assessment' : 'decision';
}
export function hasCompleteIntakeBoard(pipeline) {
  return !pipeline.board.truncated && pipeline.board.cards.length === pipeline.board.total && activeIntakeCards(pipeline).length === pipeline.metrics.activeReferrals;
}
