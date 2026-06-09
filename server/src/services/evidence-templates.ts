import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Db } from "@paperclipai/db";
import { activityService } from "./activity.js";
import { companyService } from "./companies.js";

export type EvidenceRendererKind = "markdown" | "html" | "pdf";

export type EvidenceTemplateStatus = "In place" | "Partial" | "Missing" | "Needs review" | string;

export interface EvidenceTemplate {
  templateId: string;
  controlId: string;
  frameworks: string[];
  title: string;
  summary: string;
  description: string;
  requiredArtifacts: string[];
  optionalArtifacts: string[];
  sourceSurfaces: string[];
  renderers: EvidenceRendererKind[];
  ownerRole: string;
  reviewCadence: string;
  freshnessPolicy: {
    staleAfterDays: number;
    validationSources: string[];
  };
  status: EvidenceTemplateStatus;
}

const CONTROL_PLAIN_ENGLISH_DESCRIPTIONS: Record<string, string> = {
  "AC-01": "Ensures only authorised users and agents can access sensitive data and actions — a core SOC2 requirement for preventing unauthorised access.",
  "SEC-01": "Verifies that passwords, tokens, and API keys are never exposed in logs or error messages, protecting confidentiality under SOC2 CC6.",
  "AUD-01": "Captures a tamper-evident record of who did what and when, giving auditors the evidence trail required by SOC2 CC7 and ISO27001 A.8.",
  "DOC-01": "Tracks policy documents through their full lifecycle with revision history, satisfying SOC2 CC8 change-management documentation requirements.",
  "RSK-01": "Documents what is in scope and what risks have been identified or accepted, the starting point for every SOC2 CC3 and ISO27001 A.6 audit.",
  "CHG-01": "Demonstrates that code changes go through review and automated testing before release, fulfilling SOC2 CC8 change-management controls.",
  "BCK-01": "Confirms that data can be recovered after loss or corruption, satisfying SOC2 CC7 availability and ISO27001 A.12 backup requirements.",
  "REP-01": "Produces the single audit-ready evidence package that auditors request, covering availability, security, and operational metrics.",
  "EVI-01": "Guarantees that evidence files are stored at consistent, findable locations with stable names so they remain valid across audit cycles.",
  "IR-01": "Shows how the organisation detects, responds to, and recovers from incidents — required evidence for SOC2 CC7 and ISO27001 A.16.",
  "ENV-01": "Enforces boundaries between execution environments so agents and users cannot access resources outside their authorised scope, supporting SOC2 CC6.",
  "VULN-01": "Tracks dependency vulnerabilities and patch status to demonstrate ongoing security hygiene under ISO27001 A.12 and SOC2 CC7.",
  "GDPR-03": "Confirms that personal data is readable only by authorised parties, meeting GDPR data-minimisation and access-control obligations.",
};

const TECHNICAL_TERM_GLOSSARY: Record<string, { label: string; description: string }> = {
  conditionalAccessPolicies: {
    label: "Conditional Access Policies",
    description: "Rules controlling which users can access which systems and under what conditions (e.g. requiring MFA from untrusted locations).",
  },
  servicePrincipalRiskDetections: {
    label: "Service Principal Risk Detections",
    description: "Alerts raised when an application identity (service account) shows signs of compromise or unusual behaviour.",
  },
  signInLogs: {
    label: "Sign-in Logs",
    description: "A record of every authentication attempt, used to detect suspicious logins and satisfy access-audit requirements.",
  },
  auditLogs: {
    label: "Audit Logs",
    description: "A chronological record of administrative actions performed in the directory, required for SOC2 and ISO27001 audit trails.",
  },
  users: {
    label: "User Accounts",
    description: "The directory listing of people with access to the system, reviewed periodically to remove stale or over-privileged accounts.",
  },
  groups: {
    label: "Security Groups",
    description: "Collections of users that share the same access permissions, used to enforce least-privilege access control.",
  },
  directoryRoles: {
    label: "Directory Roles",
    description: "Privileged roles assigned to administrators, which must be documented and reviewed for SOC2 access-control evidence.",
  },
  applications: {
    label: "Registered Applications",
    description: "Third-party or internal apps granted access to the directory; each must be reviewed for necessity and scope.",
  },
  servicePrincipals: {
    label: "Service Principals",
    description: "Machine identities used by applications and services; equivalent to service accounts and subject to least-privilege review.",
  },
  oAuth2PermissionGrants: {
    label: "OAuth2 Permission Grants",
    description: "Consented permissions that allow applications to act on behalf of users; must be reviewed to prevent over-privileged access.",
  },
  appRoleAssignments: {
    label: "App Role Assignments",
    description: "Specific roles granted to users or service principals within an application, requiring periodic access review.",
  },
  privilegedIdentityManagement: {
    label: "Privileged Identity Management",
    description: "Just-in-time elevation of admin rights, reducing standing privilege exposure as required by SOC2 and ISO27001.",
  },
};

