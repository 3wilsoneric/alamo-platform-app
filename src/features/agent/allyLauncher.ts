export const OPEN_ALLY_EVENT = "platform:open-ally";

export function openAlly() {
  window.dispatchEvent(new Event(OPEN_ALLY_EVENT));
}
