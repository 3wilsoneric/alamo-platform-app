import { app } from "@azure/functions";
import * as df from "durable-functions";
import { everyAgentMonitorV1 } from "./everyagent-orchestrator.mjs";
import { createEveryAgentWorkflowService } from "./everyagent-workflow-service.mjs";

// No public HTTP starter, source payload endpoint, or management key is exposed
// through the web app. The timer claims only server-authorized assignments.
export function registerEveryAgentFunctions({ service = createEveryAgentWorkflowService(), schedule = "0 * * * * *" } = {}) {
  df.app.orchestration("agentMonitorV1", everyAgentMonitorV1);
  df.app.activity("agentCollectV1", { handler: id => service.collect(id) });
  df.app.activity("agentValidateV1", { handler: ({ id, source }) => service.validate(id, source) });
  df.app.activity("agentPublishV1", { handler: ({ id, result }) => service.publish(id, result) });
  df.app.activity("agentFailV1", { handler: id => service.fail(id) });
  app.timer("agentScheduleV1", {
    schedule, runOnStartup: false, useMonitor: true, extraInputs: [df.input.durableClient()],
    handler: async (_timer, context) => {
      if (process.env.EVERYAGENT_WORKER_ENABLED !== "true" || process.env.EVERYAGENT_WORKER_MODE !== "durable") return;
      const client = df.getClient(context);
      for (const task of await service.prepare()) {
        const status = await client.getStatus(task.id).catch(error => {
          // durable-functions 3.6 reports a missing instance as a plain Error,
          // without a statusCode field. Only its exact 404 contract means new.
          if (error instanceof Error && error.message.startsWith("DurableClient error: Durable Functions extension replied with HTTP 404 response.")) return null;
          throw error;
        });
        if (!status) await client.startNew("agentMonitorV1", { instanceId: task.id, input: null });
        else if (["Failed", "Terminated", "Canceled", "Completed"].includes(status.runtimeStatus)) {
          // A successful publish is already terminal in the store. A terminal
          // engine with an active projection is a visible failure, never a reset.
          await service.fail(task.id);
        }
      }
    }
  });
}
