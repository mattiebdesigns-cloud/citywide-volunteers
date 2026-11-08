// One private folder per test build, so test builds never share files
// (PROJECT.md 13). Astro keeps its scratch files inside the output folder
// only when that folder is inside site/; an output folder elsewhere (such as
// the system temp folder) makes every build share site/.astro/.prerender, and
// two builds at once then break each other. Each build also gets its own
// Vite cache (PV_CACHE_DIR, read by astro.config.mjs).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const site = fileURLToPath(new URL("..", import.meta.url));
const root = join(site, ".test-builds");

/** A new empty folder under site/.test-builds/ (ignored by git). */
export function buildFolder(): string {
  mkdirSync(root, { recursive: true });
  return mkdtempSync(join(root, "b-"));
}

/** Builds the site into <dir>/dist with its own cache; returns the dist path. */
export function astroBuild(dir: string, env: Record<string, string | undefined>): string {
  const out = join(dir, "dist");
  const clean = { ...process.env };
  for (const k of ["PV_SITE_URL", "PV_TEST_BUILD", "PV_OPPORTUNITIES", "PV_EVENTS", "PV_SETTINGS"]) delete clean[k];
  execFileSync(join(site, "node_modules/.bin/astro"), ["build", "--outDir", out, "--silent"], {
    cwd: site,
    env: { ...clean, ASTRO_TELEMETRY_DISABLED: "1", PV_CACHE_DIR: join(dir, "cache"), ...env },
    stdio: "pipe",
  });
  return out;
}

export function removeFolder(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
