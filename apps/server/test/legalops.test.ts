import { afterEach, beforeEach, expect, test } from "bun:test";
import type { LegalDetail } from "@agenteschat/client/lib/legalops";
import { eq, schema } from "@agenteschat/db";
import { processLegalAnalysis } from "@agenteschat/engine";
import { browser, createTestServer, joinByInvitation, seedOrg, signUp, type TestServer } from "./harness";

let t: TestServer;
let invalid = false;
const passage = "O contrato terá vigência de doze meses a partir da assinatura pelas partes.";
beforeEach(async () => {
  invalid = false;
  t = await createTestServer({
    env: { ALLOW_SIGNUP: "true" },
    reply: () => ({
      chunks: [
        JSON.stringify({
          summary: "A minuta prevê vigência de doze meses.",
          findings: [
            {
              title: "Vigência",
              detail: "Confira o prazo com a política interna.",
              severity: "attention",
              citations: [
                { sourceId: "S1", quote: invalid ? "Esta frase não existe no documento original." : passage },
              ],
            },
          ],
          nextActions: ["Submeter ao responsável."],
          missingInformation: ["Modelo aprovado não fornecido."],
        }),
      ],
    }),
  });
});
afterEach(() => t.close());

async function setup() {
  const owner = browser(t);
  await signUp(owner, "owner@example.com");
  const org = await seedOrg(owner);
  const base = `/api/app/organizations/${org.orgId}/legalops/matters`;
  const response = await owner(base, {
    json: { title: "Contrato fornecedor", brief: "Revisar prazo e responsabilidades." },
  });
  expect(response.status).toBe(200);
  const matter = (await response.json()) as { id: string };
  const path = `${base}/${matter.id}`;
  const doc = (await (
    await owner(`${path}/documents`, { json: { name: "Minuta", kind: "contract", content: passage } })
  ).json()) as { id: string; documentKey: string };
  const input = {
    requestKey: crypto.randomUUID(),
    documentIds: [doc.id],
    agentIds: Array(4).fill(org.agentId),
    consent: true,
  };
  return { owner, ...org, base, path, matter, doc, input };
}

test("legal workflow: immutable sources, four budgeted stages and one human decision", async () => {
  const s = await setup();
  const queued = await s.owner(`${s.path}/analyses`, { json: s.input });
  expect(queued.status).toBe(200);
  expect(queued.headers.get("cache-control")).toBe("private, no-store");
  const run = (await queued.json()) as { id: string };
  await t.drain();
  const detail = (await (await s.owner(s.path)).json()) as LegalDetail;
  expect(detail.analyses[0]).toMatchObject({ status: "review", step: 4 });
  expect(detail.analyses[0]?.outputs).toHaveLength(4);
  expect(detail.analyses[0]?.snapshot.sources[0]).toMatchObject({ text: passage, version: 1 });
  expect(Object.hasOwn(detail.analyses[0] ?? {}, "claim")).toBe(false);
  const usage = await t.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.agentId, s.agentId));
  expect(usage).toHaveLength(4);
  const decision = `${s.path}/analyses/${run.id}/decision`;
  expect((await s.owner(decision, { json: { outcome: "approved", note: "Fontes e minuta conferidas." } })).status).toBe(
    200,
  );
  expect((await s.owner(decision, { json: { outcome: "approved", note: "Não pode repetir a decisão." } })).status).toBe(
    409,
  );
  expect(await t.db.select().from(schema.approvals)).toHaveLength(0);
});

test("invalid citations never become a reviewable analysis", async () => {
  const s = await setup();
  invalid = true;
  await s.owner(`${s.path}/analyses`, { json: s.input });
  await t.drain();
  const detail = (await (await s.owner(s.path)).json()) as LegalDetail;
  expect(detail.analyses[0]).toMatchObject({ status: "failed", outputs: [], step: 0 });
  expect(detail.analyses[0]?.error).not.toContain("original");
});

