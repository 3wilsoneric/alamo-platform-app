export type CommandCenterSection = "validation" | "runtime" | "modules" | "capabilities" | "workbench";

const SECTIONS: Array<{ id: CommandCenterSection; label: string }> = [
  { id: "validation", label: "Validation coverage" },
  { id: "runtime", label: "Runtime analyst traces" },
  { id: "modules", label: "Module coverage" },
  { id: "capabilities", label: "Analyst capabilities" },
  { id: "workbench", label: "Prompt workbench" }
];

export default function CommandCenterMobileNavigation({
  active,
  onChange
}: {
  active: CommandCenterSection;
  onChange: (section: CommandCenterSection) => void;
}) {
  return (
    <label
      data-command-center-section-navigation="true"
      className="block rounded-[18px] border border-[#ddd4c8] bg-[#fffdfa] p-3 md:hidden"
    >
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#8b7b68]">Diagnostic section</span>
      <select
        value={active}
        onChange={(event) => onChange(event.target.value as CommandCenterSection)}
        className="h-11 w-full border border-[#cfc4b5] bg-white px-3 text-[13px] font-semibold text-[#201a14]"
      >
        {SECTIONS.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
      </select>
    </label>
  );
}
