import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { EveryAgentCommand, EveryAgentOverview } from "../../../shared/everyagent-contracts.mjs";
import { readEveryAgent, updateEveryAgent } from "./everyAgentApi";

interface AgentState {
  data: EveryAgentOverview | null;
  error: string | null;
  busy: boolean;
  refresh: () => void;
  command: (input: EveryAgentCommand) => Promise<void>;
}
const EveryAgentContext = createContext<AgentState | null>(null);

export function EveryAgentProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<EveryAgentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const mutating = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; ++generation.current; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (mutating.current || document.visibilityState === "hidden") return;
      const requested = ++generation.current;
      void readEveryAgent(controller.signal).then(result => {
        if (!controller.signal.aborted && requested === generation.current) { setData(result); setError(null); }
      }).catch(() => {
        if (!controller.signal.aborted && requested === generation.current) setError("I couldn’t refresh your work. The last results may be out of date.");
      });
    };
    refresh();
    const timer = globalThis.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); globalThis.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [attempt]);
  async function command(input: EveryAgentCommand) {
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true); ++generation.current;
    try {
      const result = await updateEveryAgent(input);
      if (mounted.current) { ++generation.current; setData(result); setError(null); }
    } catch {
      if (mounted.current) setError("I couldn’t save that change. Refresh and try again.");
      throw new Error("Change not saved.");
    } finally {
      mutating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return <EveryAgentContext.Provider value={{ data, error, busy, command, refresh: () => setAttempt(value => value + 1) }}>{children}</EveryAgentContext.Provider>;
}

export function useEveryAgent() {
  const state = useContext(EveryAgentContext);
  if (!state) throw new Error("EveryAgent requires its authenticated provider.");
  return state;
}

export function agentStatus(data: EveryAgentOverview | null, error: string | null) {
  if (error) return "Connection interrupted";
  if (!data) return "Getting your briefing";
  if (!data.workerEnabled) return "Monitoring offline";
  if (data.working) return "Checking sources";
  if (data.responsibilities.length && data.responsibilities.every(item => item.paused)) return "Monitoring paused";
  if (data.responsibilities.some(item => !item.paused && item.issue)) return "A source needs attention";
  return "Keeping watch";
}
