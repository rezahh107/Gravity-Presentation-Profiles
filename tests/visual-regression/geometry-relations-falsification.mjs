import assert from 'node:assert/strict';
import { physicalHorizontalGap } from './geometry-relations.mjs';

const left = { left: 100, right: 200, top: 20, width: 100 };
const right = { left: 218, right: 318, top: 20, width: 100 };
assert.equal(physicalHorizontalGap(left, right), 18);
assert.equal(physicalHorizontalGap(right, left), 18, 'Reversed/RTL DOM order changed physical horizontal gap.');
const overlap = { left: 180, right: 280, top: 20, width: 100 };
assert.equal(physicalHorizontalGap(left, overlap), -20, 'Overlap must remain observably negative.');
assert.equal(physicalHorizontalGap(left, { ...right, top: 50 }), null, 'Different rows must remain unavailable evidence.');
console.log('GEOMETRY_RELATIONS_FALSIFICATION_PASS reversed_order=18 overlap=-20 unavailable_cross_row=true');