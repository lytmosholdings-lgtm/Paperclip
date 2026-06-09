const TECHNICAL_TERM_GLOSSARY: Record<string, { label: string; description: string }> = {
  conditionalAccessPolicies: {
    label: "Conditional Access Policies",
    description: "Rules controlling which users can access which systems and under what conditions (e.g. requiring MFA from untrusted locations).",
  },
  servicePrincipalRiskDetections: {
    label: "Service Principal Risk Detections",
    description: "Alerts raised when an application identity shows signs of compromise or unusual behaviour.",
  },
  signInLogs: {
    label: "Sign-in Logs",
    description: "A record of every authentication attempt, used to detect suspicious logins and satisfy access-audit requirements.",
  },
  auditLogs: {
    label: "Audit Logs",
    description: "A chronological record of administrative actions, required for SOC2 and ISO27001 audit trails.",
  },
  users: {
    label: "User Accounts",
    description: "Directory listing of people with access, reviewed periodically to remove stale or over-privileged accounts.",
  },
  groups: {
    label: "Security Groups",
    description: "Collections of users sharing the same access permissions, used to enforce least-privilege access control.",
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
    description: "Machine identities used by applications and services, subject to least-privilege review.",
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
    description: "Just-in-time elevation of admin rights, reducing standing privilege exposure.",
  },
};

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
