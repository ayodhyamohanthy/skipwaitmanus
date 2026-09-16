const DEFAULT_PUBLIC_ORIGIN="https://skipwait.me";
export function canonicalPublicOrigin(){
 const raw=(process.env.PUBLIC_ORIGIN||DEFAULT_PUBLIC_ORIGIN).trim();
 let url:URL;try{url=new URL(raw);}catch{throw new Error("PUBLIC_ORIGIN must be an absolute HTTPS origin");}
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash||url.pathname!=="/")throw new Error("PUBLIC_ORIGIN must be a bare HTTPS origin");
 return url.origin;
}
export function publicUrl(path:string){return new URL(path.startsWith("/")?path:`/${path}`,`${canonicalPublicOrigin()}/`).toString();}
