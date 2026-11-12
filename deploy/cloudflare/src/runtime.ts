export interface Settings {
  DATABASE_URL: string;
  AGENTES_SECRET: string;
  PUBLIC_URL: string;
}

/** Only existing application settings are passed; no file data is persisted on the ephemeral disk. */
export function containerEnvironment(settings: Settings): Record<string, string> {
  const db = new URL(settings.DATABASE_URL);
  const origin = new URL(settings.PUBLIC_URL);
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !db.username ||
    !db.password ||
    !["require", "verify-full"].includes(db.searchParams.get("sslmode") ?? "")
  )
    throw new Error("PostgreSQL with TLS required");
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("A public HTTPS origin is required");
  if (settings.AGENTES_SECRET.length < 48) throw new Error("A stable application secret is required");
  return {
    NODE_ENV: "production",
    PORT: "3000",
    WEB_DIR: "/app/apps/web/dist",
    DATABASE_URL: settings.DATABASE_URL,
    AGENTES_SECRET: settings.AGENTES_SECRET,
    PUBLIC_URL: origin.origin,
    ALLOW_SIGNUP: "false",
    TELEMETRY: "off",
    SOURCE_URL: "https://github.com/agenciaspace/agentes-chat",
    // FILES_DIR is intentionally absent: the app stores files in PostgreSQL, never on container disk.
  };
}

export function privateUnavailable(): Response {
  return Response.json(
    { error: "A instância jurídica está iniciando ou indisponível. Tente novamente." },
    { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "8" } },
  );
}

/** The Bun listener speaks HTTP; the port binding supplies the private transport. */
export function containerRequest(request: Request): Request {
  const url = new URL(request.url);
  const publicHost = url.host;
  url.protocol = "http:";
  const upstream = new Request(url, request);
  upstream.headers.set("host", publicHost);
  upstream.headers.set("x-forwarded-host", publicHost);
  upstream.headers.set("x-forwarded-proto", "https");
  upstream.headers.delete("forwarded");
  upstream.headers.delete("cf-access-jwt-assertion");
  return upstream;
}
