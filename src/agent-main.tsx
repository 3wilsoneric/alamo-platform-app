import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PublicClientApplication } from "@azure/msal-browser";
import { EVERYAGENT_TENANT, hasEveryAgentAccess } from "../shared/everyagent-identity.mjs";
import AgentConversationHome from "./features/agent/conversations/AgentConversationHome";
import { agentApiScope, createAgentTransport, localAgentPreview } from "./features/agent/conversations/agentTransport";
import "./agentStyles.css";

const instance = new PublicClientApplication({ auth: {
  clientId: import.meta.env.VITE_ALAMOAGENT_CLIENT_ID || "00000000-0000-0000-0000-000000000000",
  authority: `https://login.microsoftonline.com/${EVERYAGENT_TENANT}`, redirectUri: window.location.origin,
  postLogoutRedirectUri: window.location.origin, navigateToLoginRequestUrl: false
}, cache: { cacheLocation: "sessionStorage" } });

function DirectHome() {
  const [account, setAccount] = useState(instance.getActiveAccount() ?? instance.getAllAccounts()[0]);
  const [id, setId] = useState(new URLSearchParams(window.location.search).get("chat"));
  const [error, setError] = useState(false);
  const transport = useMemo(() => createAgentTransport(instance), [account?.homeAccountId]);
  useEffect(() => {
    const pop = () => setId(new URLSearchParams(window.location.search).get("chat"));
    window.addEventListener("popstate", pop); return () => window.removeEventListener("popstate", pop);
  }, []);
  if (!localAgentPreview && !account) return <main className="agent-sign-in"><button type="button" onClick={() => {
    if (!agentApiScope || !import.meta.env.VITE_ALAMOAGENT_CLIENT_ID) { setError(true); return; }
    void instance.loginPopup({ scopes: [agentApiScope] }).then(result => { instance.setActiveAccount(result.account); setAccount(result.account ?? undefined); }).catch(() => setError(true));
  }}>Sign in</button>{error && <p role="alert">Sign-in could not be completed. Check the agent registration and try again.</p>}</main>;
  if (!localAgentPreview && !hasEveryAgentAccess(account?.idTokenClaims)) return <main className="agent-sign-in"><p>This sign-in does not have agent access.</p></main>;
  return <AgentConversationHome key={`${account?.homeAccountId ?? "local"}:${id}`} transport={transport} conversationId={id} onNavigate={next => {
    window.history.pushState(null, "", `${window.location.pathname}${next ? `?chat=${encodeURIComponent(next)}` : ""}`); setId(next);
  }} />;
}

async function start() {
  await instance.initialize();
  const redirect = await instance.handleRedirectPromise();
  if (redirect?.account) instance.setActiveAccount(redirect.account);
  createRoot(document.getElementById("root")!).render(<DirectHome />);
}
void start().catch(() => createRoot(document.getElementById("root")!).render(<p role="alert">Agent sign-in could not start.</p>));
