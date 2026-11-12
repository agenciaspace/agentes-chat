import {
  type Agent,
  type LegalAnalysis,
  type LegalDetail,
  type LegalMatter,
  legalRequest,
  useAgents,
  useApi,
  useCredentials,
  useMembers,
  useModels,
} from "@agenteschat/client";
import { can } from "@agenteschat/client/lib/permissions";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@agenteschat/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/components/org-context";
import "./legalops.css";

const roles = ["triage", "contracts", "policies", "coordination"] as const;
const kinds = ["contract", "model", "policy"] as const;
const dataOf = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};

export function LegalopsPage() {
  const { org, me } = useOrg();
  const { t } = useTranslation();
  const [matterId, setMatterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const members = useMembers(org.id);
  const matters = useQuery({
    queryKey: ["legalops", org.id, "matters"],
    queryFn: ({ signal }) => legalRequest<{ matters: LegalMatter[] }>(org.id, "", undefined, signal),
  });
  const create = useMutation({
    mutationFn: (input: unknown) => legalRequest<LegalMatter>(org.id, "", input),
    onSuccess: (matter) => {
      setCreating(false);
      setMatterId(matter.id);
      qc.invalidateQueries({ queryKey: ["legalops", org.id] });
    },
  });
  return (
    <div className="legalops">
      <PageHeader
        title="legalops.chat"
        meta={t("legalops.subtitle")}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setCreating(true);
              setMatterId(null);
            }}
          >
            {t("legalops.newMatter")}
          </Button>
        }
      />
      <p className="legalops__privacy">{t("legalops.privateNotice")}</p>
      {matters.isPending && <p role="status">{t("legalops.loading")}</p>}
      {matters.error && (
        <p role="alert">
          {matters.error.message} <Button onClick={() => matters.refetch()}>{t("legalops.retry")}</Button>
        </p>
      )}
      <div className="legalops__layout">
        <nav className="legalops__list" aria-label={t("legalops.matters")}>
          {matters.data?.matters.map((matter) => (
            <button
              type="button"
              key={matter.id}
              aria-current={matter.id === matterId ? "page" : undefined}
              onClick={() => {
                setMatterId(matter.id);
                setCreating(false);
              }}
            >
              <strong>{matter.title}</strong>
              <span>{matter.client || t("legalops.internal")}</span>
            </button>
          ))}
        </nav>
        <div className="legalops__content">
          {creating ? (
            <Card padded>
              <CardHeader title={t("legalops.newMatter")} />
              <form
                className="legalops__form"
                onSubmit={(event) => {
                  const data = dataOf(event);
                  create.mutate({
                    title: data.get("title"),
                    client: data.get("client"),
                    brief: data.get("brief"),
                    memberIds: data.getAll("member"),
                  });
                }}
              >
                <Field label={t("legalops.title")}>
                  <Input name="title" required minLength={3} maxLength={200} />
                </Field>
                <Field label={t("legalops.client")}>
                  <Input name="client" maxLength={200} />
                </Field>
                <Field label={t("legalops.brief")}>
                  <Textarea name="brief" required minLength={10} maxLength={12000} rows={4} />
                </Field>
                <fieldset>
                  <legend>{t("legalops.participants")}</legend>
                  {members.data
                    ?.filter((m) => m.userId !== me.user.id)
                    .map((member) => (
                      <label className="legalops__check" key={member.userId}>
                        <input type="checkbox" name="member" value={member.userId} />
                        {member.name}
                      </label>
                    ))}
                  <p>{t("legalops.ownerNotice")}</p>
                </fieldset>
                {create.error && <p role="alert">{create.error.message}</p>}
                <div className="legalops__actions">
                  <Button type="submit" variant="primary" loading={create.isPending}>
                    {t("legalops.create")}
                  </Button>
                  <Button onClick={() => setCreating(false)}>{t("legalops.back")}</Button>
                </div>
              </form>
            </Card>
          ) : matterId ? (
            <LegalMatterLoader key={`${org.id}:${matterId}`} orgId={org.id} matterId={matterId} />
          ) : (
            <Card padded>
              <CardHeader title={t("legalops.startTitle")} />
              <p>{t("legalops.startText")}</p>
              <Button onClick={() => setCreating(true)}>{t("legalops.newMatter")}</Button>
            </Card>
          )}
          <details className="legalops__about">
            <summary>{t("legalops.about")}</summary>
            <p>
              Based on agentes.chat by Codari Global, LLC (<a href="https://agentes.chat">agentes.chat</a>).
            </p>
            <p>{t("legalops.limits")}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

