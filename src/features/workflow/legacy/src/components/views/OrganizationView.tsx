'use client'

import { useState, type FormEvent } from 'react'
import { ArrowRight, ArrowUpRight, Building2, CornerDownLeft, MessageSquareText, Search, UsersRound, X } from 'lucide-react'
import {
  answerOrgQuestion,
  COMMUNITY_FUNCTIONS,
  ORG_AREAS,
  ORG_COMMUNITIES,
  type OrgAnswer,
} from '../../../../org-model'
import './organization.css'

type Mode = 'map' | 'ask'
type Exchange = { question: string; answer: OrgAnswer }

const STARTER_QUESTIONS = [
  'How are communities connected?',
  'Who supports staffing?',
  'Show San Pablo',
]

function NetworkIllustration() {
  return (
    <svg className="org-hero-art" viewBox="0 0 500 250" fill="none" aria-hidden="true">
      <path d="M250 35v36M71 136v43M160 136v43M250 136v43M340 136v43M429 136v43" stroke="#A9C4C2" strokeWidth="1.3" opacity=".63" />
      <path d="M71 136V99q0-9 9-9h340q9 0 9 9v37M160 136V90M250 136V90M340 136V90" stroke="#A9C4C2" strokeWidth="1.3" opacity=".63" />
      <path d="M71 178h358" stroke="#C7A169" strokeWidth="1.3" opacity=".6" />
      <circle cx="250" cy="33" r="18" fill="#1D675D" stroke="#9BC8AD" strokeWidth="1.5" />
      <circle cx="250" cy="33" r="5" fill="#DCF3E5" />
      {[71, 160, 250, 340, 429].map((x, index) => <g key={x}>
        <rect x={x - 29} y="132" width="58" height="43" rx="8" fill={index === 2 ? '#D8E9E3' : '#F3F0E8'} opacity=".94" />
        <circle cx={x} cy="147" r="5" fill={index === 2 ? '#16645C' : '#B0784E'} />
        <path d={`M${x - 10} 162h20`} stroke="#60777A" strokeWidth="2" strokeLinecap="round" />
      </g>)}
      {[104, 177, 250, 323, 396].map((x) => <g key={x}>
        <path d={`M${x} 178v24`} stroke="#C7A169" strokeWidth="1.3" opacity=".6" />
        <circle cx={x} cy="209" r="8" fill="#F3F0E8" stroke="#C7A169" strokeWidth="1.5" />
      </g>)}
      <circle cx="33" cy="39" r="2" fill="#A9C4C2" opacity=".4" /><circle cx="455" cy="42" r="3" fill="#A9C4C2" opacity=".4" />
    </svg>
  )
}

