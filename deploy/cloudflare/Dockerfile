# Cloudflare runs the server and web app; native mobile/desktop dependencies are unnecessary.
FROM oven/bun:1.4.4
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --filter '!@agenteschat/mobile' --filter '!@agenteschat/desktop' \
 && bun run --filter '@agenteschat/web' build \
 && bun build apps/server/runner/main.ts --target=node --banner '#!/usr/bin/env node' --outfile apps/web/dist/runner/agentes-runner.mjs \
 && rm -rf /root/.bun/install/cache
ENV NODE_ENV=production \
    WEB_DIR=/app/apps/web/dist \
    PORT=3000
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
ENTRYPOINT ["bun", "/app/apps/server/src/main.ts"]
