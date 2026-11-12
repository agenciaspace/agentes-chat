import {
  addLegalDocument,
  cancelLegalAnalysis,
  createLegalMatter,
  decideLegalAnalysis,
  extractLegalFile,
  legalDecisionInput,
  legalDocumentInput,
  legalMatterDetail,
  legalMatterInput,
  legalRunInput,
  listLegalMatters,
  requireLegalMatter,
  startLegalAnalysis,
} from "@agenteschat/engine";
import { createRoute, z } from "@hono/zod-openapi";
import { type AppDeps, body, createAppRouter, errors, requireSession, security } from "./context";

const Org = z.object({ orgId: z.uuid() });
const Matter = Org.extend({ matterId: z.uuid() });
const Run = Matter.extend({ analysisId: z.uuid() });
const response = {
  200: { description: "Resultado jurídico privado", content: { "application/json": { schema: z.unknown() } } },
  ...errors,
};

/** A closed, text-only legal workflow. General chat and MCP tools have no access to its private documents. */
export function legalopsRoutes(deps: AppDeps) {
  const app = createAppRouter(deps);
  app.use("/organizations/*", requireSession(deps.auth));
  app.use("/organizations/:orgId/legalops/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  });
  const base = "/organizations/{orgId}/legalops/matters";
  app.openapi(
    createRoute({
      method: "get",
      path: base,
      security,
      tags: ["LegalOps"],
      request: { params: Org },
      responses: response,
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json({ matters: await listLegalMatters(deps.db, c.get("user").id, orgId) }, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: base,
      security,
      tags: ["LegalOps"],
      request: { params: Org, body: body(legalMatterInput) },
      responses: response,
    }),
    async (c) => {
      const { orgId } = c.req.valid("param");
      return c.json(await createLegalMatter(deps.db, c.get("user").id, orgId, c.req.valid("json")), 200);
    },
  );
  app.openapi(
    createRoute({
      method: "get",
      path: `${base}/{matterId}`,
      security,
      tags: ["LegalOps"],
      request: { params: Matter },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId } = c.req.valid("param");
      return c.json(await legalMatterDetail(deps.db, c.get("user").id, orgId, matterId), 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{matterId}/documents`,
      security,
      tags: ["LegalOps"],
      request: { params: Matter, body: body(legalDocumentInput) },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId } = c.req.valid("param");
      return c.json(await addLegalDocument(deps.db, c.get("user").id, orgId, matterId, c.req.valid("json")), 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{matterId}/analyses`,
      security,
      tags: ["LegalOps"],
      request: { params: Matter, body: body(legalRunInput) },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId } = c.req.valid("param");
      const result = await startLegalAnalysis(deps.db, c.get("user").id, orgId, matterId, c.req.valid("json"));
      deps.wakeWorkers?.();
      return c.json(result, 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{matterId}/files`,
      security,
      tags: ["LegalOps"],
      request: {
        params: Matter,
        body: body(
          z.object({
            name: z.string().min(1).max(200),
            kind: z.enum(["contract", "model", "policy"]),
            base64: z.string().max(5592408),
            documentKey: z.uuid().optional(),
          }),
        ),
      },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId } = c.req.valid("param");
      const userId = c.get("user").id;
      await requireLegalMatter(deps.db, userId, orgId, matterId);
      const input = c.req.valid("json");
      const content = await extractLegalFile(input.name, input.base64);
      return c.json(await addLegalDocument(deps.db, userId, orgId, matterId, { ...input, content }), 200);
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{matterId}/analyses/{analysisId}/decision`,
      security,
      tags: ["LegalOps"],
      request: { params: Run, body: body(legalDecisionInput) },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId, analysisId } = c.req.valid("param");
      return c.json(
        await decideLegalAnalysis(deps.db, c.get("user").id, orgId, matterId, analysisId, c.req.valid("json")),
        200,
      );
    },
  );
  app.openapi(
    createRoute({
      method: "post",
      path: `${base}/{matterId}/analyses/{analysisId}/cancel`,
      security,
      tags: ["LegalOps"],
      request: { params: Run, body: body(z.object({})) },
      responses: response,
    }),
    async (c) => {
      const { orgId, matterId, analysisId } = c.req.valid("param");
      return c.json(await cancelLegalAnalysis(deps.db, c.get("user").id, orgId, matterId, analysisId), 200);
    },
  );
  return app;
}
