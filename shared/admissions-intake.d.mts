export type IntakeStage = 'new' | 'assessment' | 'decision' | 'arrival';
export type IntakeCard = { status: string; column: string; community?: string | null; facilityId?: string | null; plannedAdmissionDate?: string | null };
export const INTAKE_STAGES: ReadonlyArray<Readonly<{ key: IntakeStage; label: string }>>;
export function isAcceptedReferral(status: string): boolean;
export function activeIntakeCards<T extends IntakeCard>(pipeline: { board: { cards: T[] } }): T[];
export function intakeStage(card: IntakeCard): IntakeStage;
export function hasCompleteIntakeBoard(pipeline: { board: { cards: IntakeCard[]; total: number; truncated: boolean }; metrics: { activeReferrals: number } }): boolean;
