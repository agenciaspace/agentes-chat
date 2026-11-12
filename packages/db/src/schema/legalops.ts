import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./tenancy";

/** Legal matters are visible only to their named people, including their responsible person. */
export const legalMatters = pgTable(
  "legal_matters",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text().notNull(),
    client: text().notNull().default(""),
    brief: text().notNull(),
    ownerId: text().notNull(),
    memberIds: text().array().notNull(),
    revision: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.orgId, t.id), index().on(t.orgId, t.createdAt)],
);

/** Append-only text versions. The same documentKey identifies revisions within one matter. */
export const legalDocuments = pgTable(
  "legal_documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matterId: uuid().notNull(),
    documentKey: uuid().notNull(),
    version: integer().notNull(),
    name: text().notNull(),
    kind: text().$type<"contract" | "model" | "policy">().notNull(),
    content: text().notNull(),
    digest: text().notNull(),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.matterId], foreignColumns: [legalMatters.orgId, legalMatters.id] }).onDelete(
      "cascade",
    ),
    unique().on(t.orgId, t.matterId, t.documentKey, t.version),
    index().on(t.orgId, t.matterId),
  ],
);

export interface LegalSource {
  id: string;
  documentId: string;
  name: string;
  version: number;
  digest: string;
  position: number;
  text: string;
}
export interface LegalOutput {
  summary: string;
  findings: {
    title: string;
    detail: string;
    severity: "attention" | "info";
    citations: { sourceId: string; quote: string }[];
  }[];
  nextActions: string[];
  missingInformation: string[];
}
export interface LegalSnapshot {
  title: string;
  brief: string;
  sources: LegalSource[];
  totalPassages: number;
  agents: { id: string; role: string }[];
}
export type LegalStatus =
  | "queued"
  | "running"
  | "review"
  | "approved"
  | "changes_requested"
  | "failed"
  | "canceled"
  | "superseded";

/** One immutable source snapshot, four durable stages, and a version-specific human decision. */
export const legalAnalyses = pgTable(
  "legal_analyses",
  {
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    matterId: uuid().notNull(),
    requestKey: uuid().notNull(),
    revision: integer().notNull(),
    requestedBy: text().notNull(),
    status: text().$type<LegalStatus>().notNull().default("queued"),
    snapshot: jsonb().$type<LegalSnapshot>().notNull(),
    outputs: jsonb().$type<LegalOutput[]>().notNull().default([]),
    step: integer().notNull().default(0),
    claim: uuid(),
    error: text(),
    decisionNote: text(),
    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.orgId, t.matterId], foreignColumns: [legalMatters.orgId, legalMatters.id] }).onDelete(
      "cascade",
    ),
    unique().on(t.orgId, t.matterId, t.requestKey),
    uniqueIndex("legal_analyses_active")
      .on(t.orgId, t.matterId)
      .where(sql`${t.status} in ('queued', 'running', 'review')`),
    index().on(t.orgId, t.matterId, t.createdAt),
  ],
);
