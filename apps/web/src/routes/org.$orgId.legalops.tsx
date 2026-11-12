import { createFileRoute } from "@tanstack/react-router";
import { Main } from "@/components/Main";
import { LegalopsPage } from "@/pages/LegalopsPage";

export const Route = createFileRoute("/org/$orgId/legalops")({
  component: () => (
    <Main>
      <LegalopsPage />
    </Main>
  ),
});
