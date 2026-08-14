import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import type { CertifiedQuestionCatalogItem, CertifiedQuestionVariable } from "../workspaceHomeUtils";

type QuestionVariableSelections = Record<string, Record<string, string>>;

export type CertifiedQuestionRunRequest = {
  prompt: string;
  routeId: string;
};

function getVariableOptions(variable: CertifiedQuestionVariable) {
  return variable.options.map((option) => (
    typeof option === "string" ? { label: option, value: option } : option
  ));
}

function compilePrompt(item: CertifiedQuestionCatalogItem, selections: QuestionVariableSelections) {
  const questionSelections = selections[item.id] ?? {};
  return item.runPrompt.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, variableId: string) => {
    const selectedValue = questionSelections[variableId];
    return selectedValue || `{${variableId}}`;
  });
}

function getReferencedVariableIds(item: CertifiedQuestionCatalogItem) {
  return new Set(
    Array.from(item.runPrompt.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)).map((match) => match[1])
  );
}

function getMissingVariables(item: CertifiedQuestionCatalogItem, selections: QuestionVariableSelections) {
  const questionSelections = selections[item.id] ?? {};
  const referencedVariableIds = getReferencedVariableIds(item);
  return (item.variables ?? []).filter((variable) => (
    referencedVariableIds.has(variable.id) && !questionSelections[variable.id]
  ));
}

function getRequiredVariables(item: CertifiedQuestionCatalogItem) {
  const referencedVariableIds = getReferencedVariableIds(item);
  return (item.variables ?? []).filter((variable) => referencedVariableIds.has(variable.id));
}

function getPlaceholderText(variable: CertifiedQuestionVariable) {
  return String(variable.placeholder ?? variable.label)
    .replace(/^choose\s+/i, "")
    .toLowerCase();
}