export default function OrganizationView() {
  const [mode, setMode] = useState<Mode>('map')
  const [selectedId, setSelectedId] = useState('operations')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])

  const selectedArea = ORG_AREAS.find((area) => area.id === selectedId)
  const selectedCommunity = ORG_COMMUNITIES.find((site) => `community:${site.id}` === selectedId)
  const search = query.trim().toLowerCase()
  const visibleAreas = ORG_AREAS.filter((area) =>
    [area.title, area.description, ...area.responsibilities].join(' ').toLowerCase().includes(search),
  )
  const visibleCommunities = ORG_COMMUNITIES.filter((site) =>
    [site.title, site.label, site.code].join(' ').toLowerCase().includes(search),
  )

  function ask(question: string) {
    const clean = question.trim()
    if (!clean) return
    const answer = answerOrgQuestion(clean)
    setExchanges((current) => [...current, { question: clean, answer }])
    setDraft('')
    setMode('ask')
    if (answer.nodeId) setSelectedId(answer.nodeId)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    ask(draft)
  }

  function openSelectedInChat() {
    ask(selectedCommunity ? `Show ${selectedCommunity.title}` : `What does ${selectedArea?.title ?? 'this area'} do?`)
  }

  return (
    <div className="org-page">
      <div className="org-frame">
        <header className={`org-hero ${mode === 'ask' ? 'org-hero--compact' : ''}`}>
          <div className="org-hero-copy">
            <span className="org-kicker"><span className="org-kicker-line" /> ORGANIZATION / WORKFLOW</span>
            {mode === 'ask' ? <h1>Ask the <em>organization.</em></h1> : <h1>Organization <em>map.</em></h1>}
            <p>{mode === 'ask' ? 'Find the right community or function without guessing.' : 'Executive functions, communities, and how their work connects.'}</p>
          </div>
          <NetworkIllustration />
          <span className="org-hero-index">STRUCTURE / 01—05</span>
        </header>

        <div className="org-bar">
          <div className="org-mode-switch" role="tablist" aria-label="Organization view">
            <button type="button" role="tab" aria-selected={mode === 'map'} className={mode === 'map' ? 'active' : ''} onClick={() => setMode('map')}><UsersRound size={16} /> Organization map</button>
            <button type="button" role="tab" aria-selected={mode === 'ask'} className={mode === 'ask' ? 'active' : ''} onClick={() => setMode('ask')}><MessageSquareText size={16} /> Ask organization</button>
          </div>
          <div className="org-bar-status"><span /> FUNCTIONAL PREVIEW <span className="org-bar-divider">/</span> NO VERIFIED REPORTING LINES</div>
        </div>

        {mode === 'map' ? (
          <div className="org-layout">
            <div className="org-map-column">
              <div className="org-map-toolbar">
                <div><span className="org-section-index">01 / THE STRUCTURE</span><h2>Organization map</h2></div>
                <label className="org-search"><Search size={17} /><input aria-label="Find a function or community" placeholder="Find a function or community" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>
              </div>

              <div className="org-map-canvas">
                <div className="org-root-node"><span className="org-root-emblem"><Building2 size={20} /></span><span><small>THE ORGANIZATION</small><strong>Alamo Health Management</strong></span></div>
                <div className="org-root-stem" aria-hidden="true" />
                <div className="org-lane-heading"><span>EXECUTIVE FUNCTIONS</span><span>05 AREAS</span></div>
                <div className={`org-area-grid ${search ? 'org-area-grid--filtered' : ''}`}>
                  {visibleAreas.map((area) => (
                    <button type="button" key={area.id} className={`org-area-card org-tone-${area.tone} ${selectedId === area.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(area.id)} aria-pressed={selectedId === area.id}>
                      <span className="org-card-top"><span className="org-card-marker">{area.marker}</span><ArrowUpRight size={15} /></span>
                      <span className="org-card-glyph" aria-hidden="true"><span /><span /><span /></span>
                      <strong>{area.shortTitle}</strong>
                      <small>{area.responsibilities[0]}</small>
                    </button>
                  ))}
                  {visibleAreas.length === 0 && <p className="org-no-results">No executive function matches that search.</p>}
                </div>

                <div className="org-connection" aria-hidden="true"><span /><span>SHARED SUPPORT</span><span /></div>
                <div className="org-lane-heading"><span>COMMUNITIES</span><span>05 SITES</span></div>
                <div className="org-community-grid">
                  {visibleCommunities.map((site, index) => (
                    <button type="button" key={site.id} className={`org-community-card ${selectedId === `community:${site.id}` ? 'is-selected' : ''}`} onClick={() => setSelectedId(`community:${site.id}`)} aria-pressed={selectedId === `community:${site.id}`}>
                      <span className="org-site-illustration" aria-hidden="true"><span className="org-site-roof" /><span className="org-site-building"><i /><i /><i /></span><span className="org-site-ground" /></span>
                      <span className="org-site-meta"><small>COMMUNITY {String(index + 1).padStart(2, '0')}</small><strong>{site.title}</strong><span>Care delivery site <ArrowRight size={13} /></span></span>
                    </button>
                  ))}
                  {visibleCommunities.length === 0 && <p className="org-no-results">No community matches that search.</p>}
                </div>
                <p className="org-map-caption">Community names come from Platform’s facility list. Connections describe functional support, not confirmed reporting relationships.</p>
              </div>
            </div>

            <aside className="org-detail" aria-live="polite">
              <div className={`org-detail-icon ${selectedArea ? `org-tone-${selectedArea.tone}` : 'org-tone-blue'}`} aria-hidden="true">{selectedCommunity ? <Building2 size={23} strokeWidth={1.5} /> : <UsersRound size={23} strokeWidth={1.5} />}</div>
              <div className="org-detail-copy">
                <div className="org-detail-heading"><span>SELECTED {selectedCommunity ? 'COMMUNITY' : 'FUNCTION'}</span><span className="org-detail-number">{selectedCommunity?.code ?? selectedArea?.marker}</span></div>
                <h3>{selectedCommunity?.title ?? selectedArea?.title}</h3>
                <p>{selectedCommunity ? 'Care-delivery community. Team functions are shown here; personnel and reporting lines are not verified.' : selectedArea?.description}</p>
              </div>
              <div className="org-detail-focus">
                <span className="org-detail-label">{selectedCommunity ? 'TEAM FUNCTIONS' : 'FOCUS AREAS'}</span>
                <ul>{(selectedCommunity ? COMMUNITY_FUNCTIONS : selectedArea?.responsibilities ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              <button type="button" className="org-detail-ask" onClick={openSelectedInChat}>Ask about this <ArrowUpRight size={16} /></button>
            </aside>
          </div>
        ) : (
          <div className="org-chat-layout">
            <div className="org-chat-main">
              {exchanges.length === 0 ? (
                <div className="org-chat-empty"><span className="org-section-index">02 / ASK THE ORGANIZATION</span><div className="org-chat-mark"><MessageSquareText size={25} /></div><h2>Where does this work go?</h2><p>Ask about a community or function. Answers stay grounded in this preview directory.</p><div className="org-suggestions">{STARTER_QUESTIONS.map((question) => <button type="button" key={question} onClick={() => ask(question)}>{question}<ArrowUpRight size={15} /></button>)}</div></div>
              ) : (
                <div className="org-conversation" aria-live="polite">{exchanges.map((exchange, index) => <div className="org-exchange" key={`${exchange.question}-${index}`}><div className="org-question"><span>YOU / {String(index + 1).padStart(2, '0')}</span><p>{exchange.question}</p></div><div className="org-answer"><span className="org-answer-mark"><MessageSquareText size={17} /></span><div><small>ORGANIZATION PREVIEW</small><h3>{exchange.answer.heading}</h3><p>{exchange.answer.body}</p>{exchange.answer.nodeId && <button type="button" onClick={() => { setSelectedId(exchange.answer.nodeId!); setMode('map') }}>Show on map <ArrowUpRight size={15} /></button>}</div></div></div>)}</div>
              )}
              <form className="org-composer" onSubmit={handleSubmit}><label htmlFor="org-question-input">ASK ABOUT A ROLE, FUNCTION, OR COMMUNITY</label><div><input id="org-question-input" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Who supports staffing across communities?" maxLength={220} /><button type="submit" disabled={!draft.trim()} aria-label="Ask organization"><CornerDownLeft size={18} /></button></div><p>Preview answers only. No employee assignments or contact details are available.</p></form>
            </div>
            <aside className="org-chat-side"><span className="org-section-index">EXPLORE THE MAP</span><h3>Start with a place or a function.</h3><p>Choose a question, or name any of the five communities and executive areas.</p><div className="org-chat-side-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div><div className="org-chat-side-prompts">{(exchanges.at(-1)?.answer.related ?? STARTER_QUESTIONS).map((question) => <button type="button" key={question} onClick={() => question === 'View functional map' ? setMode('map') : ask(question)}>{question}<ArrowRight size={15} /></button>)}</div><button className="org-back-map" type="button" onClick={() => setMode('map')}>Open organization map <ArrowUpRight size={16} /></button></aside>
          </div>
        )}
      </div>
    </div>
  )
}
