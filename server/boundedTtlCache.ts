export class BoundedTtlCache<K,V>{
  private entries=new Map<K,{value:V;expires:number}>();
  private readonly now:()=>number;
  constructor(private readonly maxEntries:number,now?:()=>number){this.now=now??(()=>Date.now())}
  private prune(){const now=this.now();this.entries.forEach((entry,key)=>{if(entry.expires<=now)this.entries.delete(key)});}
  get(key:K){this.prune();const entry=this.entries.get(key);if(!entry)return undefined;this.entries.delete(key);this.entries.set(key,entry);return entry.value;}
  set(key:K,value:V,ttlMs:number){this.prune();this.entries.delete(key);this.entries.set(key,{value,expires:this.now()+ttlMs});while(this.entries.size>this.maxEntries)this.entries.delete(this.entries.keys().next().value!);}
  has(key:K){return this.get(key)!==undefined}
  delete(key:K){this.entries.delete(key)}
  clear(){this.entries.clear()}
  get size(){this.prune();return this.entries.size}
}
