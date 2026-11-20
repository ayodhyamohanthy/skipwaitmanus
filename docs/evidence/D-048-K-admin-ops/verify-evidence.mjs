import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url));
const json = name => JSON.parse(read(name).toString('utf8'));
const expectedWebSha = '053e8a72f859d8226d247ae35cf9eec0a2ad1a4d';
const expectedApiSha = 'e285f13c25da90b69ca3df172cb15f27dbb9826c';
const receipt = json('receipt.json');
const manifest = json('manifest.json');
const identity = json('identity.json');
const release = json('release.json');
const sentry = json('sentry.json');
const routes = ['activity', 'flow-health', 'schema', 'partners', 'smoke'];

assert.equal(receipt.success, true);
assert.equal(receipt.expectedWebSha, expectedWebSha);
assert.equal(receipt.cases.length, 10);
assert.equal(new Set(receipt.cases.map(item => item.image)).size, 10);
assert.equal(manifest.images.length, 10);
for (const route of routes) {
  for (const width of [1280, 390]) {
    const item = receipt.cases.find(value => value.name === route && value.width === width);
    assert.ok(item, `${route} at ${width} is missing`);
    assert.equal(item.documentStatus, 200);
    assert.equal(item.metrics.sha, expectedWebSha);
    assert.equal(item.metrics.viewportWidth, width);
    assert.equal(item.metrics.viewportHeight, width === 390 ? 844 : 900);
    assert.equal(item.metrics.documentWidth, width);
    assert.equal(item.metrics.h1Count, 1);
    for (const key of ['errors', 'privateReads', 'blockedWrites']) assert.deepEqual(item[key], []);
    assert.deepEqual(item.statusResponses, route === 'smoke' ? [404] : []);
    for (const report of item.blockedSecurityReports) {
      assert.equal(report.path, '/api/csp-report');
      assert.equal(report.method, 'POST');
      assert.equal(report.disposition, 'report');
      assert.ok(['cloudflare-beacon', 'eval', 'sentry-ingest'].includes(report.source));
    }
    const png = read(item.image);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), width === 390 ? 780 : 1280);
    assert.equal(png.readUInt32BE(20), width === 390 ? 1688 : 900);
    assert.equal(item.pngWidth, png.readUInt32BE(16));
    const recorded = manifest.images.find(value => value.file === item.image);
    assert.ok(recorded);
    assert.equal(recorded.sha256, createHash('sha256').update(png).digest('hex'));
    assert.equal(recorded.nativeVisualInspection, 'readable; no signed-out clipping');
  }
}
assert.equal(identity.observedWebSha, expectedWebSha);
assert.equal(identity.expectedApiRuntimeSha, expectedApiSha);
assert.equal(identity.observedApiSha, expectedApiSha);
assert.equal(identity.apiState, 'ready');
assert.equal(identity.apiStatus, 200);
assert.equal(release.mergeSha, expectedWebSha);
assert.equal(release.testedHeadTreeEqualsMergeTree, true);
assert.equal(release.exactHeadCi.id, 44627342458);
assert.equal(release.exactHeadCi.head_sha, release.testedHead);
assert.equal(release.exactHeadCi.conclusion, 'success');
for (const run of release.postMergeRuns) {
  assert.equal(run.head_sha, expectedWebSha);
  assert.equal(run.status, 'completed');
  assert.equal(run.conclusion, 'success');
}
assert.deepEqual(sentry.map(item => item.route).sort(), routes.map(route => `/admin/${route}`).sort());
for (const result of sentry) {
  assert.equal(result.project, 'skipwait/skipwait-webapp');
  assert.equal(result.period, '24h');
  assert.deepEqual(result.data, []);
  assert.equal(result.hasMore, false);
}
assert.equal(json('verifier-repair.json').productionChanges, 'none; external verifier only');
console.log('PASS: 10 image hashes/dimensions/visual records; canonical web/API identity; 10 signed-out cases; release receipts; five scoped Sentry results.');
console.log('Scope: historical signed-out acceptance only. Local timeout, populated-mobile defects and rejected reporter delivery remain unresolved as recorded.');
