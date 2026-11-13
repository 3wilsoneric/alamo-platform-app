const MAX_DETAIL_LENGTH = 8_000;

export function formatLicensingProcessError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const output = typeof error?.stdout === "string" ? error.stdout : "";
  const failureLines = output.split(/\r?\n/)
    .filter((line) => /FAILED:|curl: \(\d+\)|timed out/i.test(line))
    .slice(-8);
  const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
  const details = [message, ...failureLines];
  if (stderr && !message.includes(stderr)) details.push(stderr);
  const result = details.join("\n");
  return result.length > MAX_DETAIL_LENGTH ? result.slice(-MAX_DETAIL_LENGTH) : result;
}
