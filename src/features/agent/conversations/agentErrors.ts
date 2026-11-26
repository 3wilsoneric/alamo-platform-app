// Self-contained (no runtime imports) so node --test can load it directly.

/** unavailable: retry later (5xx, 408/429, network, timeout). access: the
 * account cannot see this (401/403/404); callers must drop cached content.
 * signin: no usable token. rejected: the request itself was refused. */
export type AgentErrorKind = 'unavailable' | 'access' | 'signin' | 'rejected';

export class AgentRequestError extends Error {
  readonly kind: AgentErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  constructor(message: string, kind: AgentErrorKind, status: number | null = null, code: string | null = null) {
    super(message);
    this.name = 'AgentRequestError';
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

export const AGENT_UNAVAILABLE_MESSAGE = 'Ally is temporarily unavailable. Your saved work is safe. Try again in a moment.';
export const AGENT_ACCESS_MESSAGE = 'Chat access could not be verified. Connect or refresh to try again.';
export const AGENT_SIGNIN_MESSAGE = 'Connect your agent sign-in to continue.';

const CODE_MESSAGES: Record<string, string> = {
  conversation_source_temporarily_unavailable: 'The source is temporarily unavailable. Refresh to reopen your saved chat.',
  conversation_source_unavailable: 'This chat’s guidance changed or access was removed. Start a new chat to read the current guide.',
  conversation_changed: 'This chat changed. Refresh before sending again.',
  conversation_capacity: 'The chat limit has been reached. Your existing conversations are saved.',
  conversation_budget: 'The daily chat limit has been reached. Saved work is still available.',
  conversation_concurrency: 'Two answers are already running. Wait or stop one before continuing.',
  conversation_model_unavailable: 'Chat answers are not configured yet. Saved work remains available.',
  report_changed: 'This report changed. Refresh it before trying again.',
  report_not_found: 'This report is not available to your account.',
  report_request_invalid: 'Check the question and date range.',
  report_budget: 'The daily investigation limit has been reached. Saved reports remain available.'
};

/** Maps a non-OK HTTP response to an accurate, user-facing error. A known
 * service code keeps its specific wording; the status decides the kind. */
export function agentHttpError(status: number, code?: string | null): AgentRequestError {
  const known = code ? CODE_MESSAGES[code] : undefined;
  const transient = status >= 500 || status === 408 || status === 429;
  const access = status === 401 || status === 403 || status === 404;
  const kind: AgentErrorKind = transient ? 'unavailable' : access ? 'access' : 'rejected';
  const fallback = transient ? AGENT_UNAVAILABLE_MESSAGE : access ? AGENT_ACCESS_MESSAGE : 'Ally could not complete this request. Refresh and try again.';
  return new AgentRequestError(known ?? fallback, kind, status, code ?? null);
}

/** fetch() rejected without a response: offline, DNS, CORS, reset or timeout. */
export function agentNetworkError(): AgentRequestError {
  return new AgentRequestError(AGENT_UNAVAILABLE_MESSAGE, 'unavailable');
}

export const isTransientAgentError = (error: unknown): error is AgentRequestError =>
  error instanceof AgentRequestError && error.kind === 'unavailable';
