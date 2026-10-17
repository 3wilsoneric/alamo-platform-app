import { useMemo } from "react";
import { useMsal } from "@azure/msal-react";
import { Link, useSearchParams } from "react-router-dom";
import AgentConversationHome from "./AgentConversationHome";
import { createAgentTransport } from "./agentTransport";

export default function EmbeddedAgentChats() {
  const { instance, accounts } = useMsal();
  const [params, setParams] = useSearchParams();
  const accountId = (instance.getActiveAccount() ?? accounts[0])?.homeAccountId;
  const transport = useMemo(() => createAgentTransport(instance), [instance, accountId]);
  const id = params.get("chat");
  return <><Link to="/analytics/agent" className="block px-6 py-3 text-sm text-[#08745f]">← Monitoring</Link>
    <AgentConversationHome key={`${accountId ?? "local"}:${id}`} transport={transport} conversationId={id === "home" ? null : id}
      onNavigate={next => setParams({ chat: next ?? "home" })} /></>;
}
