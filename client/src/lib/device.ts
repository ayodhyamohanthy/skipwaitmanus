export type DeviceLocaleSource={languages?:readonly string[];language?:string};
export const CONTENT_LANGUAGE="en";
let deviceLocale=CONTENT_LANGUAGE;
function canonicalLocale(value:unknown){if(typeof value!=="string")return;const candidate=value.trim();if(!candidate)return;try{return Intl.getCanonicalLocales(candidate)[0]}catch{return}}
/** Device preference for Intl date/number formatting. It does not describe UI copy. */
export function resolveDeviceLocale(source?:DeviceLocaleSource):string{
 for(const value of source?.languages??[]){const locale=canonicalLocale(value);if(locale)return locale}
 return canonicalLocale(source?.language)||CONTENT_LANGUAGE;
}
export function initializeDevicePreferences(source:DeviceLocaleSource|undefined,root:Pick<HTMLElement,"lang">){deviceLocale=resolveDeviceLocale(source);root.lang=CONTENT_LANGUAGE;return{deviceLocale,contentLanguage:CONTENT_LANGUAGE}}
export const getDeviceLocale=()=>deviceLocale;
