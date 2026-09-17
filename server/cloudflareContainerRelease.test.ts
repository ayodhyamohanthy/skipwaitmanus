import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const script = readFileSync("scripts/verify-cloudflare-container-release.sh", "utf8");
function fixture(instance: object, responses: string[]) {
  const dir=mkdtempSync(join(tmpdir(),"cf-release-")); let curl=0;
  writeFileSync(join(dir,"npx"),`#!/bin/sh\ncase "$*" in *"containers list"*) echo '[{"name":"skipwaitmanus-api","id":"app"}]';; *"containers info"*) echo '{"current_version":2,"configuration":{"image":"new-image"}}';; *"containers instances"*) echo '${JSON.stringify([instance])}';; esac\n`); chmodSync(join(dir,"npx"),0o755);
  writeFileSync(join(dir,"sleep"),"#!/bin/sh\nexit 0\n");chmodSync(join(dir,"sleep"),0o755);
  writeFileSync(join(dir,"curl"),`#!/bin/bash
n=${join(dir,"count")}; i=$(cat "$n" 2>/dev/null || echo 0); i=$((i+1)); echo $i > "$n"; case $i in ${responses.map((r,i)=>{const parts=r.split("\n");const status=parts.pop();const body=parts.join("\n");const type=body.startsWith("{")?"application/json":"text/html";return `${i+1}) payload='${body.replaceAll("'","'\\''")}';status='${status}';type='${type}';;`}).join(' ')} *) exit 2;; esac
while (( $# )); do case "$1" in -D) headers=$2;shift 2;; -o) output=$2;shift 2;; *) shift;; esac;done
printf 'HTTP/2 %s\ncontent-type: %s\n' "$status" "$type" > "$headers";printf '%s' "$payload" > "$output"
`);chmodSync(join(dir,"curl"),0o755);
  return spawnSync("bash",["scripts/verify-cloudflare-container-release.sh"],{encoding:"utf8",env:{...process.env,PATH:`${dir}:${process.env.PATH}`,EXPECTED_SHA:"a".repeat(40),CLOUDFLARE_API_TOKEN:"x",CLOUDFLARE_ACCOUNT_ID:"x",BEFORE_VERSION:"1",BEFORE_IMAGE:"old-image",READY_INTERVAL_SECONDS:"1",READY_TIMEOUT_SECONDS:"2",RELEASE_CONVERGENCE_TIMEOUT_SECONDS:"1",RELEASE_CONVERGENCE_INTERVAL_SECONDS:"0"}});
}
const ready=JSON.stringify({service:"skipwait-api",commitSha:"a".repeat(40),state:"ready"})+"\n200";
describe("Cloudflare container acceptance",()=>{
 it("uses a bounded wake-and-control-plane convergence poll",()=>{expect(script).toContain("RELEASE_CONVERGENCE_TIMEOUT_SECONDS");expect(script).toContain("curl -fsS --max-time 20");expect(script).toContain("state==\"running\"")});
 it("passes a running numeric-version release",()=>expect(fixture({name:"skipwaitmanus-api-aaaaaaaaaaaa",state:"running",version:2},[ready]).status).toBe(0));
 it("fails inactive/null even when the public endpoint reports the exact SHA",()=>{const r=fixture({name:"skipwaitmanus-api-aaaaaaaaaaaa",state:"inactive",version:null},[ready]);expect(r.status).not.toBe(0);expect(r.stdout).toContain("did not converge to running");});
 it("fails a running release whose version is not current",()=>expect(fixture({name:"skipwaitmanus-api-aaaaaaaaaaaa",state:"running",version:1},[ready]).status).not.toBe(0));
 it("fails null/inactive with a stale SHA",()=>expect(fixture({name:"skipwaitmanus-api-aaaaaaaaaaaa",state:"inactive",version:null},[JSON.stringify({service:"skipwait-api",commitSha:"b".repeat(40),state:"ready"})+"\n200"]).status).not.toBe(0));
 it("fails an HTML soft-200",()=>expect(fixture({name:"skipwaitmanus-api-aaaaaaaaaaaa",state:"running",version:2},["<html>ok</html>\n200","<html>ok</html>\n200"]).status).not.toBe(0));
});
