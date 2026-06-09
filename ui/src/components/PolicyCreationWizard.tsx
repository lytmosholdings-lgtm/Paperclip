import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { evidenceTemplatesApi, type EvidenceTemplateFrameworkControl } from "../api/evidenceTemplates";
import { toPlainEnglishLabel, lookupTechnicalTerm } from "../lib/evidence-glossary";

export const POLICY_WIZARD_STORAGE_KEY = "paperclip:policy-creation-wizard:v1";

const STEPS = [
  { id: 1, label: "Select framework" },
  { id: 2, label: "Choose template" },
  { id: 3, label: "Customise content" },
  { id: 4, label: "Assign & schedule" },
] as const;

type FrameworkId = "SOC2" | "ISO27001" | "HIPAA" | "PCI-DSS" | "custom";

type WizardTemplate = {
  id: string;
  title: string;
  summary: string;
};

type WizardFramework = {
  id: FrameworkId;
  title: string;
  description: string;
  controlCount: number;
  accent: string;
  templates: WizardTemplate[];
  defaultReviewCadence: string;
};

type WizardState = {
  step: number;
  frameworkId: FrameworkId | null;
  templateId: string | null;
  title: string;
  body: string;
  companyName: string;
  effectiveDate: string;
  reviewDate: string;
  owner: string;
  classification: string;
  reviewCadence: string;
  approvers: string;
};

type Submission = {
  frameworkId: FrameworkId;
  frameworkTitle: string;
  templateId: string;
  templateTitle: string;
  title: string;
  body: string;
  companyName: string;
  effectiveDate: string;
  reviewDate: string;
  owner: string;
  classification: string;
  reviewCadence: string;
  approvers: string;
  controlLinkageSkipped: boolean;
  linkedControls: Array<Pick<EvidenceTemplateFrameworkControl, "controlId" | "title" | "summary">>;
};

type CompanyProfileDefaults = {
  name?: string | null;
  companyName?: string | null;
};

type SessionContextDefaults = {
  userName?: string | null;
  currentUserName?: string | null;
  userDisplayName?: string | null;
  currentUserDisplayName?: string | null;
  roles?: string[];
  currentUserRoles?: string[];
};

type PublishErrorState =
  | {
      kind: "approval-chain-missing";
      statusMsg: string;
    }
  | {
      kind: "generic";
      statusMsg: string;
    };

type PolicyCreationWizardProps = {
  companyId?: string;
  canSkipApproval?: boolean;
  companyProfile?: CompanyProfileDefaults | null;
  sessionContext?: SessionContextDefaults | null;
  onSubmit: (submission: Submission) => void | Promise<void>;
  loadFrameworkControls?: typeof evidenceTemplatesApi.listFrameworkControls;
};

const FRAMEWORKS: WizardFramework[] = [
  {
    id: "SOC2",
    title: "SOC2",
    description: "Operational security, access control, logging, and evidence-first audits.",
    controlCount: 18,
    accent: "bg-sky-500/10 text-sky-700 border-sky-500/30",
    defaultReviewCadence: "Quarterly",
    templates: [
      { id: "soc2-security-policy", title: "Security policy baseline", summary: "Centralise access control, change management, and logging expectations." },
      { id: "soc2-access-control", title: "Access control policy", summary: "Least privilege, approvals, and periodic review requirements." },
    ],
  },
  {
    id: "ISO27001",
    title: "ISO27001",
    description: "Risk treatment, asset management, supplier assurance, and continuous improvement.",
    controlCount: 22,
    accent: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    defaultReviewCadence: "Semi-annual",
    templates: [
      { id: "iso27001-asset-management", title: "Asset management policy", summary: "Ownership, inventory, classification, and disposal rules." },
      { id: "iso27001-risk-treatment", title: "Risk treatment policy", summary: "Risk acceptance, mitigation, and residual risk sign-off." },
    ],
  },
  {
    id: "HIPAA",
    title: "HIPAA",
    description: "Protected health information handling, minimum necessary, and audit logging.",
    controlCount: 16,
    accent: "bg-violet-500/10 text-violet-700 border-violet-500/30",
    defaultReviewCadence: "Annual",
    templates: [
      { id: "hipaa-phi-handling", title: "PHI handling policy", summary: "Minimum necessary access and breach escalation steps." },
      { id: "hipaa-workstation", title: "Workstation security policy", summary: "Session locking, device controls, and remote access safeguards." },
    ],
  },
  {
    id: "PCI-DSS",
    title: "PCI-DSS",
    description: "Cardholder data protection, segmentation, and monitoring controls.",
    controlCount: 14,
    accent: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    defaultReviewCadence: "Quarterly",
    templates: [
      { id: "pci-network-security", title: "Network security policy", summary: "Cardholder data boundaries, segmentation, and firewall reviews." },
      { id: "pci-key-management", title: "Key management policy", summary: "Encryption key custody, rotation, and revocation requirements." },
    ],
  },
  {
    id: "custom",
    title: "Custom",
    description: "A bespoke framework for customer or industry-specific obligations.",
    controlCount: 0,
    accent: "bg-slate-500/10 text-slate-700 border-slate-500/30",
    defaultReviewCadence: "Annual",
    templates: [
      { id: "custom-governance", title: "Governance charter", summary: "Define scope, authority, and review cadence for the custom policy set." },
      { id: "custom-exceptions", title: "Exceptions policy", summary: "Record approvals, expiry, and follow-up requirements for exceptions." },
    ],
  },
];

