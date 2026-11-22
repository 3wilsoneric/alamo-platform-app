/** The bookmark used by Carelog's Ally launcher and its conversation header. */
export default function AllyMark({ className = "" }: { className?: string }) {
  return <svg className={`p-ally-mark ${className}`} width="28" height="44" viewBox="0 0 28 44" fill="none" aria-hidden="true" focusable="false">
    <path d="M21 5h2a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4h-2" fill="#FFF8E9" stroke="#073C39" strokeWidth="2" />
    <path d="M6 1.5h12a5 5 0 0 1 5 5v35L12 34 1 41.5v-35a5 5 0 0 1 5-5Z" fill="#F6A45E" stroke="#073C39" strokeWidth="2.5" strokeLinejoin="round" />
    <path d="M8.5 14v4M15.5 14v4" stroke="#073C39" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