test("repeated requests and redelivered jobs do not duplicate committed stages", async () => {
  const s = await setup();
  const run = (await (await s.owner(`${s.path}/analyses`, { json: s.input })).json()) as { id: string };
  expect(await (await s.owner(`${s.path}/analyses`, { json: s.input })).json()).toMatchObject({ id: run.id });
  expect((await s.owner(`${s.path}/analyses`, { json: { ...s.input, requestKey: crypto.randomUUID() } })).status).toBe(
    409,
  );
  await t.drain();
  await processLegalAnalysis({ db: t.db, gateway: t.engine.gateway }, s.orgId, run.id, 0);
  expect(await t.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.agentId, s.agentId))).toHaveLength(
    4,
  );
});

test("canceling queued work fences its jobs and permits a fresh analysis", async () => {
  const s = await setup();
  const run = (await (await s.owner(`${s.path}/analyses`, { json: s.input })).json()) as { id: string };
  expect((await s.owner(`${s.path}/analyses/${run.id}/cancel`, { json: {} })).status).toBe(200);
  await t.drain();
  expect(await t.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.agentId, s.agentId))).toHaveLength(
    0,
  );
  expect((await s.owner(`${s.path}/analyses`, { json: { ...s.input, requestKey: crypto.randomUUID() } })).status).toBe(
    200,
  );
});

test("a new document version supersedes pending review and preserves the original evidence", async () => {
  const s = await setup();
  const run = (await (await s.owner(`${s.path}/analyses`, { json: s.input })).json()) as { id: string };
  expect(
    (await s.owner(`${s.path}/documents`, { json: { name: "Too early", kind: "contract", content: passage } })).status,
  ).toBe(409);
  await t.drain();
  const revised = await s.owner(`${s.path}/documents`, {
    json: {
      documentKey: s.doc.documentKey,
      name: "Minuta revisada",
      kind: "contract",
      content: "O contrato terá vigência de seis meses após a assinatura.",
    },
  });
  expect(revised.status).toBe(200);
  expect(await revised.json()).toMatchObject({ version: 2 });
  expect(
    (
      await s.owner(`${s.path}/analyses/${run.id}/decision`, {
        json: { outcome: "approved", note: "Versão antiga não pode ser aprovada." },
      })
    ).status,
  ).toBe(409);
  const detail = (await (await s.owner(s.path)).json()) as LegalDetail;
  expect(detail.analyses[0]?.snapshot.sources[0]?.text).toBe(passage);
  expect(detail.analyses[0]?.status).toBe("superseded");
});

test("organization members outside the matter cannot discover, read or mutate it", async () => {
  const s = await setup();
  const peer = browser(t);
  await signUp(peer, "peer@example.com");
  await joinByInvitation(t, s.owner, s.orgId, "peer@example.com", { as: peer });
  expect(await (await peer(s.base)).json()).toEqual({ matters: [] });
  expect((await peer(s.path)).status).toBe(404);
  expect(
    (await peer(`${s.path}/documents`, { json: { name: "Test", kind: "contract", content: passage } })).status,
  ).toBe(404);
  expect((await peer(`${s.path}/analyses`, { json: s.input })).status).toBe(404);
  const stranger = browser(t);
  await signUp(stranger, "stranger@example.com");
  expect((await stranger(s.path)).status).toBe(403);
  const other = await seedOrg(stranger);
  const wrongOrg = s.path.replace(s.orgId, other.orgId);
  expect((await stranger(wrongOrg)).status).toBe(404);
});

test("CSRF, source IDs from another matter and missing consent are refused", async () => {
  const s = await setup();
  expect((await s.owner(`${s.path}/analyses`, { json: s.input, origin: "https://evil.example" })).status).toBe(403);
  expect((await s.owner(`${s.path}/analyses`, { json: { ...s.input, consent: false } })).status).toBe(400);
  const second = (await (
    await s.owner(s.base, { json: { title: "Outra demanda", brief: "Outro contrato com acesso distinto." } })
  ).json()) as { id: string };
  expect((await s.owner(`${s.base}/${second.id}/analyses`, { json: s.input })).status).toBe(400);
  expect(
    (
      await s.owner(`${s.base}/${second.id}/documents`, {
        json: { documentKey: s.doc.documentKey, name: "Cópia", kind: "contract", content: passage },
      })
    ).status,
  ).toBe(404);
});