const DEFAULT_STATE: WizardState = {
  step: 1,
  frameworkId: null,
  templateId: null,
  title: "",
  body: "# Policy draft\n\nDescribe the policy here.",
  companyName: "",
  effectiveDate: "",
  reviewDate: "",
  owner: "",
  classification: "Internal",
  reviewCadence: "Quarterly",
  approvers: "",
};

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addMonthsIsoDate(baseDate: Date, months: number) {
  const next = new Date(baseDate.getTime());
  next.setMonth(next.getMonth() + months);
  return formatIsoDate(next);
}

function resolveCompanyName(profile?: CompanyProfileDefaults | null) {
  const name = profile?.name ?? profile?.companyName ?? "";
  return typeof name === "string" ? name : "";
}

function resolveSessionUserName(session?: SessionContextDefaults | null) {
  const candidate = session?.userDisplayName ?? session?.currentUserDisplayName ?? session?.userName ?? session?.currentUserName ?? "";
  return typeof candidate === "string" ? candidate : "";
}

function hasCisoRole(session?: SessionContextDefaults | null) {
  const roles = [...(session?.roles ?? []), ...(session?.currentUserRoles ?? [])].map((role) => role.trim().toLowerCase());
  return roles.includes("ciso");
}

function buildSmartDefaults(profile?: CompanyProfileDefaults | null, session?: SessionContextDefaults | null): Partial<WizardState> {
  const today = new Date();
  const effectiveDate = formatIsoDate(today);
  return {
    companyName: resolveCompanyName(profile),
    effectiveDate,
    reviewDate: addMonthsIsoDate(today, 12),
    owner: hasCisoRole(session) ? resolveSessionUserName(session) : resolveSessionUserName(session),
    classification: "Internal",
  };
}

function createFreshState(profile?: CompanyProfileDefaults | null, session?: SessionContextDefaults | null): WizardState {
  return {
    ...DEFAULT_STATE,
    ...buildSmartDefaults(profile, session),
  };
}

function frameworkById(frameworkId: FrameworkId | null) {
  return FRAMEWORKS.find((framework) => framework.id === frameworkId) ?? null;
}

function templateById(frameworkId: FrameworkId | null, templateId: string | null) {
  const framework = frameworkById(frameworkId);
  if (!framework) return null;
  return framework.templates.find((template) => template.id === templateId) ?? null;
}

function loadState(): WizardState | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(POLICY_WIZARD_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      step: Number.isFinite(parsed.step) ? Math.max(1, Math.min(4, Number(parsed.step))) : DEFAULT_STATE.step,
      frameworkId: parsed.frameworkId && FRAMEWORKS.some((framework) => framework.id === parsed.frameworkId)
        ? parsed.frameworkId
        : DEFAULT_STATE.frameworkId,
      templateId: parsed.templateId ?? DEFAULT_STATE.templateId,
      companyName: typeof parsed.companyName === "string" ? parsed.companyName : DEFAULT_STATE.companyName,
      effectiveDate: typeof parsed.effectiveDate === "string" ? parsed.effectiveDate : DEFAULT_STATE.effectiveDate,
      reviewDate: typeof parsed.reviewDate === "string" ? parsed.reviewDate : DEFAULT_STATE.reviewDate,
      owner: typeof parsed.owner === "string" ? parsed.owner : DEFAULT_STATE.owner,
      classification: typeof parsed.classification === "string" ? parsed.classification : DEFAULT_STATE.classification,
      reviewCadence: typeof parsed.reviewCadence === "string" ? parsed.reviewCadence : DEFAULT_STATE.reviewCadence,
      approvers: typeof parsed.approvers === "string" ? parsed.approvers : DEFAULT_STATE.approvers,
    };
  } catch {
    return null;
  }
}

