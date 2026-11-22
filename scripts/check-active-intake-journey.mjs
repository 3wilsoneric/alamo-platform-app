import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { activeIntakeCards, hasCompleteIntakeBoard, intakeStage } from '../shared/admissions-intake.mjs';

// Exercise the restored production classifiers without starting a browser or
// duplicating component logic. No real client data is used by this fixture.
const source = readFileSync('src/features/admissions/components/ActiveIntakeJourney.tsx', 'utf8');
const tree = ts.createSourceFile('journey.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['counts'];
const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map(node => node.getText(tree).replace('export ', '')).join('\n');
const js = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = vm.createContext({}); vm.runInContext(js, context);
const statuses = ['Referral received', 'Assessment scheduled', 'Under review', 'Accepted', 'Awaiting admit', 'Meet the Client not sent', 'Declined', ' DENIED ', 'Admitted', 'Admitted; discharged', 'Did not move in'];
const cards = statuses.map((status, index) => ({ referralId: index, status, column: index === 0 ? 'received' : index === 1 ? 'in_progress' : 'decision' }));
assert.deepEqual(activeIntakeCards({ board: { cards } }).map(card => card.referralId), [0, 1, 2, 3, 4, 5]);
assert.deepEqual(cards.slice(0, 6).map(intakeStage), ['new', 'assessment', 'decision', 'arrival', 'arrival', 'arrival']);
assert.equal(activeIntakeCards({ board: { cards: [] } }).length, 0);
const complete = {board:{cards,total:cards.length,truncated:false},metrics:{activeReferrals:6}};
assert.equal(hasCompleteIntakeBoard(complete),true);
assert.equal(hasCompleteIntakeBoard({...complete,board:{...complete.board,truncated:true}}),false);
assert.equal(hasCompleteIntakeBoard({...complete,board:{...complete.board,total:cards.length+1}}),false);
assert.equal(hasCompleteIntakeBoard({...complete,metrics:{activeReferrals:7}}),false);
assert(source.includes('hasCompleteIntakeBoard(pipeline)') && source.includes('shared/admissions-intake.mjs'),'the visible page must use the tested shared owner');
assert.deepEqual(JSON.parse(JSON.stringify(context.counts([' ', '', 'Alameda', 'alameda'], 'Not recorded'))), [{ label: 'Alameda', count: 2 }, { label: 'Not recorded', count: 2 }]);
console.log('Active intake: admitted/closed exclusions, working stages, accepted aliases, and empty population passed.');
