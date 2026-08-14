export const TARGET_ROLE_URL_ERROR = "Paste a complete job link that starts with http:// or https://.";

export function isValidTargetRoleUrl(value: string | undefined | null) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}
