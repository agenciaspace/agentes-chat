import { DurableObject } from "cloudflare:workers";
import type { InferEnv } from "cf/config";
import type config from "../cloudflare.config";
import { accessAuthorized, accessDenied } from "./access";
import { containerEnvironment, containerRequest, privateUnavailable } from "./runtime";

type Env = InferEnv<(typeof config)["worker"]>;
const HEARTBEAT = 60_000;

export class LegalopsApp extends DurableObject<Env> {
  private ready?: Promise<void>;

  private async ensureStarted() {
    const container = this.ctx.container;
    if (!container) throw new Error("Container not configured");
    if (!container.running) container.start({ enableInternet: true, env: containerEnvironment(this.env) });
    await container.setInactivityTimeout(5 * HEARTBEAT);
    // Keeps the existing Postgres outbox workers alive even when nobody has a browser open.
    await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT);
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        const response = await container
          .getTcpPort(3000)
          .fetch("http://container/api/health", { signal: AbortSignal.timeout(2000) });
        await response.body?.cancel();
        if (response.ok) return;
      } catch {
        /* bounded cold-start wait, no raw credentials or provider bodies in logs */
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Container is not healthy");
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const expected = new URL(this.env.PUBLIC_URL).origin;
      if (new URL(request.url).origin !== expected) return new Response("Host não configurado", { status: 421 });
      this.ready ??= this.ensureStarted().finally(() => {
        this.ready = undefined;
      });
      await this.ready;
      const container = this.ctx.container;
      if (!container) return privateUnavailable();
      // Preserve method/body and upgrades over the private HTTP port; never replay writes after failure.
      const response = await container.getTcpPort(3000).fetch(containerRequest(request));
      if (response.status === 101) return response;
      if (new URL(request.url).pathname.startsWith("/api/")) {
        const headers = new Headers(response.headers);
        headers.set("cache-control", "private, no-store");
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
      }
      return response;
    } catch {
      return privateUnavailable();
    }
  }

  async alarm(): Promise<void> {
    try {
      this.ready ??= this.ensureStarted().finally(() => {
        this.ready = undefined;
      });
      await this.ready;
      await this.ctx.storage.delete("failures");
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT);
    } catch {
      const failures = Math.min(((await this.ctx.storage.get<number>("failures")) ?? 0) + 1, 4);
      await this.ctx.storage.put("failures", failures);
      await this.ctx.storage.setAlarm(Date.now() + HEARTBEAT * 2 ** failures);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await accessAuthorized(request, env))) return accessDenied();
    return env.APP.getByName("primary").fetch(request);
  },
} satisfies ExportedHandler<Env>;