function LegalMatterLoader({ orgId, matterId }: { orgId: string; matterId: string }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["legalops", orgId, matterId],
    queryFn: ({ signal }) => legalRequest<LegalDetail>(orgId, `/${matterId}`, undefined, signal),
    refetchInterval: (q) =>
      q.state.data?.analyses.some((r) => ["queued", "running"].includes(r.status)) ? 1500 : false,
  });
  if (query.isPending) return <p role="status">{t("legalops.loading")}</p>;
  if (query.error)
    return (
      <p role="alert">
        {query.error.message}
        <Button onClick={() => query.refetch()}>{t("legalops.retry")}</Button>
      </p>
    );
  return <LegalMatterView key={query.data.matter.revision} detail={query.data} orgId={orgId} />;
}

function LegalMatterView({ detail, orgId }: { detail: LegalDetail; orgId: string }) {
  const { matter, documents, analyses } = detail;
  const { me } = useOrg();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const agents = useAgents(orgId);
  const owned =
    agents.data?.filter((agent) => agent.ownerUserId === me.user.id && !agent.builtin && agent.model !== "auto") ?? [];
  const latest = documents.filter(
    (doc) => !documents.some((other) => other.documentKey === doc.documentKey && other.version > doc.version),
  );
  const [selected, setSelected] = useState(latest.slice(0, 12).map((doc) => doc.id));
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const chosenAgents = roles.map(
    (role, i) => agentIds[i] ?? owned.find((a) => a.handle.startsWith(`jur-${role}`))?.id ?? owned[0]?.id ?? "",
  );
  const [consent, setConsent] = useState(false);
  const [history, setHistory] = useState("");
  const [docKind, setDocKind] = useState("contract");
  const [documentKey, setDocumentKey] = useState("");
  const [fileError, setFileError] = useState("");
  const run = analyses.find((item) => item.id === history) ?? analyses[0];
  const busy = analyses.some((item) => ["queued", "running"].includes(item.status));
  const blocked = analyses.some((item) => ["queued", "running", "review"].includes(item.status));
  const refresh = () => qc.invalidateQueries({ queryKey: ["legalops", orgId] });
  const action = useMutation({
    mutationFn: ({ path, input }: { path: string; input: unknown }) =>
      legalRequest(orgId, `/${matter.id}${path}`, input),
    onSuccess: (_result, variables) => {
      if (variables.path === "/analyses") {
        setRequestKey(crypto.randomUUID());
        setConsent(false);
      }
      return refresh();
    },
  });
  const perform = (path: string, input: unknown) => action.mutate({ path, input });
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  return (
    <>
      <Card padded>
        <CardHeader title={matter.title} subtitle={matter.client || t("legalops.internal")} />
        <p className="legalops__text">{matter.brief}</p>
        <p>{t("legalops.revision", { revision: matter.revision })}</p>
        <details>
          <summary>{t("legalops.participants")}</summary>
          <LegalParticipants ids={matter.memberIds} owner={matter.ownerId} orgId={orgId} />
        </details>
      </Card>
      <Card padded>
        <CardHeader title={t("legalops.documents")} />
        <p>{t("legalops.fileNotice")}</p>
        {latest.length === 0 && <p>{t("legalops.noDocuments")}</p>}
        {latest.map((doc) => (
          <div className="legalops__document" key={doc.id}>
            <label className="legalops__check">
              <input
                type="checkbox"
                checked={selected.includes(doc.id)}
                onChange={(event) =>
                  setSelected((ids) =>
                    event.target.checked
                      ? [...ids.filter((id) => id !== doc.id), doc.id]
                      : ids.filter((id) => id !== doc.id),
                  )
                }
              />
              <span>
                {doc.name} · v{doc.version} · {t(`legalops.kind.${doc.kind}`)}
              </span>
            </label>
            <details>
              <summary>{t("legalops.extractedText")}</summary>
              <pre>{doc.content}</pre>
            </details>
          </div>
        ))}
        <details open={!documents.length}>
          <summary>{t("legalops.addDocument")}</summary>
          <form
            className="legalops__form"
            onSubmit={(event) => {
              const data = dataOf(event);
              perform("/documents", {
                name: data.get("name"),
                content: data.get("content"),
                kind: docKind,
                ...(documentKey ? { documentKey } : {}),
              });
            }}
          >
            <Field label={t("legalops.versionOf")}>
              <Select
                value={documentKey}
                onValueChange={setDocumentKey}
                options={[
                  { value: "", label: t("legalops.newDocument") },
                  ...latest.map((doc) => ({ value: doc.documentKey, label: doc.name })),
                ]}
              />
            </Field>
            <Field label={t("legalops.documentKind")}>
              <Select
                value={docKind}
                onValueChange={setDocKind}
                options={kinds.map((kind) => ({ value: kind, label: t(`legalops.kind.${kind}`) }))}
              />
            </Field>
            <label className="legalops__upload">
              {t("legalops.upload")}
              <input
                type="file"
                accept=".pdf,.docx,.txt,.md"
                disabled={busy || action.isPending}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  if (!file) return;
                  setFileError("");
                  if (file.size > 4 * 1024 * 1024) {
                    setFileError(t("legalops.fileTooLarge"));
                    return;
                  }
                  try {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = "";
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    perform("/files", {
                      name: file.name,
                      kind: docKind,
                      base64: btoa(binary),
                      ...(documentKey ? { documentKey } : {}),
                    });
                  } catch {
                    setFileError(t("legalops.fileFailed"));
                  }
                }}
              />
            </label>
            {fileError && <p role="alert">{fileError}</p>}
            <Field label={t("legalops.documentName")}>
              <Input name="name" maxLength={200} required />
            </Field>
            <Field label={t("legalops.pasteText")}>
              <Textarea name="content" rows={6} minLength={20} maxLength={150000} required />
            </Field>
            <Button type="submit" disabled={busy} loading={action.isPending}>
              {t("legalops.saveText")}
            </Button>
          </form>
        </details>
      </Card>
      <Card padded>
        <CardHeader title={t("legalops.team")} />
        <div className="legalops__form">
          {roles.map((role, i) => (
            <Field key={role} label={t(`legalops.role.${role}`)}>
              <Select
                value={chosenAgents[i]}
                placeholder={t("legalops.chooseAgent")}
                options={owned.map((agent) => ({ value: agent.id, label: `${agent.name} · ${agent.model}` }))}
                onValueChange={(id) =>
                  setAgentIds((old) =>
                    roles.map((_, index) => (index === i ? id : (old[index] ?? chosenAgents[index] ?? ""))),
                  )
                }
              />
            </Field>
          ))}
        </div>
        <LegalTeamSetup orgId={orgId} agents={owned} />
        <label className="legalops__check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          {t("legalops.consent")}
        </label>
        <Button
          variant="primary"
          disabled={blocked || !consent || !selected.length || selected.length > 12 || chosenAgents.some((id) => !id)}
          loading={action.isPending}
          onClick={() => perform("/analyses", { documentIds: selected, agentIds: chosenAgents, requestKey, consent })}
        >
          {t("legalops.analyze")}
        </Button>
        <p>{t("legalops.coverageNotice")}</p>
        {analyses[0] && !blocked && (
          <Button
            onClick={() => {
              setRequestKey(crypto.randomUUID());
              setConsent(false);
            }}
          >
            {t("legalops.prepareNew")}
          </Button>
        )}
      </Card>
      {action.error && <p role="alert">{action.error.message}</p>}
      {run && (
        <Card padded>
          <CardHeader title={t("legalops.analysis")} subtitle={t(`legalops.status.${run.status}`)} />
          {analyses.length > 1 && (
            <Field label={t("legalops.history")}>
              <Select
                value={run.id}
                onValueChange={setHistory}
                options={analyses.map((item) => ({
                  value: item.id,
                  label: `${new Date(item.createdAt).toLocaleString()} · ${t(`legalops.status.${item.status}`)}`,
                }))}
              />
            </Field>
          )}
          <p role="status">{t("legalops.progress", { count: run.step })}</p>
          {run.revision !== matter.revision && <p>{t("legalops.oldRevision")}</p>}
          <p>{t("legalops.coverage", { selected: run.snapshot.sources.length, total: run.snapshot.totalPassages })}</p>
          {run.outputs.map((output, index) => (
            <section className="legalops__output" key={roles[index]}>
              <h3>{t(`legalops.role.${roles[index] ?? "coordination"}`)}</h3>
              <p className="legalops__text">{output.summary}</p>
              {output.findings.map((finding) => (
                <article key={finding.title}>
                  <h4>{finding.title}</h4>
                  <p className="legalops__text">{finding.detail}</p>
                  {finding.citations.map((citation) => {
                    const source = run.snapshot.sources.find((s) => s.id === citation.sourceId);
                    return (
                      <details key={`${citation.sourceId}:${citation.quote}`}>
                        <summary>
                          {source?.name} · v{source?.version} · {citation.sourceId}
                        </summary>
                        <blockquote>{citation.quote}</blockquote>
                        <p>{t("legalops.passage", { position: source?.position })}</p>
                        <pre>{source?.text}</pre>
                      </details>
                    );
                  })}
                </article>
              ))}
              <h4>{t("legalops.nextActions")}</h4>
              <ul>
                {output.nextActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4>{t("legalops.missing")}</h4>
              <ul>
                {output.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <LegalEvidence run={run} />
          <Button
            onClick={() => {
              const report = JSON.stringify({ matter, analysis: run }, null, 2);
              const url = URL.createObjectURL(new Blob([report], { type: "application/json" }));
              const link = document.createElement("a");
              link.href = url;
              link.download = `legalops-${run.id}.json`;
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            {t("legalops.download")}
          </Button>
          {run.error && <p role="alert">{run.error}</p>}
          {["queued", "running", "review"].includes(run.status) && (
            <Button disabled={action.isPending} onClick={() => perform(`/analyses/${run.id}/cancel`, {})}>
              {t("legalops.cancelAnalysis")}
            </Button>
          )}
          {run.status === "review" && matter.ownerId === me.user.id && (
            <form
              className="legalops__form"
              onSubmit={(event) => {
                const data = dataOf(event);
                const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
                perform(`/analyses/${run.id}/decision`, {
                  note: data.get("note"),
                  outcome: submitter?.value ?? "changes_requested",
                });
              }}
            >
              <h3>{t("legalops.humanReview")}</h3>
              <p>{t("legalops.decisionNotice")}</p>
              <Field label={t("legalops.decisionNote")}>
                <Textarea name="note" required minLength={5} maxLength={4000} rows={3} />
              </Field>
              <div className="legalops__actions">
                <Button
                  type="submit"
                  name="outcome"
                  value="approved"
                  variant="primary"
                  disabled={action.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget.form;
                    if (form?.reportValidity())
                      perform(`/analyses/${run.id}/decision`, {
                        outcome: "approved",
                        note: new FormData(form).get("note"),
                      });
                  }}
                >
                  {t("legalops.approve")}
                </Button>
                <Button
                  type="submit"
                  name="outcome"
                  value="changes_requested"
                  disabled={action.isPending}
                  onClick={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget.form;
                    if (form?.reportValidity())
                      perform(`/analyses/${run.id}/decision`, {
                        outcome: "changes_requested",
                        note: new FormData(form).get("note"),
                      });
                  }}
                >
                  {t("legalops.requestChanges")}
                </Button>
              </div>
            </form>
          )}
          {run.decisionNote && (
            <section>
              <h3>{t("legalops.humanDecision")}</h3>
              <p className="legalops__text">{run.decisionNote}</p>
              <time>{run.decidedAt && new Date(run.decidedAt).toLocaleString()}</time>
            </section>
          )}
        </Card>
      )}
    </>
  );
}

function LegalEvidence({ run }: { run: LegalAnalysis }) {
  const { t } = useTranslation();
  return (
    <details>
      <summary>{t("legalops.allEvidence")}</summary>
      {run.snapshot.sources.map((source) => (
        <details key={source.id}>
          <summary>
            {source.id} · {source.name} · v{source.version}
          </summary>
          <pre>{source.text}</pre>
          <small>
            {t("legalops.digest")}: {source.digest}
          </small>
        </details>
      ))}
    </details>
  );
}

function LegalParticipants({ ids, owner, orgId }: { ids: string[]; owner: string; orgId: string }) {
  const members = useMembers(orgId);
  const { t } = useTranslation();
  return (
    <ul>
      {ids.map((id) => (
        <li key={id}>
          {members.data?.find((m) => m.userId === id)?.name ?? t("legalops.member")}
          {id === owner ? ` · ${t("legalops.responsible")}` : ""}
        </li>
      ))}
    </ul>
  );
}

function LegalTeamSetup({ orgId, agents }: { orgId: string; agents: Agent[] }) {
  const { org, me } = useOrg();
  const { t } = useTranslation();
  const api = useApi();
  const qc = useQueryClient();
  const allowed = can(org, "create_agents");
  const credentials = useCredentials(orgId, allowed);
  const models = useModels();
  const [credentialId, setCredentialId] = useState("");
  const [modelId, setModelId] = useState("");
  const [budget, setBudget] = useState("10");
  const credential = credentials.data?.find((item) => item.id === credentialId);
  const available = models.data?.models.filter((model) => model.provider === credential?.provider) ?? [];
  const setup = useMutation({
    mutationFn: async () => {
      for (const role of roles) {
        if (agents.some((agent) => agent.handle.startsWith(`jur-${role}`))) continue;
        await api.agents.create(orgId, {
          name: t(`legalops.role.${role}`),
          handle: `jur-${role}-${crypto.randomUUID().slice(0, 6)}`,
          model: modelId,
          credentialId,
          ownerUserId: me.user.id,
          monthlyBudgetUsd: Number(budget),
          mediaReplies: false,
          instructions: t("legalops.agentInstructions"),
          autonomy: "always",
          audience: { mode: "owner", userIds: [], roleIds: [] },
        });
      }
    },
    onSettled: () => qc.invalidateQueries(),
  });
  if (!allowed) return <p>{t("legalops.askAdmin")}</p>;
  return (
    <details>
      <summary>{t("legalops.configureTeam")}</summary>
      <form
        className="legalops__form"
        onSubmit={(event) => {
          event.preventDefault();
          setup.mutate();
        }}
      >
        <Field label={t("legalops.providerKey")}>
          <Select
            value={credentialId}
            onValueChange={(id) => {
              setCredentialId(id);
              setModelId("");
            }}
            options={(credentials.data ?? []).map((item) => ({ value: item.id, label: item.label }))}
          />
        </Field>
        <Field label={t("legalops.model")}>
          <Select
            value={modelId}
            onValueChange={setModelId}
            options={available.map((model) => ({ value: model.id, label: model.label }))}
          />
        </Field>
        <Field label={t("legalops.budget")}>
          <Input
            type="number"
            min="1"
            max="10000"
            step="1"
            required
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
        <Button type="submit" disabled={!credentialId || !modelId} loading={setup.isPending}>
          {t("legalops.createTeam")}
        </Button>
        <Button asChild>
          <Link to="/org/$orgId/settings" params={{ orgId }}>
            {t("legalops.settings")}
          </Link>
        </Button>
        {setup.error && <p role="alert">{setup.error.message}</p>}
        {setup.isSuccess && <p role="status">{t("legalops.teamReady")}</p>}
      </form>
    </details>
  );
}