function InlineQuestionVariable({
  itemId,
  variable,
  value,
  onSelectionChange
}: {
  itemId: string;
  variable: CertifiedQuestionVariable;
  value: string;
  onSelectionChange: (questionId: string, variableId: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const options = useMemo(() => getVariableOptions(variable), [variable]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = options[selectedIndex]?.label;
  const displayLabel = selectedLabel || getPlaceholderText(variable);
  const width = Math.min(34, Math.max(8, displayLabel.length + 2));

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const positionMenu = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const menuGap = 6;
      const availableWidth = Math.max(180, window.innerWidth - viewportPadding * 2);
      const desiredWidth = Math.min(
        360,
        availableWidth,
        Math.max(rect.width, ...options.map((option) => option.label.length * 8 + 44))
      );
      const desiredHeight = Math.min(320, options.length * 42 + 8);
      const maxLeft = Math.max(viewportPadding, window.innerWidth - desiredWidth - viewportPadding);
      const left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
      const spaceAbove = Math.max(0, rect.top - viewportPadding);
      const openAbove = spaceBelow < Math.min(180, desiredHeight) && spaceAbove > spaceBelow;
      const availableHeight = openAbove
        ? Math.max(0, spaceAbove - menuGap)
        : Math.max(0, spaceBelow - menuGap);
      const maxHeight = Math.max(96, Math.min(desiredHeight, availableHeight));
      const top = openAbove
        ? Math.max(viewportPadding, rect.top - maxHeight - menuGap)
        : Math.min(
            rect.bottom + menuGap,
            window.innerHeight - viewportPadding - maxHeight
          );

      setMenuStyle({
        left,
        top,
        width: desiredWidth,
        maxHeight,
        overscrollBehavior: "contain"
      });
    };

    positionMenu();
    const menu = menuRef.current;
    const menuOptions = menu?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const targetOption = menuOptions?.[Math.max(0, selectedIndex)];
    targetOption?.focus({ preventScroll: true });
    if (menu && targetOption) {
      if (targetOption.offsetTop < menu.scrollTop) {
        menu.scrollTop = targetOption.offsetTop;
      } else if (targetOption.offsetTop + targetOption.offsetHeight > menu.scrollTop + menu.clientHeight) {
        menu.scrollTop = targetOption.offsetTop + targetOption.offsetHeight - menu.clientHeight;
      }
    }
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open, options, selectedIndex]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const moveOptionFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const menuOptions = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
    if (!menuOptions?.length) return;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? menuOptions.length - 1
        : event.key === "ArrowDown"
          ? (index + 1) % menuOptions.length
          : (index - 1 + menuOptions.length) % menuOptions.length;
    menuOptions[nextIndex]?.focus();
  };

  return (
    <span className="relative mx-[0.15em] inline-flex align-baseline" onClick={(event) => event.stopPropagation()}>
      <button
        ref={buttonRef}
        type="button"
        data-question-variable-trigger="true"
        data-question-variable-id={variable.id}
        aria-label={`${variable.label}: ${displayLabel}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={`inline-flex min-h-[28px] items-center justify-between gap-1 border-x-0 border-t-0 border-b bg-transparent px-0 py-0 text-[1em] font-[inherit] leading-[inherit] outline-none transition-colors ${
          value
            ? "border-[#0f8b73] text-[#0f6f5d]"
            : "border-[#8a8a8a] text-[#595959]"
        } hover:border-[#0f8b73] hover:text-[#0f6f5d] focus-visible:border-[#0f8b73] focus-visible:text-[#0f6f5d]`}
        style={{ width: `${width}ch` }}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={variable.label}
          data-question-variable-menu="true"
          className="fixed z-[120] overflow-y-auto border border-[#111111] bg-white p-1 text-[#111111]"
          style={menuStyle}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-question-variable-option={option.value}
                onKeyDown={(event) => moveOptionFocus(event, index)}
                onClick={() => {
                  onSelectionChange(itemId, variable.id, option.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className={`flex w-full items-center gap-2 border-l-2 px-3 py-2 text-left text-[14px] font-medium leading-5 transition-colors ${
                  selected
                    ? "border-[#0f8b73] bg-[#effaf5] text-[#0f6f5d]"
                    : "border-transparent bg-white text-[#333333] hover:border-[#0f8b73] hover:bg-[#f7fbf9] hover:text-[#111111]"
                }`}
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${selected ? "opacity-100" : "opacity-0"}`} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>,
        document.body
      ) : null}
    </span>
  );
}

function TemplatePrompt({
  item,
  selections,
  onSelectionChange
}: {
  item: CertifiedQuestionCatalogItem;
  selections: QuestionVariableSelections;
  onSelectionChange: (questionId: string, variableId: string, value: string) => void;
}) {
  if (!item.variables?.length) return <>{item.prompt}</>;

  const variableById = new Map(item.variables.map((variable) => [variable.id, variable]));
  const parts = item.prompt.split(/(\{[a-zA-Z0-9_-]+\})/g).filter(Boolean);

  return (
    <>
      {parts.map((part, index) => {
        const match = part.match(/^\{([a-zA-Z0-9_-]+)\}$/);
        if (!match) return <span key={`${part}-${index}`}>{part}</span>;

        const variableId = match[1];
        if (!variableId) return <span key={`${part}-${index}`}>{part}</span>;

        const variable = variableById.get(variableId);
        if (!variable) return <span key={`${part}-${index}`}>{part}</span>;

        const value = selections[item.id]?.[variable.id] ?? "";
        return (
          <InlineQuestionVariable
            key={`${variable.id}-${index}`}
            itemId={item.id}
            variable={variable}
            value={value}
            onSelectionChange={onSelectionChange}
          />
        );
      })}
    </>
  );
}

export function CertifiedQuestionGuide({
  categories,
  categoryCounts,
  category,
  query,
  results,
  onCategoryChange,
  onQueryChange,
  onClose,
  onRun,
  compact = false
}: {
  categories: string[];
  categoryCounts: Record<string, number>;
  category: string;
  query: string;
  results: CertifiedQuestionCatalogItem[];
  onCategoryChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  onRun: (request: CertifiedQuestionRunRequest) => void;
  compact?: boolean;
}) {
  const [selections, setSelections] = useState<QuestionVariableSelections>({});
  const [page, setPage] = useState(0);
  const totalCount = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  const selectedCount = category === "All" ? totalCount : categoryCounts[category] ?? 0;
  const pageSize = compact ? 6 : 10;
  const totalPages = Math.max(1, Math.ceil(results.length / pageSize));
  const activePage = Math.min(page, totalPages - 1);
  const pageStart = activePage * pageSize;
  const visibleResults = results.slice(pageStart, pageStart + pageSize);
  const pageEnd = Math.min(results.length, pageStart + visibleResults.length);
  const categoryOptions = ["All", ...categories];
  const emptyCopy = query.trim()
    ? `No questions match “${query.trim()}” in ${category === "All" ? "the menu" : category}.`
    : `No ready questions are listed for ${category}.`;

  useEffect(() => {
    setPage(0);
  }, [category, pageSize, query, results.length]);

  const updateSelection = (questionId: string, variableId: string, value: string) => {
    setSelections((current) => ({
      ...current,
      [questionId]: {
        ...(current[questionId] ?? {}),
        [variableId]: value
      }
    }));
  };

  const runItem = (item: CertifiedQuestionCatalogItem) => {
    if (getMissingVariables(item, selections).length) return;
    onRun({
      prompt: compilePrompt(item, selections),
      routeId: item.id
    });
  };

  return (
    <div
      data-certified-question-guide="true"
      className={`border border-[#d9d9d9] bg-white ${compact ? "p-3" : "p-4 sm:p-5"}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-[#d9d9d9] pb-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
            Question menu
          </div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.035em] text-[#111111]">
            Pick a question.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#111111]"
          aria-label="Close questions"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <label className="sr-only" htmlFor={compact ? "certified-question-search-compact" : "certified-question-search"}>
          Search questions
        </label>
        <div className="flex h-11 items-center gap-2 border border-[#bdbdbd] bg-white px-3 transition-colors focus-within:border-[#0f8b73]">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#595959]" />
          <input
            data-certified-question-search="true"
            id={compact ? "certified-question-search-compact" : "certified-question-search"}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search questions"
            className="min-w-0 flex-1 bg-transparent text-[14px] text-[#111111] outline-none placeholder:text-[#8a8a8a]"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="Question categories">
          {categoryOptions.map((option) => {
            const isActive = category === option;
            const optionCount = option === "All" ? totalCount : categoryCounts[option] ?? 0;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onCategoryChange(option)}
                data-dark-action={isActive ? "true" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 border px-2.5 text-[11px] font-semibold transition-colors ${
                  isActive
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#d9d9d9] bg-white text-[#333333] hover:border-[#0f8b73] hover:text-[#0f8b73]"
                }`}
                aria-pressed={isActive}
              >
                <span>{option}</span>
                <span className={isActive ? "text-white/75" : "text-[#777777]"}>{optionCount}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#595959]">
        <span>
          {results.length
            ? `${results.length} ${query.trim() ? "matching " : ""}${results.length === 1 ? "question" : "questions"}`
            : `${selectedCount} ${selectedCount === 1 ? "question" : "questions"} in ${category === "All" ? "all categories" : category}`}
        </span>
        {results.length > pageSize ? (
          <span className="font-medium text-[#333333]">Page {activePage + 1} of {totalPages}</span>
        ) : null}
      </div>

      <div className={`mt-2 grid gap-0 border-y border-[#d9d9d9] ${compact ? "max-h-[280px] overflow-y-auto pr-1" : ""}`}>
        {visibleResults.length ? visibleResults.map((item) => {
          const missingVariables = getMissingVariables(item, selections);
          const canRun = missingVariables.length === 0;
          const compiledPrompt = compilePrompt(item, selections);
          const hasRequiredVariables = getRequiredVariables(item).length > 0;
          return (
            <div
                key={item.id}
                data-certified-question-button="true"
                data-certified-question-id={item.id}
                data-certified-question-prompt={item.prompt}
                data-certified-question-run-prompt={compiledPrompt}
                onClick={(event: MouseEvent<HTMLDivElement>) => {
                  if ((event.target as HTMLElement).closest("select, button")) return;
                  runItem(item);
                }}
                className="group flex w-full items-center justify-between gap-3 border-x-0 border-b border-t-0 border-[#d9d9d9] bg-white px-2 py-3.5 text-left transition-colors first:border-t-0 last:border-b-0 hover:bg-[#f7fbf9]"
              >
                <div className="min-w-0 flex-1">
                  <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-baseline">
                    <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#737373]">
                      {item.category}
                    </span>
                    <span data-certified-question-prompt-text="true" className="text-[15px] font-semibold leading-6 tracking-normal text-[#111111]">
                      <TemplatePrompt
                        item={item}
                        selections={selections}
                        onSelectionChange={updateSelection}
                      />
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-certified-question-submit="true"
                  onClick={() => runItem(item)}
                  disabled={!canRun}
                  aria-label={canRun
                    ? `Run: ${hasRequiredVariables ? compiledPrompt : item.prompt}`
                    : `Choose ${missingVariables.map((variable) => variable.label).join(", ")} for ${item.prompt}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors group-hover:border-[#0f8b73] group-hover:text-[#0f8b73] disabled:cursor-not-allowed disabled:text-[#bdbdbd] disabled:group-hover:border-[#d9d9d9]"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
            </div>
          );
        }) : (
          <div className="border border-dashed border-[#d9d9d9] bg-white px-4 py-6 text-center text-[13px] leading-5 text-[#595959]">
            <div>{emptyCopy}</div>
            <button
              type="button"
              onClick={() => {
                onQueryChange("");
                onCategoryChange("All");
              }}
              data-dark-action="true"
              className="mt-3 bg-[#111111] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
            >
              Show all questions
            </button>
          </div>
        )}
      </div>
      {results.length > pageSize ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-medium text-[#333333]">
            Showing {pageStart + 1}-{pageEnd}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={activePage === 0}
              className="inline-flex h-9 items-center gap-2 border border-[#d9d9d9] bg-white px-3 text-[13px] font-semibold text-[#111111] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73] disabled:cursor-not-allowed disabled:text-[#a0a0a0] disabled:opacity-60"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous page
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={activePage >= totalPages - 1}
              data-dark-action="true"
              className="inline-flex h-9 items-center gap-2 border border-[#111111] bg-[#111111] px-3 text-[13px] font-semibold text-white transition-colors hover:border-[#0f8b73] hover:bg-[#0f8b73] disabled:cursor-not-allowed disabled:border-[#d9d9d9] disabled:bg-white disabled:text-[#a0a0a0] disabled:opacity-60"
            >
              Next page
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
