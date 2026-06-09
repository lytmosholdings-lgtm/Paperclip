import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PolicyCreationWizard } from "@/components/PolicyCreationWizard";
import { Badge } from "@/components/ui/badge";

function StoryShell({ children }: { children: ReactNode }) {
  return <div className="space-y-6 p-6">{children}</div>;
}

function PolicyWizardStory() {
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <StoryShell>
      <section className="paperclip-story__frame p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="paperclip-story__label">Policy creation</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Framework-first policy creation wizard</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
              The wizard starts with framework selection, filters the template catalog, then moves into content, ownership,
              and review cadence.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">framework-first</Badge>
            <Badge variant="outline">template-filtering</Badge>
            <Badge variant="outline">stateful</Badge>
            <Badge variant="outline">control-linkage</Badge>
          </div>
        </div>
      </section>

      <section className="paperclip-story__frame overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="paperclip-story__label">PolicyCreationWizard</div>
          <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Create a policy from the right framework</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Select the framework first so the template catalog stays focused and the body draft begins with the right
                baseline.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <PolicyCreationWizard
            companyId="story-company"
            loadFrameworkControls={async (_companyId, framework) => {
              const controlsByFramework: Record<string, Array<{ controlId: string; title: string; summary: string; description: string }>> = {
                SOC2: [
                  {
                    controlId: "SOC2-01",
                    title: "Access review and approval",
                    summary: "Confirm least-privilege access grants and periodic review cadence.",
                    description: "Ensures only authorised users retain access over time — a core SOC2 requirement for preventing privilege creep.",
                  },
                  {
                    controlId: "SOC2-02",
                    title: "Security logging baseline",
                    summary: "Retain and review events needed for investigation and audit readiness.",
                    description: "Captures a tamper-evident record of who did what and when, giving auditors the evidence trail required by SOC2 CC7.",
                  },
                ],
                ISO27001: [
                  {
                    controlId: "ISO27001-01",
                    title: "Asset inventory maintenance",
                    summary: "Keep assets classified, owned, and reviewed against policy.",
                    description: "Maintains an up-to-date record of information assets and their owners, required by ISO27001 A.8.",
                  },
                ],
              };

              return {
                companyId: "story-company",
                framework,
                count: controlsByFramework[framework]?.length ?? 0,
                controlIds: (controlsByFramework[framework] ?? []).map((control) => control.controlId),
                controls: (controlsByFramework[framework] ?? []).map((control) => ({
                  templateId: control.controlId.toLowerCase(),
                  frameworks: [framework],
                  ownerRole: "GRC lead",
                  reviewCadence: "Quarterly",
                  requiredArtifacts: ["policy"],
                  optionalArtifacts: ["evidence packet"],
                  sourceSurfaces: ["policy register"],
                  renderers: ["markdown", "html", "pdf"],
                  freshnessPolicy: {
                    staleAfterDays: 90,
                    validationSources: ["policy register"],
                  },
                  status: "active",
                  ...control,
                })),
              };
            }}
            onSubmit={(submission) => {
              setSubmitted(JSON.stringify(submission, null, 2));
            }}
          />
          {submitted ? (
            <pre className="max-w-full overflow-x-auto rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              {submitted}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">Publish the policy to inspect the payload.</p>
          )}
        </div>
      </section>
    </StoryShell>
  );
}

const meta = {
  title: "Components/Policy Creation Wizard",
  parameters: {
    docs: {
      description: {
        component:
          "Framework-first policy creation with filtered templates, markdown drafting, ownership controls, and publish-time control linkage.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <PolicyWizardStory />,
};
