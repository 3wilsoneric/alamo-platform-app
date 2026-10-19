import { useAgentBranding } from "../useAgentBranding";

export function EveryAgentOrb() {
  const branding = useAgentBranding();
  return <span className={`everyagent-orb everyagent-orb--${branding.variant}`} aria-hidden="true"><img src={branding.mark} alt="" draggable={false} /></span>;
}
