import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type GlossaryEntry = {
  term: string;
  definition: string;
};

const GLOSSARY_PAGE_SIZE = 6;

const glossaryEntries: GlossaryEntry[] = [
  {
    term: "Active Residents",
    definition:
      "Residents currently counted in the live operating census after exclusions such as discharged records and non-active placements are removed."
  },
  {
    term: "Census",
    definition:
      "The resident count for a community or the portfolio during a reporting period."
  },
  {
    term: "Occupancy",
    definition:
      "The filled share of available capacity for a facility or group of facilities."
  },
  {
    term: "is_active_final",
    definition:
      "The computed resident flag for admitted residents who have not been discharged. Residents on temporary leave remain active and included."
  },
  {
    term: "Leave of Absence",
    definition:
      "A resident status indicating temporary absence from the facility while preserving residency context."
  },
  {
    term: "Incident Volume",
    definition: "The count of incidents recorded during a selected reporting period."
  },
  {
    term: "Incident Category",
    definition:
      "The normalized incident grouping used to compare similar event types across communities."
  },
  {
    term: "Length of Stay",
    definition:
      "The number of days between resident admit date and the current reporting date."
  },
  {
    term: "Average Length of Stay",
    definition: "The mean days in residence across the selected active population."
  },
  {
    term: "Documentation Gap",
    definition:
      "A lag between the current date and the latest required resident note or documentation event."
  },
  {
    term: "Last Note Date",
    definition:
      "The most recent recorded note date used for documentation gap calculations."
  },
  {
    term: "Medication Compliance",
    definition:
      "The percentage of scheduled medication administrations that were successfully given."
  },
  {
    term: "Refusal Rate",
    definition:
      "The percentage of scheduled medication opportunities marked as refused."
  },
  {
    term: "Not Given",
    definition:
      "Scheduled medication administrations that were not completed for any tracked reason."
  },
  {
    term: "Reporting Period",
    definition:
      "The month or snapshot period used as the basis for a report or dashboard calculation."
  },
  {
    term: "Snapshot",
    definition:
      "The published platform data package generated from the daily Databricks pipeline and served to the app."
  },
  {
    term: "Generated At",
    definition:
      "The timestamp when the published snapshot or report artifact was produced."
  }
];

function Pagination({
  currentPage,
  totalPages,
  onChange
}: {
  currentPage: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="mt-5 flex items-center justify-between gap-3 border-t border-[#d9d9d9] pt-4" aria-label="Glossary pages">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="border border-[#b3b3b3] bg-white px-4 py-2 text-[13px] font-semibold text-[#333] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>
      <div className="text-[13px] text-[#595959]">
        Page {currentPage} of {totalPages}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="border border-[#b3b3b3] bg-white px-4 py-2 text-[13px] font-semibold text-[#333] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73] disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}

export default function GlossaryPage() {
  const [query, setQuery] = useState("");
  const [glossaryPage, setGlossaryPage] = useState(1);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredGlossaryEntries = useMemo(() => {
    if (!normalizedQuery) return glossaryEntries;

    return glossaryEntries.filter((entry) =>
      [entry.term, entry.definition]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  useEffect(() => {
    setGlossaryPage(1);
  }, [normalizedQuery]);

  const glossaryTotalPages = Math.max(
    1,
    Math.ceil(filteredGlossaryEntries.length / GLOSSARY_PAGE_SIZE)
  );

  const visibleGlossaryEntries = filteredGlossaryEntries.slice(
    (glossaryPage - 1) * GLOSSARY_PAGE_SIZE,
    glossaryPage * GLOSSARY_PAGE_SIZE
  );

  return (
    <div className="mx-auto max-w-[1328px] bg-white text-[#111]">
      <header className="border-b-2 border-[#111] pb-4">
        <h1 className="font-serif text-[32px] font-semibold leading-none tracking-[-0.025em]">Glossary</h1>
      </header>

      <div className="border-b border-[#d9d9d9] py-5">
        <div className="max-w-[620px]">
          <label className="flex h-12 items-center gap-3 border border-[#b3b3b3] bg-white px-4 focus-within:border-[#0f8b73] focus-within:ring-1 focus-within:ring-[#0f8b73]">
            <Search className="h-4 w-4 text-[#0f8b73]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search words and definitions..."
              className="w-full border-0 bg-transparent text-[15px] text-[#111] outline-none placeholder:text-[#737373]"
            />
          </label>
        </div>
      </div>

        <div>
          {visibleGlossaryEntries.length ? (
            visibleGlossaryEntries.map((entry) => (
              <div
                key={entry.term}
                className="grid gap-1 border-b border-[#d9d9d9] py-5 md:grid-cols-[minmax(250px,320px)_minmax(0,1fr)] md:gap-12"
              >
                <h2 className="break-words font-serif text-[20px] font-semibold leading-6 tracking-[-0.02em] text-[#111]">
                  {entry.term}
                </h2>
                <p className="text-[15px] leading-6 text-[#4d4d4d]">{entry.definition}</p>
              </div>
            ))
          ) : (
            <div className="border-b border-[#d9d9d9] px-2 py-12 text-center text-[15px] leading-6 text-[#595959]">
              No glossary entries matched that search yet.
            </div>
          )}
        </div>

        <Pagination
          currentPage={glossaryPage}
          totalPages={glossaryTotalPages}
          onChange={setGlossaryPage}
        />
    </div>
  );
}
