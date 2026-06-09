import { api } from "./client";

export type EvidenceTemplateFrameworkControl = {
  templateId: string;
  controlId: string;
  frameworks: string[];
  title: string;
  summary: string;
  description: string;
  requiredArtifacts: string[];
  optionalArtifacts: string[];
  sourceSurfaces: string[];
  renderers: Array<"markdown" | "html" | "pdf">;
  ownerRole: string;
  reviewCadence: string;
  freshnessPolicy: {
    staleAfterDays: number;
    validationSources: string[];
  };
  status: string;
};

export type FrameworkControlSuggestionsResponse = {
  companyId: string;
  framework: string;
  count: number;
  controlIds: string[];
  controls: EvidenceTemplateFrameworkControl[];
};

export const evidenceTemplatesApi = {
  listFrameworkControls: (companyId: string, framework: string) =>
    api.get<FrameworkControlSuggestionsResponse>(
      `/companies/${companyId}/evidence-templates/frameworks/${encodeURIComponent(framework)}/controls`,
    ),
};
