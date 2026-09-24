import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertDesignMapping, compareDesignFacts } from './design-authority-runtime.mjs';

const contract=JSON.parse(fs.readFileSync(new URL('./inbox-visual-contract.json',import.meta.url)));
for(const scenario of contract.scenarios) assert.doesNotThrow(()=>assertDesignMapping(scenario));
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'detail-desktop'}),/unknown Inbox design-authority surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_surface:'inbox-mobile'}),/wrong reviewed A\/B surface/);
assert.throws(()=>assertDesignMapping({...contract.scenarios[0],design_authority_action:'invented-state'}),/unavailable design-authority action/);
const delta=compareDesignFacts({relationships:{first_card_width:400,cards_per_visual_row:2,horizontal_overflow:0}},{relationships:{first_card_width:360,cards_per_visual_row:2,horizontal_overflow:8}});
assert.equal(delta.deltas.first_card_width.delta,-40);
assert.equal(delta.deltas.horizontal_overflow.delta,8);
console.log('INTEGRATED_HOST_DESIGN_FALSIFICATION_PASS mapping_fail_closed=true swapped_surfaces_rejected=true geometry_mutation_detected=true');
