import assert from "node:assert/strict";
import { test } from "node:test";
import { containerEnvironment, containerRequest, privateUnavailable } from "../src/runtime.ts";

const settings = {
  DATABASE_URL: "postgres://legalops:synthetic-password@db.example/legalops?sslmode=verify-full",
  PUBLIC_URL: "https://legalops.example",
  AGENTES_SECRET: "a".repeat(96),
};
test("production uses the persistent database and closes public signup", () => {
  const env = containerEnvironment(settings);
  assert.equal(env.DATABASE_URL, settings.DATABASE_URL);
  assert.equal(env.PUBLIC_URL, settings.PUBLIC_URL);
  assert.equal(env.ALLOW_SIGNUP, "false");
  assert.equal(env.NODE_ENV, "production");
  assert.equal(env.FILES_DIR, undefined);
  assert.equal(env.TELEMETRY, "off");
});
test("ephemeral and unencrypted databases cannot start the container", () => {
  for (const DATABASE_URL of [
    "file:/tmp/db",
    "postgres://user:pass@db/app",
    "postgres://db/app?sslmode=require",
    "postgres://user:pass@db/app?sslmode=disable",
  ]) {
    assert.throws(() => containerEnvironment({ ...settings, DATABASE_URL }));
  }
});
test("unsafe public origins and unstable application secrets are rejected", () => {
  for (const PUBLIC_URL of [
    "http://example.test",
    "https://user:pass@example.test",
    "https://example.test/path",
    "https://example.test?secret=1",
    "https://example.test#fragment",
  ]) {
    assert.throws(() => containerEnvironment({ ...settings, PUBLIC_URL }));
  }
  assert.throws(() => containerEnvironment({ ...settings, AGENTES_SECRET: "" }));
});
test("container failures return a private response without infrastructure credentials", async () => {
  const response = privateUnavailable();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("retry-after"), "8");
  assert.doesNotMatch(await response.text(), /postgres|password|stack|secret/i);
});

test("the private HTTP bridge preserves writes, cookies and origin while replacing spoofed proxy headers", async () => {
  const request = new Request("https://legalops.example/api/matters?draft=1", {
    method: "POST",
    body: JSON.stringify({ title: "Synthetic matter" }),
    headers: {
      "content-type": "application/json",
      cookie: "session=synthetic",
      origin: "https://legalops.example",
      "x-forwarded-proto": "http",
      "x-forwarded-host": "attacker.example",
      forwarded: "host=attacker.example",
      "cf-access-jwt-assertion": "synthetic-access-token",
    },
  });
  const upstream = containerRequest(request);
  assert.equal(upstream.url, "http://legalops.example/api/matters?draft=1");
  assert.equal(upstream.method, "POST");
  assert.deepEqual(await upstream.json(), { title: "Synthetic matter" });
  assert.equal(upstream.headers.get("cookie"), "session=synthetic");
  assert.equal(upstream.headers.get("origin"), "https://legalops.example");
  assert.equal(upstream.headers.get("host"), "legalops.example");
  assert.equal(upstream.headers.get("x-forwarded-host"), "legalops.example");
  assert.equal(upstream.headers.get("x-forwarded-proto"), "https");
  assert.equal(upstream.headers.get("forwarded"), null);
  assert.equal(upstream.headers.get("cf-access-jwt-assertion"), null);
});
