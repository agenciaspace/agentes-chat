import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { accessAuthorized, accessDenied } from "../src/access.ts";

const settings = { ACCESS_TEAM_DOMAIN: "https://office.cloudflareaccess.com", ACCESS_AUD: "legalops-staging" };
const { privateKey, publicKey } = await generateKeyPair("RS256");
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "test", alg: "RS256" }] });
async function token(overrides: { aud?: string; iss?: string; exp?: number; noExpiry?: boolean } = {}) {
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuedAt()
    .setAudience(overrides.aud ?? settings.ACCESS_AUD)
    .setIssuer(overrides.iss ?? settings.ACCESS_TEAM_DOMAIN);
  if (!overrides.noExpiry) jwt = jwt.setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 60);
  return jwt.sign(privateKey);
}
const request = (value?: string) =>
  new Request("https://legalops.example/", {
    headers: value ? { "cf-access-jwt-assertion": value } : {},
  });

test("only a signed, unexpired token for this office and application is accepted", async () => {
  assert.equal(await accessAuthorized(request(await token()), settings, keys), true);
});
test("a forged Access header is rejected", async () => {
  const forged = (await token()).split(".");
  forged[1] = Buffer.from(
    JSON.stringify({ iss: settings.ACCESS_TEAM_DOMAIN, aud: settings.ACCESS_AUD, exp: 9999999999, iat: 1 }),
  ).toString("base64url");
  assert.equal(await accessAuthorized(request(forged.join(".")), settings, keys), false);
});
test("another application, another office, an expired token, and a missing expiry are rejected", async () => {
  for (const claims of [
    { aud: "other" },
    { iss: "https://other.cloudflareaccess.com" },
    { exp: 1 },
    { noExpiry: true },
  ]) {
    assert.equal(await accessAuthorized(request(await token(claims)), settings, keys), false);
  }
});
test("missing or malformed authentication fails closed", async () => {
  for (const value of [undefined, "invented", "a".repeat(17_000)]) {
    assert.equal(await accessAuthorized(request(value), settings, keys), false);
  }
  assert.equal(accessDenied().status, 403);
  assert.equal(accessDenied().headers.get("cache-control"), "private, no-store");
});
test("unconfigured Access and untrusted key hosts fail closed", async () => {
  for (const ACCESS_TEAM_DOMAIN of [
    "",
    "http://office.cloudflareaccess.com",
    "https://attacker.example",
    "https://office.cloudflareaccess.com.evil.example",
    "https://office.cloudflareaccess.com/path",
  ]) {
    assert.equal(await accessAuthorized(request(await token()), { ...settings, ACCESS_TEAM_DOMAIN }, keys), false);
  }
  assert.equal(await accessAuthorized(request(await token()), { ...settings, ACCESS_AUD: "" }, keys), false);
});
test("key discovery failure never grants access", async () => {
  const unavailable = async () => {
    throw new Error("unavailable");
  };
  assert.equal(await accessAuthorized(request(await token()), settings, unavailable), false);
});
