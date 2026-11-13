// /listings.json (Phase 2 plan task 2.1; decision 0033; web/README.md contract in
// the private repo). Built only when the settings' accounts.url is set, so the
// file and the sensitive-listing note go live in the same build.
// The CORS and Referrer-Policy headers it needs come from the deploy, not from
// this site (the upload check refuses a _headers file from the build): see
// the STATUS.md entry for plan task 2.1.
import type { APIRoute } from "astro";
import { siteData } from "../lib/site.ts";
import { accountsUrl, listingsFile } from "../lib/accounts.ts";

export function getStaticPaths() {
  return accountsUrl(siteData().settings) ? [{ params: { file: "listings" } }] : [];
}

export const GET: APIRoute = () => {
  const { listings, opportunities, generatedAt } = siteData();
  const body = listingsFile({ generated_at: generatedAt }, listings, opportunities);
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
};
