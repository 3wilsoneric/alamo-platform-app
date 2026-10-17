import { RetryOptions } from "durable-functions";

// Keep v1 registered for in-flight history when a later workflow is introduced.
// All I/O and permission checks live in activities, never in replayed code.
/** @type {import("durable-functions").OrchestrationHandler} */
export const everyAgentMonitorV1 = function* (context) {
  const id = context.df.instanceId;
  const retry = new RetryOptions(5000, 3);
  retry.backoffCoefficient = 2;
  retry.maxRetryIntervalInMilliseconds = 20_000;
  try {
    context.df.setCustomStatus({ phase: "collect" });
    const source = yield context.df.callActivityWithRetry("agentCollectV1", retry, id);
    context.df.setCustomStatus({ phase: "validate" });
    const result = yield context.df.callActivityWithRetry("agentValidateV1", retry, { id, source });
    context.df.setCustomStatus({ phase: "publish" });
    const outcome = yield context.df.callActivityWithRetry("agentPublishV1", retry, { id, result });
    context.df.setCustomStatus({ phase: outcome.status });
    return outcome;
  } catch {
    context.df.setCustomStatus({ phase: "failed" });
    return yield context.df.callActivityWithRetry("agentFailV1", retry, id);
  }
};
