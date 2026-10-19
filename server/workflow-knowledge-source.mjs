import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { knowledgeHref, validateKnowledgeRequest, validateKnowledgeResponse } from "@alamo/agent-workflow-knowledge/contracts";

const sourceFile = new URL('../src/features/workflow/legacy/content/library/documents.v1.json', import.meta.url);
const digest = value => createHash('sha256').update(value).digest('hex');
const stop = new Set('a an and are as at be been by can could do does for from how i in is it me my of on or our should tell that the their them these this to us was we what when where which who will with would you your please'.split(' '));
const words = value => (String(value).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(word => word.length > 1 && !stop.has(word));
const aliases = { sops: 'procedure', sop: 'procedure', procedures: 'procedure', assessors: 'assessor', assessments: 'assessment', handoffs: 'handoff', responsibilities: 'role', duties: 'role', supervisors: 'supervisor' };
const terms = value => [...new Set(words(value).map(word => aliases[word] ?? word))];
const contains = (value, term) => terms(value).includes(term);
const scoreText = (value, query) => query.reduce((score, term) => score + (contains(value, term) ? 1 : 0), 0);
const notFound = () => Object.assign(new Error('This document is unavailable.'), { statusCode: 404, code: 'workflow_document_unavailable' });
const changed = () => Object.assign(new Error('This document has changed. Search again to read the current version.'), { statusCode: 409, code: 'workflow_document_changed' });

export function createWorkflowKnowledgeSource({ load = () => readFile(sourceFile, 'utf8'), now = Date.now } = {}) {
  return { async read(value) {
    const request = validateKnowledgeRequest(value), raw = await load(), library = JSON.parse(raw);
    if (library.schemaVersion !== 1 || library.status !== 'draft-reference-content' || !Array.isArray(library.records) || library.records.length > 1000) throw new Error('Workflow knowledge is unavailable.');
    const query = request.operation === 'search' ? terms(request.query) : [];
    const ranked = library.records.map(record => {
      const { revision, ...source } = record;
      if (revision !== digest(JSON.stringify(source))) throw new Error('Workflow source revision is invalid.');
      return { record, score: (terms(record.title).join(" ") === query.join(" ") ? 40 : 0) + scoreText(record.title, query) * 8 + scoreText(record.summary, query) * 4 + scoreText(record.tags.join(' '), query) * 2 + scoreText(record.body, query) };
    }).filter(item => request.operation === 'read' ? item.record.id === request.documentId : query.length > 0 && item.score > 0)
      .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
    if (request.operation === 'read' && !ranked.length) throw notFound();
    if (request.operation === 'read' && ranked[0].record.revision !== request.expectedRevision) throw changed();
    const selected = ranked.slice(0, request.operation === 'read' ? 1 : 5);
    const documents = selected.map(({ record }) => {
      const sections = record.body.split(/\n\n(?=## )/).map((section, order) => {
        const lines = section.split('\n');
        return { heading: lines.shift().replace(/^#+ /, ''), text: lines.join('\n').trim(), order, score: scoreText(section, query) };
      }).filter(section => section.text);
      // Introductory review status remains in the response; excerpts are source
      // text selected by relevance, never generated guidance or approval.
      const excerpts = sections.sort((a, b) => b.score - a.score || a.order - b.order).slice(0, 3)
        .map(({ heading, text }) => ({ heading, text: text.slice(0, 1800), truncated: text.length > 1800 }));
      return { id: record.id, title: record.title, kind: record.kind, ownerApplication: record.ownerApplication,
        reviewStatus: record.kind === 'procedure' ? 'review' : 'draft', version: String(record.version), updated: record.updated,
        revision: record.revision, href: knowledgeHref(record.id, record.revision), summary: record.summary, excerpts,
        body: request.operation === 'read' ? record.body : null };
    });
    return validateKnowledgeResponse({ version: 1, application: 'workflow', capability: 'workflow.knowledge.read', sourceRevision: digest(raw), observedAt: new Date(now()).toISOString(),
      operation: request.operation, query: request.operation === 'search' ? request.query : null, documents, matchedCount: ranked.length, limited: ranked.length > selected.length,
      notice: 'Draft reference material for staff review. These excerpts are not approved clinical policy, employee assignments or evidence of completed work. Agent skill references do not activate skills.' }, request);
  } };
}
