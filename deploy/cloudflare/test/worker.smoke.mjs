import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" }] };
const team = "https://office.cloudflareaccess.com";
const token = await new SignJWT({})
  .setProtectedHeader({ alg: "RS256", kid: "test" })
  .setIssuer(team)
  .setAudience("legalops")
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(privateKey);
const script = await readFile(
  new URL("../.cloudflare/output/v0/workers/default/bundle/index.js", import.meta.url),
  "utf8",
);
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script,
    compatibilityDate: "2026-11-11",
    cf: false,
    durableObjects: { APP: { className: "LegalopsApp", useSQLite: true } },
    bindings: { ACCESS_TEAM_DOMAIN: team, ACCESS_AUD: "legalops", PUBLIC_URL: "https://legalops.example" },
    outboundService: async (request) => {
      assert.equal(request.url, `${team}/cdn-cgi/access/certs`);
      return new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } });
    },
  }),
);
try {
  for (const header of [undefined, "forged"]) {
    const response = await mf.dispatchFetch("https://legalops.example/api/health", {
      headers: header ? { "cf-access-jwt-assertion": header } : {},
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const headers = { "cf-access-jwt-assertion": token };
  const wrongHost = await mf.dispatchFetch("https://wrong.example/api/health", { headers });
  assert.equal(wrongHost.status, 421);
  const unavailable = await mf.dispatchFetch("https://legalops.example/api/health", { headers });
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.get("cache-control"), "private, no-store");
  console.log(
    "workerd: missing/forged token rejected, signed token verified, wrong host rejected, missing container fails privately",
  );
} finally {
  await mf.dispose();
}