export function getControlDescription(controlId: string): string {
  return CONTROL_PLAIN_ENGLISH_DESCRIPTIONS[controlId] ?? "";
}

export function lookupTechnicalTerm(term: string): { label: string; description: string } | null {
  const camel = term.replace(/[-_\s]+(.)/g, (_, c: string) => c.toUpperCase());
  return TECHNICAL_TERM_GLOSSARY[camel] ?? TECHNICAL_TERM_GLOSSARY[term] ?? null;
}

export function toPlainEnglishLabel(technicalName: string): string {
  const entry = lookupTechnicalTerm(technicalName);
  if (entry) return entry.label;
  return technicalName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface EvidenceArtifact {
  artifactId: string;
  artifactType: string;
  source: string;
  contentType: string;
  byteSize: number;
  sha256: string;
  createdAt: string;
}

export interface EvidencePacket {
  generatedAt: string;
  companyId: string;
  controlId: string;
  frameworks: string[];
  templateId: string;
  title: string;
  status: EvidenceTemplateStatus;
  owner: {
    role: string;
  };
  reviewCadence: string;
  freshness: {
    lastValidatedAt: string | null;
    staleAfter: string;
    isStale: boolean;
  };
  artifacts: EvidenceArtifact[];
  missingArtifacts: string[];
  notes: string[];
  exceptions: string[];
  renderHints: {
    preferredFormats: EvidenceRendererKind[];
    sourceSurfaces: string[];
  };
}

interface ParsedTemplateRow {
  controlId: string;
  title: string;
  summary: string;
  sourceSurfaces: string[];
  requiredArtifacts: string[];
  status: EvidenceTemplateStatus;
}

const SPEC_FILES = [
  { path: "LYT-202-gdpr-compliance-framework-and-control-set.md", frameworks: ["GDPR"] },
  { path: "LYT-203-hipaa-compliance-framework-and-control-set.md", frameworks: ["HIPAA"] },
  { path: "LYT-149-security-policies-soc2-iso27001.md", frameworks: ["SOC2", "ISO27001"] },
  { path: "LYT-150-risk-assessment-scoping-soc2-iso27001.md", frameworks: ["SOC2", "ISO27001"] },
  { path: "LYT-151-technical-control-implementation-soc2-iso27001.md", frameworks: ["SOC2", "ISO27001"] },
  { path: "LYT-152-audit-prep-compliance-documentation-soc2-iso27001.md", frameworks: ["SOC2", "ISO27001"] },
] as const;

const README_OWNER = "Platform Engineering";

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeList(value: string): string[] {
  return value
    .split(/[,;]|\s+and\s+/i)
    .map((part) => part.replace(/[`"']/g, "").trim())
    .filter(Boolean);
}

function parseMarkdownTableRows(content: string): ParsedTemplateRow[] {
  const rows: ParsedTemplateRow[] = [];
  const lines = content.split(/\r?\n/);
  let headers: string[] | null = null;
  let headerIndexes: Map<string, number> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || line === "|" || /^\|?[-\s|:]+\|?$/.test(line)) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (!headers) {
      const hasControlId = cells.some((cell) => /^Control ID$/i.test(cell));
      if (!hasControlId) continue;
      headers = cells;
      headerIndexes = new Map(headers.map((header, index) => [header.toLowerCase(), index]));
      continue;
    }

    if (!headerIndexes || cells.length < 2) continue;
    const controlId = cells[headerIndexes.get("control id") ?? 0] ?? "";
    if (!/^([A-Z]+-\d{2,}|[A-Z0-9]+-\d+)$/.test(controlId.trim())) continue;

    const titleIndex = headerIndexes.get("requirement") ?? headerIndexes.get("title") ?? 0;
    const summaryIndex = headerIndexes.get("area") ?? headerIndexes.get("domain") ?? headerIndexes.get("scope") ?? titleIndex;
    const evidenceIndex = headerIndexes.get("evidence") ?? headerIndexes.get("artifacts") ?? -1;
    const anchorIndex = headerIndexes.get("repo anchors") ?? headerIndexes.get("repo anchor") ?? headerIndexes.get("repo") ?? -1;
    const statusIndex = headerIndexes.get("status") ?? -1;

    rows.push({
      controlId: normalizeText(controlId),
      title: normalizeText(cells[titleIndex] ?? controlId),
      summary: normalizeText(cells[summaryIndex] ?? cells[titleIndex] ?? controlId),
      sourceSurfaces: anchorIndex >= 0 ? normalizeList(cells[anchorIndex] ?? "") : [],
      requiredArtifacts: evidenceIndex >= 0 ? normalizeList(cells[evidenceIndex] ?? "") : [],
      status: normalizeText(cells[statusIndex] ?? "") || "Unknown",
    });
  }

  return rows;
}

function inferReviewCadence(status: EvidenceTemplateStatus): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("partial")) return "monthly";
  if (normalized.includes("missing")) return "monthly";
  if (normalized.includes("needs review")) return "weekly";
  return "quarterly";
}

function inferStaleAfterDays(status: EvidenceTemplateStatus): number {
  const normalized = status.toLowerCase();
  if (normalized.includes("partial")) return 30;
  if (normalized.includes("missing")) return 14;
  if (normalized.includes("needs review")) return 7;
  return 90;
}

function inferTemplateId(controlId: string): string {
  return controlId.trim().toLowerCase();
}

function inferFileTitle(filePath: string): string {
  return filePath
    .replace(/^LYT-\d+-/, "")
    .replace(/[-_]/g, " ")
    .replace(/\.md$/i, "")
    .replace(/\biso27001\b/i, "ISO27001")
    .replace(/\bsoc2\b/i, "SOC2")
    .replace(/\bgdpr\b/i, "GDPR")
    .replace(/\bhipaa\b/i, "HIPAA")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function parseSpecFile(filePath: string, frameworks: readonly string[]): EvidenceTemplate[] {
  const specsRoot = path.resolve(process.cwd(), "docs/spec");
  const fullPath = path.join(specsRoot, filePath);
  let content: string;
  try {
    content = readFileSync(fullPath, "utf8");
  } catch {
    return [];
  }

  const rows = parseMarkdownTableRows(content);
  const familyTitle = inferFileTitle(filePath);

  return rows.map((row) => {
    const rawTitle = row.title || row.controlId;
    const rawSummary = row.summary || familyTitle;
    const isSummaryRedundant = rawSummary === rawTitle;
    const description = CONTROL_PLAIN_ENGLISH_DESCRIPTIONS[row.controlId] ?? (isSummaryRedundant ? "" : rawSummary);
    const summary = isSummaryRedundant ? (description || rawTitle) : rawSummary;
    return {
      templateId: inferTemplateId(row.controlId),
      controlId: row.controlId,
      frameworks: [...frameworks],
      title: rawTitle,
      summary,
      description,
      requiredArtifacts: row.requiredArtifacts,
      optionalArtifacts: [],
      sourceSurfaces: row.sourceSurfaces,
      renderers: ["markdown", "html", "pdf"] as EvidenceRendererKind[],
      ownerRole: README_OWNER,
      reviewCadence: inferReviewCadence(row.status),
      freshnessPolicy: {
        staleAfterDays: inferStaleAfterDays(row.status),
        validationSources: [...row.sourceSurfaces, ...row.requiredArtifacts],
      },
      status: row.status,
    };
  });
}

function buildFallbackTemplates(): EvidenceTemplate[] {
  return [
    {
      templateId: "gdpr-03",
      controlId: "GDPR-03",
      frameworks: ["GDPR"],
      title: "Access control and least privilege",
      summary: "Personal data must be readable only by authorized company members and scoped agents",
      description: CONTROL_PLAIN_ENGLISH_DESCRIPTIONS["GDPR-03"] ?? "Confirms that personal data is accessible only to authorised parties, meeting GDPR data-minimisation and access-control obligations.",
      requiredArtifacts: ["authz deny-path tests", "boundary checks"],
      optionalArtifacts: [],
      sourceSurfaces: ["src/routes/authz.ts", "src/routes/access.ts"],
      renderers: ["markdown", "html", "pdf"],
      ownerRole: README_OWNER,
      reviewCadence: "monthly",
      freshnessPolicy: {
        staleAfterDays: 30,
        validationSources: ["src/routes/authz.ts", "src/routes/access.ts", "authz deny-path tests"],
      },
      status: "In place",
    },
  ];
}

function buildRegistry(): EvidenceTemplate[] {
  const templates = SPEC_FILES.flatMap((spec) => parseSpecFile(spec.path, spec.frameworks));
  if (templates.length > 0) {
    return templates.sort((a, b) => a.controlId.localeCompare(b.controlId));
  }
  return buildFallbackTemplates();
}

const EVIDENCE_TEMPLATE_REGISTRY = buildRegistry();

function sha256ForText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function toIsoDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function renderPdf(lines: string[]): Buffer {
  const escapePdfText = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const content = ["BT", "/F1 11 Tf", "14 TL", "50 760 Td"];
  lines.forEach((line, index) => {
    if (index === 0) {
      content.push(`(${escapePdfText(line)}) Tj`);
      return;
    }
    content.push("T*");
    content.push(`(${escapePdfText(line)}) Tj`);
  });
  content.push("ET");

  const contentStream = content.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(contentStream, "utf8")} >> stream\n${contentStream}\nendstream endobj`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${object}\n`;
  }

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

export function getEvidenceTemplateRegistry() {
  return [...EVIDENCE_TEMPLATE_REGISTRY];
}

function normalizeFrameworkKey(value: string) {
  return value.trim().toLowerCase();
}

function canonicalFrameworkLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function getEvidenceTemplate(controlId: string) {
  const normalized = controlId.trim().toLowerCase();
  return EVIDENCE_TEMPLATE_REGISTRY.find((template) => template.templateId === normalized || template.controlId.toLowerCase() === normalized) ?? null;
}

export function listEvidenceTemplatesByFramework(framework: string) {
  const normalizedFramework = normalizeFrameworkKey(framework);
  if (!normalizedFramework) return [];
  return [...EVIDENCE_TEMPLATE_REGISTRY]
    .filter((template) => template.frameworks.some((candidate) => normalizeFrameworkKey(candidate) === normalizedFramework))
    .sort((left, right) => left.controlId.localeCompare(right.controlId));
}

export function buildEvidencePacket(input: {
  companyId: string;
  controlId: string;
  artifacts?: Array<Partial<Omit<EvidenceArtifact, "createdAt">> & { source?: string; artifactType?: string; createdAt?: string | Date }>;
  notes?: string[];
  exceptions?: string[];
  generatedAt?: Date | string;
}) {
  const template = getEvidenceTemplate(input.controlId);
  if (!template) {
    throw new Error(`Unknown evidence control template: ${input.controlId}`);
  }

  const generatedAt = toIsoDate(input.generatedAt) ?? new Date().toISOString();
  const artifacts: EvidenceArtifact[] = (input.artifacts ?? []).map((artifact, index) => {
    const content = JSON.stringify(artifact, Object.keys(artifact).sort());
    return {
      artifactId: artifact.artifactId ?? `${template.templateId}-artifact-${index + 1}`,
      artifactType: artifact.artifactType ?? "evidence",
      source: artifact.source ?? template.sourceSurfaces[0] ?? template.controlId,
      contentType: artifact.contentType ?? "application/json",
      byteSize: artifact.byteSize ?? Buffer.byteLength(content, "utf8"),
      sha256: artifact.sha256 ?? sha256ForText(content),
      createdAt: toIsoDate(artifact.createdAt) ?? generatedAt,
    };
  });

  const lastValidatedAt = artifacts.reduce<string | null>((latest, artifact) => {
    if (!latest) return artifact.createdAt;
    return artifact.createdAt > latest ? artifact.createdAt : latest;
  }, null);
  const staleAfterMs = template.freshnessPolicy.staleAfterDays * 24 * 60 * 60 * 1000;
  const freshnessBase = lastValidatedAt ? new Date(lastValidatedAt).getTime() : Number.NaN;
  const isStale = Number.isNaN(freshnessBase)
    ? true
    : Date.now() - freshnessBase > staleAfterMs;

  const missingArtifacts = template.requiredArtifacts.filter((required) => {
    const normalizedRequired = required.toLowerCase();
    return !artifacts.some((artifact) => {
      const haystack = [artifact.artifactType, artifact.source, artifact.contentType].join(" ").toLowerCase();
      return haystack.includes(normalizedRequired) || normalizedRequired.includes(artifact.artifactType.toLowerCase());
    });
  });

  return {
    generatedAt,
    companyId: input.companyId,
    controlId: template.controlId,
    frameworks: [...template.frameworks],
    templateId: template.templateId,
    title: template.title,
    status: template.status,
    owner: {
      role: template.ownerRole,
    },
    reviewCadence: template.reviewCadence,
    freshness: {
      lastValidatedAt,
      staleAfter: new Date(Date.now() + staleAfterMs).toISOString(),
      isStale,
    },
    artifacts,
    missingArtifacts,
    notes: input.notes ?? [],
    exceptions: input.exceptions ?? [],
    renderHints: {
      preferredFormats: [...template.renderers],
      sourceSurfaces: [...template.sourceSurfaces],
    },
  } satisfies EvidencePacket;
}

export function renderEvidencePacketMarkdown(packet: EvidencePacket): string {
  const lines = [
    `# ${packet.title}`,
    `Control ID: ${packet.controlId}`,
    `Frameworks: ${packet.frameworks.join(", ")}`,
    `Template ID: ${packet.templateId}`,
    `Status: ${packet.status}`,
    `Owner: ${packet.owner.role}`,
    `Review cadence: ${packet.reviewCadence}`,
    `Freshness: last validated ${packet.freshness.lastValidatedAt ?? "never"}; stale after ${packet.freshness.staleAfter}; stale=${packet.freshness.isStale ? "yes" : "no"}`,
    "",
    "## Evidence inventory",
    ...(packet.artifacts.length > 0
      ? packet.artifacts.map((artifact) => `- ${artifact.artifactType} ← ${artifact.source} (${artifact.contentType}, ${artifact.byteSize} bytes, sha256=${artifact.sha256.slice(0, 12)}…)`)
      : ["- No captured artifacts yet"]),
    "",
    "## Missing artifacts",
    ...(packet.missingArtifacts.length > 0 ? packet.missingArtifacts.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Notes",
    ...(packet.notes.length > 0 ? packet.notes.map((note) => `- ${note}`) : ["- None"]),
    "",
    "## Exceptions",
    ...(packet.exceptions.length > 0 ? packet.exceptions.map((item) => `- ${item}`) : ["- None"]),
    "",
    "## Source surfaces",
    ...packet.renderHints.sourceSurfaces.map((surface) => `- ${surface}`),
  ];
  return lines.join("\n");
}

export function renderEvidencePacketHtml(packet: EvidencePacket): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const list = (items: string[]) => items.map((item) => `<li>${escape(item)}</li>`).join("");
  const artifactList = packet.artifacts.length > 0
    ? packet.artifacts
        .map((artifact) => `<li><code>${escape(artifact.artifactType)}</code> ← ${escape(artifact.source)} (${escape(artifact.contentType)}, ${artifact.byteSize} bytes)</li>`)
        .join("")
    : "<li>No captured artifacts yet</li>";

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${escape(packet.title)}</title></head>
  <body>
    <h1>${escape(packet.title)}</h1>
    <p><strong>Control ID:</strong> ${escape(packet.controlId)}</p>
    <p><strong>Frameworks:</strong> ${escape(packet.frameworks.join(", "))}</p>
    <p><strong>Status:</strong> ${escape(packet.status)}</p>
    <p><strong>Owner:</strong> ${escape(packet.owner.role)}</p>
    <p><strong>Review cadence:</strong> ${escape(packet.reviewCadence)}</p>
    <p><strong>Freshness:</strong> last validated ${escape(packet.freshness.lastValidatedAt ?? "never")}; stale after ${escape(packet.freshness.staleAfter)}; stale=${packet.freshness.isStale ? "yes" : "no"}</p>
    <h2>Evidence inventory</h2>
    <ul>${artifactList}</ul>
    <h2>Missing artifacts</h2>
    <ul>${packet.missingArtifacts.length > 0 ? list(packet.missingArtifacts) : "<li>None</li>"}</ul>
    <h2>Notes</h2>
    <ul>${packet.notes.length > 0 ? list(packet.notes) : "<li>None</li>"}</ul>
    <h2>Exceptions</h2>
    <ul>${packet.exceptions.length > 0 ? list(packet.exceptions) : "<li>None</li>"}</ul>
    <h2>Source surfaces</h2>
    <ul>${list(packet.renderHints.sourceSurfaces)}</ul>
  </body>
</html>`;
}

export function renderEvidencePacketPdf(packet: EvidencePacket): Buffer {
  const lines = [
    `${packet.title} (${packet.controlId})`,
    `Frameworks: ${packet.frameworks.join(", ")}`,
    `Status: ${packet.status}`,
    `Owner: ${packet.owner.role}`,
    `Review cadence: ${packet.reviewCadence}`,
    `Freshness: last validated ${packet.freshness.lastValidatedAt ?? "never"}; stale after ${packet.freshness.staleAfter}; stale=${packet.freshness.isStale ? "yes" : "no"}`,
    "",
    "Artifacts:",
    ...(packet.artifacts.length > 0
      ? packet.artifacts.map((artifact) => `- ${artifact.artifactType} <- ${artifact.source}`)
      : ["- No captured artifacts yet"]),
    "",
    "Missing artifacts:",
    ...(packet.missingArtifacts.length > 0 ? packet.missingArtifacts : ["- None"]),
  ];
  return renderPdf(lines.slice(0, 40));
}

export async function buildCompanyEvidencePacketSummary(db: Db, input: { companyId: string; controlId: string; limit?: number }) {
  const companies = companyService(db);
  const activity = activityService(db);

  const [company, activities] = await Promise.all([
    companies.getById(input.companyId),
    activity.list({ companyId: input.companyId, limit: input.limit ?? 200 }),
  ]);
  if (!company) {
    return null;
  }

  const packet = buildEvidencePacket({
    companyId: input.companyId,
    controlId: input.controlId,
    artifacts: activities
      .filter((item) => /evidence|audit|document|report|backup|restore|policy/i.test(item.action))
      .slice(0, input.limit ?? 10)
      .map((item) => {
        const details = item.details ?? {};
        const detailText = JSON.stringify(details);
        return {
          artifactId: `${item.entityType}-${item.entityId}-${item.action}`,
          artifactType: item.action,
          source: `${item.actorType}:${item.actorId}`,
          contentType: "application/json",
          byteSize: Buffer.byteLength(detailText, "utf8"),
          sha256: sha256ForText(detailText),
          createdAt: item.createdAt,
        };
      }),
    notes: [
      `Company: ${company.name}`,
      `Derived from ${activities.length} recent activity event(s)`,
    ],
  });

  return {
    company,
    packet,
    markdown: renderEvidencePacketMarkdown(packet),
    html: renderEvidencePacketHtml(packet),
    pdf: renderEvidencePacketPdf(packet),
  };
}
