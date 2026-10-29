import assert from 'node:assert/strict';
import {N153_WORKPLACES,workplaceLabel,accountSiteLabel} from '../workplaces.js';
assert.equal(N153_WORKPLACES.length,11);assert.equal(new Set(N153_WORKPLACES).size,11);
assert.equal(workplaceLabel({site:'N153'}),'Sede da assegnare');
for(const workplace of N153_WORKPLACES)assert.equal(workplaceLabel({site:'N153',workplace}),workplace);
assert.equal(workplaceLabel({site:'N148',workplace:N153_WORKPLACES[0]}),'');
assert.match(accountSiteLabel({site:'N153',workplace:N153_WORKPLACES[0]}),/N153 · Corte d’Appello — Tribunale Penale Lecce/);
console.log('PASS 11 unique workplaces, unassigned state, CDC separation and worker labels');