export function PolicyCreationWizard({
  companyId,
  canSkipApproval = false,
  companyProfile,
  sessionContext,
  onSubmit,
  loadFrameworkControls = evidenceTemplatesApi.listFrameworkControls,
}: PolicyCreationWizardProps) {
  const [state, setState] = useState<WizardState>(() => loadState() ?? createFreshState(companyProfile, sessionContext));
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [suggestedControls, setSuggestedControls] = useState<EvidenceTemplateFrameworkControl[]>([]);
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [controlsLoading, setControlsLoading] = useState(false);
  const [controlsError, setControlsError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<PublishErrorState | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(POLICY_WIZARD_STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const framework = useMemo(() => frameworkById(state.frameworkId), [state.frameworkId]);
  const template = useMemo(() => templateById(state.frameworkId, state.templateId), [state.frameworkId, state.templateId]);

  const filteredTemplates = framework?.templates ?? [];
  const canGoBack = state.step > 1;
  const canGoNext =
    (state.step === 1 && state.frameworkId !== null) ||
    (state.step === 2 && state.templateId !== null) ||
    state.step === 3 ||
    state.step === 4;
  const selectedControlCount = selectedControlIds.length;

  function update(next: Partial<WizardState>) {
    setState((current) => ({ ...current, ...next }));
  }

  function nextStep() {
    setState((current) => ({ ...current, step: Math.min(4, current.step + 1) }));
  }

  function previousStep() {
    setState((current) => ({ ...current, step: Math.max(1, current.step - 1) }));
  }

  function selectFramework(nextFrameworkId: FrameworkId) {
    const nextFramework = frameworkById(nextFrameworkId)!;
    update({
      frameworkId: nextFrameworkId,
      templateId: nextFramework.templates[0]?.id ?? null,
      reviewCadence: nextFramework.defaultReviewCadence,
      title: nextFramework.templates[0]?.title ?? "",
      body: `# ${nextFramework.templates[0]?.title ?? "Policy draft"}\n\nTailor this ${nextFramework.title} policy for the product and operating model.`,
      step: 1,
    });
    setPublishDialogOpen(false);
    setSuggestedControls([]);
    setSelectedControlIds([]);
    setControlsError(null);
    setPublishError(null);
    setControlsLoading(false);
  }

  function selectTemplate(templateId: string) {
    const nextTemplate = templateById(state.frameworkId, templateId);
    update({
      templateId,
      title: nextTemplate?.title ?? state.title,
      body: `# ${nextTemplate?.title ?? state.title}\n\n${framework?.title ?? "Selected"} policy draft tailored to ${nextTemplate?.summary ?? "the selected template"}.`,
    });
  }

  useEffect(() => {
    if (!publishDialogOpen || !framework) return;

    let cancelled = false;
    setControlsLoading(true);
    setControlsError(null);
    setSuggestedControls([]);
    setSelectedControlIds([]);

    if (!companyId) {
      setControlsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    loadFrameworkControls(companyId, framework.id)
      .then((response) => {
        if (cancelled) return;
        const controls = response.controls ?? [];
        setSuggestedControls(controls);
        setSelectedControlIds(controls.map((control) => control.controlId));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setControlsError(error instanceof Error ? error.message : "Unable to load control suggestions.");
        setSuggestedControls([]);
        setSelectedControlIds([]);
      })
      .finally(() => {
        if (!cancelled) {
          setControlsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, framework, loadFrameworkControls, publishDialogOpen]);

  function normalizePublishError(error: unknown): PublishErrorState {
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "Unable to publish policy.";
    if (/approval chain/i.test(message) || /approval workflow/i.test(message) || /no approval/i.test(message)) {
      return {
        kind: "approval-chain-missing",
        statusMsg: message,
      };
    }
    const statusMsg =
      typeof error === "object" && error !== null && "statusMsg" in error && typeof (error as { statusMsg?: unknown }).statusMsg === "string"
        ? ((error as { statusMsg: string }).statusMsg ?? message)
        : message;
    return {
      kind: "generic",
      statusMsg,
    };
  }

  async function publishPolicy(controlLinkageSkipped: boolean) {
    if (!framework || !template) return;

    const linkedControls = suggestedControls
      .filter((control) => selectedControlIds.includes(control.controlId))
      .map((control) => ({
        controlId: control.controlId,
        title: control.title,
        summary: control.summary,
      }));

    setPublishError(null);

    try {
      await Promise.resolve(
        onSubmit({
          frameworkId: framework.id,
          frameworkTitle: framework.title,
          templateId: template.id,
          templateTitle: template.title,
          title: state.title || template.title,
          body: state.body,
          companyName: state.companyName,
          effectiveDate: state.effectiveDate,
          reviewDate: state.reviewDate,
          owner: state.owner,
          classification: state.classification,
          reviewCadence: state.reviewCadence,
          approvers: state.approvers,
          controlLinkageSkipped,
          linkedControls: controlLinkageSkipped ? [] : linkedControls,
        }),
      );
      setPublishDialogOpen(false);
    } catch (error) {
      setPublishError(normalizePublishError(error));
    }
  }

  function setAllControls(selected: boolean) {
    setSelectedControlIds(selected ? suggestedControls.map((control) => control.controlId) : []);
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Policy Register</div>
          <h2 className="text-2xl font-semibold tracking-tight">Framework-first policy creation wizard</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Select a framework first, then filter the template library, customise the content, and finish with owner and
            schedule assignment.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {STEPS.map((step) => (
            <Badge key={step.id} variant={state.step === step.id ? "default" : "outline"}>
              {step.id}
            </Badge>
          ))}
          <span>{state.step} of 4</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {FRAMEWORKS.map((candidate) => {
          const selected = candidate.id === state.frameworkId;
          return (
            <button
              key={candidate.id}
              type="button"
              onClick={() => selectFramework(candidate.id)}
              className={`rounded-lg border p-4 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{candidate.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{candidate.description}</div>
                </div>
                <Badge variant="outline" className={candidate.accent}>
                  {candidate.controlCount} controls
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      {state.step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Select framework</CardTitle>
            <CardDescription>Choose the compliance framework before drafting anything.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Pick one of SOC2, ISO27001, HIPAA, PCI-DSS, or Custom.</span>
          </CardContent>
        </Card>
      ) : null}

      {state.step === 2 && framework ? (
        <Card>
          <CardHeader>
            <CardTitle>Choose a template</CardTitle>
            <CardDescription>{framework.title} templates are filtered to the selected framework.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">{framework.title} templates</div>
            <div className="grid gap-3 md:grid-cols-2">
              {filteredTemplates.map((candidate) => {
                const selected = candidate.id === state.templateId;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => selectTemplate(candidate.id)}
                    className={`rounded-lg border p-4 text-left transition ${selected ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"}`}
                  >
                    <div className="text-sm font-semibold">{candidate.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{candidate.summary}</div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {state.step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Customise content</CardTitle>
            <CardDescription>
              Fine-tune the drafted policy body for the {framework?.title ?? "selected"} policy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block space-y-2 text-sm font-medium">
                <span>Framework</span>
                <input
                  readOnly
                  value={framework?.title ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-2 text-sm font-medium">
                <span>Template</span>
                <input
                  readOnly
                  value={template?.title ?? ""}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block space-y-2 text-sm font-medium">
              <span>Policy title</span>
              <input
                value={state.title}
                onChange={(event) => update({ title: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Policy title"
              />
            </label>
            <textarea
              value={state.body}
              onChange={(event) => update({ body: event.target.value })}
              className="min-h-64 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              placeholder="Draft the policy body"
            />
          </CardContent>
        </Card>
      ) : null}

      {state.step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Assign &amp; schedule</CardTitle>
            <CardDescription>Finish by assigning an owner, cadence, and approver list.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2 text-sm font-medium">
              <span>Company name</span>
              <input
                value={state.companyName}
                onChange={(event) => update({ companyName: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Tenant company name"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Policy owner</span>
              <input
                value={state.owner}
                onChange={(event) => update({ owner: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Security lead"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Effective date</span>
              <input
                type="date"
                value={state.effectiveDate}
                onChange={(event) => update({ effectiveDate: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Review date</span>
              <input
                type="date"
                value={state.reviewDate}
                onChange={(event) => update({ reviewDate: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Classification</span>
              <select
                value={state.classification}
                onChange={(event) => update({ classification: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option>Internal</option>
                <option>Confidential</option>
                <option>Restricted</option>
                <option>Public</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium">
              <span>Review cadence</span>
              <select
                value={state.reviewCadence}
                onChange={(event) => update({ reviewCadence: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option>Quarterly</option>
                <option>Semi-annual</option>
                <option>Annual</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium md:col-span-2">
              <span>Approvers</span>
              <input
                value={state.approvers}
                onChange={(event) => update({ approvers: event.target.value })}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Board owner, GRC lead"
              />
            </label>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {framework ? (
            <span>
              Selected framework: <span className="font-medium text-foreground">{framework.title}</span>
            </span>
          ) : (
            <span>Select a framework to unlock the wizard.</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={previousStep} disabled={!canGoBack}>
            Back
          </Button>
          {state.step < 4 ? (
            <Button type="button" onClick={nextStep} disabled={!canGoNext}>
              Next
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => {
                setPublishError(null);
                setPublishDialogOpen(true);
              }}
              disabled={!framework || !template}
            >
              Publish policy
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={publishDialogOpen}
        onOpenChange={(open) => {
          setPublishDialogOpen(open);
          if (!open) setPublishError(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Map policy to control evidence</DialogTitle>
            <DialogDescription>
              {framework ? (
                <span>
                  This policy maps to {suggestedControls.length} controls in {framework.title}. Accept the suggested
                  mappings, adjust the checkboxes, or skip linkage and publish anyway.
                </span>
              ) : (
                <span>Select a framework before publishing.</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {publishError ? (
              <div
                role="alert"
                className={`rounded-lg border p-4 text-sm ${
                  publishError.kind === "approval-chain-missing"
                    ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {publishError.kind === "approval-chain-missing" ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="space-y-1">
                        <p className="font-semibold">Approval workflow not configured</p>
                        <p>
                          This organisation does not have an approval workflow set up yet. Policies can't be submitted for
                          approval until an admin configures one.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" asChild>
                        <a href="/settings/organisation">Set up approvals →</a>
                      </Button>
                      {canSkipApproval ? (
                        <span className="text-xs text-amber-800 dark:text-amber-200">
                          Publishing without approval will be recorded in the audit trail. This is not recommended for
                          regulated organisations.
                        </span>
                      ) : (
                        <span className="text-xs text-amber-800 dark:text-amber-200">
                          Ask an administrator to configure an approval workflow before publishing.
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p>{publishError.statusMsg}</p>
                )}
              </div>
            ) : null}
            {controlsLoading ? <p className="text-sm text-muted-foreground">Loading control suggestions…</p> : null}
            {companyId ? null : (
              <p className="text-sm text-amber-700">
                No company context was provided, so control suggestions are unavailable.
              </p>
            )}
            {controlsError ? <p className="text-sm text-destructive">{controlsError}</p> : null}

            {!controlsLoading && !controlsError && suggestedControls.length > 0 ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-muted-foreground">
                    {selectedControlCount} of {suggestedControls.length} suggested controls selected.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => setAllControls(true)}>
                      Accept all
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setAllControls(false)}>
                      Reject all
                    </Button>
                  </div>
                </div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {suggestedControls.map((control) => {
                    const checked = selectedControlIds.includes(control.controlId);
                    const plainTitle = toPlainEnglishLabel(control.title);
                    const glossaryEntry = lookupTechnicalTerm(control.title);
                    const displayDescription = control.description || glossaryEntry?.description || control.summary;
                    const isSummaryRedundant = !displayDescription || displayDescription === control.title || displayDescription === plainTitle;
                    return (
                      <label
                        key={control.controlId}
                        className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(nextChecked) => {
                            if (nextChecked === "indeterminate") return;
                            setSelectedControlIds((current) =>
                              nextChecked
                                ? current.includes(control.controlId)
                                  ? current
                                  : [...current, control.controlId]
                                : current.filter((item) => item !== control.controlId),
                            );
                          }}
                          className="mt-1"
                        />
                        <span className="min-w-0 space-y-1">
                          <span className="block font-medium text-foreground">
                            {control.controlId} · {plainTitle}
                          </span>
                          {!isSummaryRedundant && (
                            <span className="block text-xs text-muted-foreground">{displayDescription}</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {!controlsLoading && !controlsError && suggestedControls.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No control suggestions were found for this framework. You can still publish without mappings.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Cancel
            </Button>
            {canSkipApproval ? (
              <Button type="button" variant="outline" onClick={() => publishPolicy(true)}>
                Skip approval and publish directly
              </Button>
            ) : null}
            <Button type="button" onClick={() => publishPolicy(false)} disabled={controlsLoading}>
              Accept mappings &amp; publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
