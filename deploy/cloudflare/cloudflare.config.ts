import { bindings, defineConfig, defineContainer, exports } from "cf/config";

const app = defineContainer({
  name: "legalops-platform-staging",
  image: { dockerfile: "./Dockerfile", buildContext: "../.." },
  instanceType: "standard-1",
  maxInstances: 1,
  ssh: { enabled: false },
  observability: { enabled: true, logs: { enabled: true } },
});

export default defineConfig({
  worker: {
    name: "legalops-platform-staging",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-11-11",
    workersDev: true,
    previewUrls: false,
    observability: { enabled: true, traces: { enabled: true } },
    exports: { LegalopsApp: exports.durableObject({ storage: "sqlite", container: app }) },
    env: {
      APP: bindings.durableObject({ worker: "legalops-platform-staging", exportName: "LegalopsApp" }),
      DATABASE_URL: bindings.secret(),
      AGENTES_SECRET: bindings.secret(),
      PUBLIC_URL: bindings.secret(),
      ACCESS_TEAM_DOMAIN: bindings.secret(),
      ACCESS_AUD: bindings.secret(),
    },
  },
  containers: [app],
});