test("zero budget stops analysis before any model call", async () => {
  const s = await setup();
  await t.db.update(schema.agents).set({ monthlyBudgetNanoUsd: 0 }).where(eq(schema.agents.id, s.agentId));
  await s.owner(`${s.path}/analyses`, { json: s.input });
  await t.drain();
  expect(((await (await s.owner(s.path)).json()) as LegalDetail).analyses[0]?.status).toBe("failed");
  expect(await t.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.agentId, s.agentId))).toHaveLength(
    0,
  );
});

test("file upload extracts text into the same immutable and scoped document flow", async () => {
  const s = await setup();
  const added = await s.owner(`${s.path}/files`, {
    json: {
      name: "modelo.txt",
      kind: "model",
      base64: Buffer.from("Modelo aprovado: a vigência proposta é de doze meses.").toString("base64"),
    },
  });
  expect(added.status).toBe(200);
  expect(await added.json()).toMatchObject({ name: "modelo.txt", kind: "model", version: 1 });
  expect(
    (await s.owner(`${s.path}/files`, { json: { name: "macro.exe", kind: "contract", base64: "YWJj" } })).status,
  ).toBe(400);
});

test("even an administrator is not implicitly a participant, and membership is checked when work executes", async () => {
  const s = await setup();
  const admin = await joinByInvitation(t, s.owner, s.orgId, "admin@example.com", { role: "admin" });
  expect((await admin(s.path)).status).toBe(404);
  await s.owner(`${s.path}/analyses`, { json: s.input });
  await t.db.update(schema.agents).set({ archivedAt: new Date() }).where(eq(schema.agents.id, s.agentId));
  await t.drain();
  expect(((await (await s.owner(s.path)).json()) as LegalDetail).analyses[0]?.status).toBe("failed");
  expect(await t.db.select().from(schema.usageRecords).where(eq(schema.usageRecords.agentId, s.agentId))).toHaveLength(
    0,
  );
});

test("a result arriving after cancellation is discarded and starts no next stage", async () => {
  const s = await setup();
  const run = (await (await s.owner(`${s.path}/analyses`, { json: s.input })).json()) as { id: string };
  let entered!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gateway = {
    ...t.engine.gateway,
    stream: async (call: Parameters<typeof t.engine.gateway.stream>[0]) => {
      const result = await t.engine.gateway.stream(call);
      entered();
      await hold;
      return result;
    },
  };
  const processing = processLegalAnalysis({ db: t.db, gateway }, s.orgId, run.id, 0);
  await ready;
  expect((await s.owner(`${s.path}/analyses/${run.id}/cancel`, { json: {} })).status).toBe(200);
  release();
  await processing;
  await t.drain();
  const detail = (await (await s.owner(s.path)).json()) as LegalDetail;
  expect(detail.analyses[0]).toMatchObject({ status: "canceled", step: 0, outputs: [] });
});

test("a named participant reads the matter but cannot decide on behalf of its responsible person", async () => {
  const s = await setup();
  const peer = await joinByInvitation(t, s.owner, s.orgId, "reviewer@example.com");
  const me = (await (await peer("/api/app/me")).json()) as { user: { id: string } };
  const matter = (await (
    await s.owner(s.base, {
      json: {
        title: "Demanda compartilhada",
        brief: "Conferir minuta com a equipe autorizada.",
        memberIds: [me.user.id],
      },
    })
  ).json()) as { id: string };
  const path = `${s.base}/${matter.id}`;
  const doc = (await (
    await s.owner(`${path}/documents`, { json: { name: "Minuta", kind: "contract", content: passage } })
  ).json()) as { id: string };
  const run = (await (await s.owner(`${path}/analyses`, { json: { ...s.input, documentIds: [doc.id] } })).json()) as {
    id: string;
  };
  await t.drain();
  expect((await peer(path)).status).toBe(200);
  expect(
    (
      await peer(`${path}/analyses/${run.id}/decision`, {
        json: { outcome: "approved", note: "Outra pessoa não pode concluir." },
      })
    ).status,
  ).toBe(403);
});
