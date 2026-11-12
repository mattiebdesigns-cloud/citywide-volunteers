// Public links shown on the site (owner, 2026-11-10 and 2026-11-12), from
// src/data/links.json: the code repository and the Instagram account.
// Checked here so a typo never puts a broken or odd address on every page.
import data from "../data/links.json" with { type: "json" };

export interface SiteLinks {
  code_url: string;
  instagram: { url: string; handle: string } | null;
}

const HTTPS = /^https:\/\/[^\s"<>]+$/;

export function siteLinks(file: unknown = data): SiteLinks {
  const f = file as Partial<SiteLinks>;
  const problems: string[] = [];
  if (!HTTPS.test(String(f?.code_url))) problems.push('"code_url" must be an https:// address');
  if (f?.instagram != null) {
    if (!/^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]+\/$/.test(String(f.instagram.url))) problems.push('"instagram.url" must be an https://www.instagram.com/<name>/ address');
    if (!/^@[A-Za-z0-9._]+$/.test(String(f.instagram.handle))) problems.push('"instagram.handle" must look like @name');
  }
  if (problems.length) throw new Error(`src/data/links.json cannot be used:\n  - ${problems.join("\n  - ")}`);
  return { code_url: f.code_url!, instagram: f.instagram ?? null };
}
