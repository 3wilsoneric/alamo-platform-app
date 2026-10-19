export interface Lic624FormSection {
  id: string;
  label: string;
  fields: readonly string[];
}

export interface Lic624FormDefinition {
  id: "LIC624";
  revision: string;
  title: string;
  agency: string;
  sections: readonly Lic624FormSection[];
}

export const LIC624_FORM_DEFINITION: Readonly<Lic624FormDefinition>;
export const LIC624_INCIDENT_TYPE_FIELDS: ReadonlyArray<Readonly<{
  key: string;
  label: string;
  source: string;
}>>;
export const LIC624_NOTIFICATION_FIELDS: ReadonlyArray<Readonly<{
  key: string;
  label: string;
}>>;
