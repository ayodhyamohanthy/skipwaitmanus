import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, loadConfigFromFile } from "vite";

const hash = value => createHash("sha256").update(value).digest("hex");

// A synthetic bundle only. Never edit the on-disk registry or production
// output: the shipped app must still expose English alone (D-350).
export async function buildLanguageFixture(candidateRoot) {
  const root = await realpath(candidateRoot);
  const registry = join(root, "shared/languages.ts");
  const original = await readFile(registry, "utf8");
  const before = '{ code: "hi", endonym: "हिन्दी", script: "Deva", dir: "ltr", reviewed: false }';
  const after = '{ code: "hi", endonym: "हिन्दी — विस्तारित भाषा नाम", script: "Deva", dir: "ltr", reviewed: true }';
  assert.equal(original.split(before).length, 2, "fixture must target exactly the existing unreviewed Hindi entry");
  const directory = await mkdtemp(join(tmpdir(), "skipwait-language-fixture-"));
  try {
    const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, resolve(root, "vite.config.ts"), root);
    assert.ok(loaded, "load the project's actual production Vite config");
    // This old plugin writes a fixed dist/public/sw.js path. Excluding it
    // keeps the fixture build from touching the real production output.
    const plugins = (loaded.config.plugins ?? []).flat(Infinity).filter(plugin => plugin?.name !== "skipwait-sw-build-stamp");
    let transformed = 0;
    await build({
      ...loaded.config,
      configFile: false,
      mode: "production",
      logLevel: "warn",
      plugins: [{
        name: "d093-menu-test-only-two-language-fixture",
        enforce: "pre",
        transform(code, id) {
          if (id.split("?")[0] !== registry) return;
          assert.ok(code.includes(before));
          transformed++;
          return { code: code.replace(before, after), map: null };
        },
      }, ...plugins],
      build: { ...loaded.config.build, outDir: directory, emptyOutDir: true },
    });
    assert.equal(transformed, 1, "the synthetic registry must actually enter the test bundle");
    assert.equal(await readFile(registry, "utf8"), original, "production language visibility must not change");
    return {
      directory,
      identity: {
        fixtureOnly: true,
        sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
        productionRegistrySha256: hash(original),
        syntheticRegistrySha256: hash(original.replace(before, after)),
        languages: ["en", "hi"],
        expandedEndonym: "हिन्दी — विस्तारित भाषा नाम",
        productionRegistryUnchanged: true,
      },
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
