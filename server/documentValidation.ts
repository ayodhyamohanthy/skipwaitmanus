import sharp from "sharp";
import { inflateRawSync } from "node:zlib";

const MAX_PRIVATE_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const allowedDocuments = {
  ".pdf": { mimeType: "application/pdf", signature: (b: Buffer) => b.subarray(0,5).toString("ascii") === "%PDF-" },
  ".docx": { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", signature: (b: Buffer) => b.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04])) },
  ".png": { mimeType: "image/png", signature: (b: Buffer) => b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) },
  ".jpg": { mimeType: "image/jpeg", signature: (b: Buffer) => b.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])) },
  ".jpeg": { mimeType: "image/jpeg", signature: (b: Buffer) => b.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff])) },
} as const;
export const acceptedPrivateDocumentTypes = [...Object.values(allowedDocuments).map(x=>x.mimeType), "application/msword"];

function definition(input:{fileName:string;mimeType:string;buffer:Buffer}){
 const fileName=input.fileName.trim(),rawExtension=fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
 if(rawExtension===".doc"||input.mimeType==="application/msword")throw new Error("Legacy Word .doc files are not accepted. Save as PDF or DOCX first");
 const d=allowedDocuments[rawExtension as keyof typeof allowedDocuments];if(!d)throw new Error("Use a PDF, DOCX, PNG, or JPEG resume");
 if(input.mimeType!==d.mimeType)throw new Error("The file type does not match its extension");
 if(!input.buffer.length||input.buffer.length>MAX_PRIVATE_DOCUMENT_BYTES)throw new Error("Documents must be smaller than 10 MB");
 if(!d.signature(input.buffer))throw new Error("The uploaded file does not match its declared document type");return{fileName,d};
}
export function validatePrivateDocument(input:{fileName:string;mimeType:string;buffer:Buffer}){const x=definition(input);return{fileName:x.fileName,mimeType:x.d.mimeType,fileSize:input.buffer.length};}

function zipEntries(buffer:Buffer){const entries:Array<{name:string,data:Buffer}>=[];let p=0,total=0;while(p+30<=buffer.length&&buffer.readUInt32LE(p)===0x04034b50){const flags=buffer.readUInt16LE(p+6),method=buffer.readUInt16LE(p+8),compressed=buffer.readUInt32LE(p+18),uncompressed=buffer.readUInt32LE(p+22),nl=buffer.readUInt16LE(p+26),el=buffer.readUInt16LE(p+28);if(flags&1||flags&8)throw new Error("DOCX package uses unsupported encrypted or streamed entries");const name=buffer.subarray(p+30,p+30+nl).toString("utf8");const start=p+30+nl+el,end=start+compressed;if(end>buffer.length||uncompressed>20*1024*1024)throw new Error("DOCX package entry is invalid or too large");const raw=buffer.subarray(start,end),data=method===0?raw:method===8?inflateRawSync(raw):(()=>{throw new Error("DOCX package compression is unsupported")})();total+=data.length;if(total>40*1024*1024||entries.length>=2000)throw new Error("DOCX package exceeds safety limits");entries.push({name,data});p=end;}return entries;}
function validateDocx(buffer:Buffer){const entries=zipEntries(buffer),names=entries.map(x=>x.name.toLowerCase());if(!names.includes("[content_types].xml")||!names.some(x=>x==="word/document.xml"))throw new Error("DOCX package is incomplete");if(names.some(x=>/vbaproject|activex|embeddings|oleobject|\.exe$|\.dll$|\.js$|\.vbs$/.test(x)))throw new Error("DOCX macros, executables, or embedded objects are not accepted");for(const e of entries.filter(x=>x.name.toLowerCase().endsWith(".rels"))){const t=e.data.toString("utf8");if(/TargetMode\s*=\s*["']External["']/i.test(t))throw new Error("DOCX external relationships are not accepted");}return buffer;}
function validatePdf(buffer:Buffer){const t=buffer.toString("latin1");if(/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/i.test(t))throw new Error("PDF active content or embedded files are not accepted");return buffer;}
export async function sanitizePrivateDocument(input:{fileName:string;mimeType:string;buffer:Buffer}){const v=validatePrivateDocument(input);let buffer=input.buffer;if(v.mimeType==="image/png"||v.mimeType==="image/jpeg"){const image=sharp(buffer,{limitInputPixels:MAX_IMAGE_PIXELS,failOn:"error"}),meta=await image.metadata();if(!meta.width||!meta.height||meta.width*meta.height>MAX_IMAGE_PIXELS)throw new Error("Image dimensions exceed safety limits");buffer=v.mimeType==="image/png"?await image.rotate().png({compressionLevel:9}).toBuffer():await image.rotate().jpeg({quality:90,mozjpeg:true}).toBuffer();}else if(v.mimeType==="application/pdf")buffer=validatePdf(buffer);else buffer=validateDocx(buffer);return{...v,fileSize:buffer.length,buffer,validatorVersion:"builtin-v1",result:"validated_and_sanitized"};}
