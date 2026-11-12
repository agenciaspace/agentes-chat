/** Local synthetic demo only. No production keys, data or provider calls. Run after building apps/web. */
import { join } from "node:path";
import { browser, createTestServer, seedOrg, signUp } from "./harness";

const t = await createTestServer({
  env: { ALLOW_SIGNUP: "true" },
  reply: (request) => {
    const message = request.messages.at(-1)?.content;
    let sources: { id: string; text: string }[] = [];
    try {
      sources =
        JSON.parse(
          typeof message === "string"
            ? message
            : Array.isArray(message)
              ? message.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
              : "{}",
        ).sources ?? [];
    } catch {}
    const source = sources[0];
    return {
      chunks: [
        JSON.stringify({
          summary: "Demonstração com dados sintéticos. Confira a vigência e os documentos de referência.",
          findings: source
            ? [
                {
                  title: "Vigência contratual",
                  detail: "O trecho deve ser conferido pelo responsável antes da conclusão.",
                  severity: "attention",
                  citations: [{ sourceId: source.id, quote: source.text.slice(0, 120) }],
                },
              ]
            : [],
          nextActions: ["Conferir a minuta e registrar a decisão humana."],
          missingInformation: ["Validar os critérios internos aplicáveis."],
        }),
      ],
    };
  },
});
const owner = browser(t);
await signUp(owner, "demo@legalops.test");
const { orgId } = await seedOrg(owner);
await owner(`/api/app/organizations/${orgId}/onboarding`, { method: "PATCH", json: { finished: true } });
const root = join(import.meta.dir, "../../web/dist");
let draining = false;
setInterval(async () => {
  if (draining) return;
  draining = true;
  try {
    await t.drain();
  } finally {
    draining = false;
  }
}, 500);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3000,
  fetch: async (request, bunServer) => {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return t.realtime.fetch(request, bunServer, (r) => t.app.fetch(r));
    const file = Bun.file(join(root, path));
    return new Response((await file.exists()) ? file : Bun.file(join(root, "index.html")));
  },
  websocket: t.realtime.websocket,
});
console.log(`Synthetic demo: http://127.0.0.1:${server.port}/org/${orgId}/legalops`);
console.log("Local test login: demo@legalops.test / correct horse battery");
