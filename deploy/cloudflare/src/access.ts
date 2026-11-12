import { createRemoteJWKSet, type JWTVerifyGetKey, jwtVerify } from "jose";

export interface AccessSettings {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
}
let cachedKeys: { issuer: string; keys: JWTVerifyGetKey } | undefined;

/** Validate Access at the origin too: a header name alone is never proof of authentication. */
export async function accessAuthorized(
  request: Request,
  settings: AccessSettings,
  testKeys?: JWTVerifyGetKey,
): Promise<boolean> {
  try {
    const team = settings.ACCESS_TEAM_DOMAIN;
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !settings.ACCESS_AUD) return false;
    const token = request.headers.get("cf-access-jwt-assertion");
    if (!token || token.length > 16_384) return false;
    if (!testKeys && cachedKeys?.issuer !== team) {
      cachedKeys = { issuer: team, keys: createRemoteJWKSet(new URL(`${team}/cdn-cgi/access/certs`)) };
    }
    const keys = testKeys ?? cachedKeys?.keys;
    if (!keys) return false;
    await jwtVerify(token, keys, {
      issuer: team,
      audience: settings.ACCESS_AUD,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat"],
    });
    return true;
  } catch {
    return false;
  }
}

export function accessDenied(): Response {
  return new Response("Acesso restrito. Entre pelo endereço protegido do escritório.", {
    status: 403,
    headers: { "cache-control": "private, no-store" },
  });
}
