export type DeviceLocaleSource = {
  languages?: readonly string[];
  language?: string;
};

export function resolveDeviceLocale(source?: DeviceLocaleSource): string {
  return source?.languages?.find(Boolean) || source?.language || "en";
}
