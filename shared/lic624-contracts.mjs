export const LIC624_FORM_DEFINITION = Object.freeze({
  id: "LIC624",
  revision: "4/99",
  title: "Unusual Incident/Injury Report",
  agency: "California Department of Social Services - Community Care Licensing Division",
  sections: Object.freeze([
    Object.freeze({
      id: "facility",
      label: "Facility",
      fields: Object.freeze(["Facility name", "Facility file number", "Telephone", "Address", "City, state, ZIP"])
    }),
    Object.freeze({
      id: "people",
      label: "People involved",
      fields: Object.freeze(["Client or resident", "Date occurred", "Age", "Sex", "Date of admission", "Observers"])
    }),
    Object.freeze({
      id: "incident",
      label: "Incident",
      fields: Object.freeze(["Incident types", "Event narrative", "Immediate action"])
    }),
    Object.freeze({
      id: "response",
      label: "Treatment and follow-up",
      fields: Object.freeze(["Medical treatment necessary", "Treatment", "Where administered", "Administered by", "Follow-up treatment", "Planned action", "Supervisor comments", "Attending physician"])
    }),
    Object.freeze({
      id: "review",
      label: "Submission and notification",
      fields: Object.freeze(["Submitted by", "Reviewed or approved by", "Submission dates", "Agencies and individuals notified"])
    })
  ])
});

export const LIC624_INCIDENT_TYPE_FIELDS = Object.freeze([
  Object.freeze({ key: "unauthorized_absence", label: "Unauthorized absence", source: "Type of Incident" }),
  Object.freeze({ key: "aggressive_self", label: "Aggressive act / self", source: "Incident2" }),
  Object.freeze({ key: "aggressive_client", label: "Aggressive act / another client", source: "Incident3" }),
  Object.freeze({ key: "aggressive_staff", label: "Aggressive act / staff", source: "Incident4" }),
  Object.freeze({ key: "aggressive_family_visitor", label: "Aggressive act / family or visitor", source: "Incident5" }),
  Object.freeze({ key: "rights_violation", label: "Alleged violation of rights", source: "Incident6" }),
  Object.freeze({ key: "abuse_sexual", label: "Alleged client abuse - sexual", source: "alleged client abuse" }),
  Object.freeze({ key: "abuse_physical", label: "Alleged client abuse - physical", source: "Alleged Client Abuse2" }),
  Object.freeze({ key: "abuse_psychological", label: "Alleged client abuse - psychological", source: "Alleged Client Abuse3" }),
  Object.freeze({ key: "abuse_financial", label: "Alleged client abuse - financial", source: "Alleged Client Abuse4" }),
  Object.freeze({ key: "abuse_neglect", label: "Alleged client abuse - neglect", source: "Alleged Client Abuse5" }),
  Object.freeze({ key: "rape", label: "Rape", source: "Alleged Client Abuse6" }),
  Object.freeze({ key: "pregnancy", label: "Pregnancy", source: "Alleged Client Abuse7" }),
  Object.freeze({ key: "suicide_attempt", label: "Suicide attempt", source: "Alleged Client Abuse8" }),
  Object.freeze({ key: "abuse_other", label: "Other alleged client abuse", source: "Alleged Client Abuse9" }),
  Object.freeze({ key: "injury_accident", label: "Injury - accident", source: "Client Abuse10" }),
  Object.freeze({ key: "injury_unknown", label: "Injury - unknown origin", source: "Client Abuse11" }),
  Object.freeze({ key: "injury_client", label: "Injury - from another client", source: "Client Abuse12" }),
  Object.freeze({ key: "injury_behavior", label: "Injury - from behavior episode", source: "Client Abuse13" }),
  Object.freeze({ key: "epidemic_outbreak", label: "Epidemic outbreak", source: "Client Abuse14" }),
  Object.freeze({ key: "hospitalization", label: "Hospitalization", source: "Client Abuse15" }),
  Object.freeze({ key: "medical_emergency", label: "Medical emergency", source: "Client Abuse16" }),
  Object.freeze({ key: "other_sexual_incident", label: "Other sexual incident", source: "Client Abuse17" }),
  Object.freeze({ key: "theft", label: "Theft", source: "Client Abuse18" }),
  Object.freeze({ key: "fire", label: "Fire", source: "Client Abuse19" }),
  Object.freeze({ key: "property_damage", label: "Property damage", source: "Client Abuse20" }),
  Object.freeze({ key: "other", label: "Other", source: "Client Abuse21" })
]);
