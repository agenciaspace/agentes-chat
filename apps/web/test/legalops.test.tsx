import { afterEach, expect, test } from "bun:test";
import { domWindow, setupDom } from "@agenteschat/ui/testing/dom";

setupDom();

import type { LegalDetail } from "@agenteschat/client/lib/legalops";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { LegalopsPage } from "@/pages/LegalopsPage";
import { createFakeApi, ORG_ID, seedState } from "./fake-api";
import { renderPage, screen, settle } from "./render";

const originalFetch = globalThis.fetch;
const originalFormData = globalThis.FormData;
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  globalThis.FormData = originalFormData;
});

test("legal page: opens a private matter, starts analysis and records human review without authorizing an external action", async () => {
  globalThis.FormData = domWindow().FormData as unknown as typeof FormData;
  const state = seedState();
  const me = state.me;
  if (!me) throw new Error("Missing signed-in test user");
  for (const agent of state.agents) agent.ownerUserId = me.user.id;
  const detail: LegalDetail = {
    matter: {
      id: "matter-1",
      orgId: ORG_ID,
      title: "Revisão da minuta",
      client: "Operações",
      brief: "Conferir vigência e responsabilidades.",
      ownerId: me.user.id,
      memberIds: [me.user.id],
      revision: 2,
      createdAt: new Date().toISOString(),
    },
    documents: [
      {
        id: "doc-1",
        documentKey: "key-1",
        name: "Minuta original",
        version: 1,
        kind: "contract",
        content: "O contrato terá vigência de doze meses.",
        digest: "abc",
        createdAt: new Date().toISOString(),
      },
    ],
    analyses: [],
  };
  const posts: { path: string; data: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url);
    if (!path.includes("/legalops/matters")) throw new Error("Unexpected network request");
    if (init?.method === "POST") {
      const data = JSON.parse(String(init.body)) as Record<string, unknown>;
      posts.push({ path, data });
      if (path.endsWith("/analyses")) {
        detail.analyses = [
          {
            id: "run-1",
            revision: 2,
            status: "review",
            step: 4,
            snapshot: {
              title: detail.matter.title,
              brief: detail.matter.brief,
              sources: [
                {
                  id: "S1",
                  documentId: "doc-1",
                  name: "Minuta original",
                  version: 1,
                  digest: "abc",
                  position: 1,
                  text: detail.documents[0]?.content ?? "",
                },
              ],
              totalPassages: 1,
              agents: [],
            },
            outputs: [
              {
                summary: "Vigência encontrada na minuta.",
                findings: [
                  {
                    title: "Prazo contratual",
                    detail: "Confira a política interna.",
                    severity: "attention",
                    citations: [{ sourceId: "S1", quote: "vigência de doze meses" }],
                  },
                ],
                nextActions: ["Revisar minuta."],
                missingInformation: ["Modelo não fornecido."],
              },
            ],
            error: null,
            decisionNote: null,
            decidedBy: null,
            decidedAt: null,
            createdAt: new Date().toISOString(),
          },
        ];
      } else if (path.endsWith("/decision")) {
        const run = detail.analyses[0];
        if (!run) throw new Error("No analysis");
        run.status = data.outcome === "approved" ? "approved" : "changes_requested";
        run.decisionNote = String(data.note);
        run.decidedBy = me.user.id;
        run.decidedAt = new Date().toISOString();
      }
      return Response.json({ id: "run-1" });
    }
    return Response.json(path.endsWith("/matters") ? { matters: [detail.matter] } : detail);
  }) as typeof fetch;
  await renderPage(<LegalopsPage />, { api: createFakeApi(state), org: true });
  await settle(5);
  await act(async () => fireEvent.click(screen().getByRole("button", { name: /Revisão da minuta/ })));
  await settle(5);
  const analyze = screen().getByRole("button", { name: "Analisar com a equipe" });
  expect(analyze.hasAttribute("disabled")).toBe(true);
  await act(async () => fireEvent.click(screen().getByLabelText(/Autorizo o processamento/)));
  await act(async () => fireEvent.click(analyze));
  await settle(5);
  expect(screen().getByText("Sua revisão")).toBeTruthy();
  expect(screen().getByText("Cobertura: 1 de 1 trechos.")).toBeTruthy();
  await act(async () =>
    fireEvent.change(screen().getByLabelText("Decisão e orientações"), {
      target: { value: "Fontes conferidas com a minuta original." },
    }),
  );
  await act(async () => fireEvent.click(screen().getByRole("button", { name: "Concluir análise revisada" })));
  await settle(5);
  expect(screen().getByText("Decisão humana registrada")).toBeTruthy();
  expect(posts.map((post) => post.path.split("/").at(-1))).toEqual(["analyses", "decision"]);
  expect(posts[1]?.data).toMatchObject({ outcome: "approved", note: "Fontes conferidas com a minuta original." });
  expect((screen().getByRole("button", { name: "Analisar com a equipe" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => fireEvent.click(screen().getByLabelText(/Autorizo o processamento/)));
  await act(async () => fireEvent.click(screen().getByRole("button", { name: "Analisar com a equipe" })));
  await settle(5);
  expect(posts[2]?.data.requestKey).not.toBe(posts[0]?.data.requestKey);
});
