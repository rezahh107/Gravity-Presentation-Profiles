// Qualification predicates consume observables only; fixture labels are ground truth.
export function annotate(scenario) {
    const events = scenario.events;
    const initial = events.find(e => e.source === 'gridInitializing');
    const size = events.find(e => e.callback === 'onGridSizeChanged');
    const data = events.find(e => e.callback === 'onFirstDataRendered');
    let apiOrdinal = 0;
    for (const event of events) {
        event.relative = {
            initializing_ms:initial ? event.at-initial.at : null,
            size_ms:size ? event.at-size.at : null,
            data_ms:data ? event.at-data.at : null,
            after_initializing:!!initial && event.sequence>initial.sequence,
            before_size:!!size && event.sequence<size.sequence,
            before_data:data ? event.sequence<data.sequence : null
        };
        if (event.event_type === 'columnEverythingChanged' && event.source === 'api') {
            event.api_ordinal = ++apiOrdinal;
        }
    }
    return scenario;
}
export const apiEvent = e => e.event_type === 'columnEverythingChanged' && e.source === 'api';
export const startupFirst = e => apiEvent(e) && e.api_ordinal === 1 && e.relative.after_initializing
    && e.relative.before_size && e.relative.before_data !== false;
export function signature(e) {
    return {
        type:e.event_type, source:e.source, keys:e.event_keys, sequence:e.sequence,
        api_ordinal:e.api_ordinal,
        order:{after_initializing:e.relative.after_initializing, before_size:e.relative.before_size,
            before_data:e.relative.before_data},
        rows_exist:e.row_count>0, state:e.state, displayed:e.displayed,
        center_viewport:e.center_viewport, center_container:e.center_container,
        pinned_left:e.pinned_left, pinned_right:e.pinned_right, horizontal_range:e.horizontal_range
    };
}
export function evaluate(scenarios) {
    const all = scenarios.flatMap(s => annotate(s).events.map(e => ({scenario:s.scenario, route:s.route, event:e})));
    const positives = all.filter(x => apiEvent(x.event) && x.event.fixture_origin === 'native_restore_fixture');
    const negatives = all.filter(x => apiEvent(x.event) && x.event.fixture_origin.startsWith('unrelated_'));
    const collisions = [];
    for (const p of positives) for (const n of negatives) {
        if (p.route === n.route && startupFirst(p.event) && startupFirst(n.event)
            && JSON.stringify(signature(p.event)) === JSON.stringify(signature(n.event))) {
            collisions.push({positive:p.scenario, negative:n.scenario, route:p.route,
                positive_sequence:p.event.sequence, negative_sequence:n.event.sequence,
                signature:signature(p.event)});
        }
    }
    return {positive_events:positives.length, negative_events:negatives.length,
        predicates:[
            {name:'api_type_source_keys', false_positives:negatives.filter(x=>apiEvent(x.event)).length},
            {name:'first_api_after_initializing_before_size_and_data', false_positives:negatives.filter(x=>startupFirst(x.event)).length},
            {name:'startup_first_plus_effective_state_widths_rows_pin_flex_center_signature', collisions}
        ],
        decision:collisions.length ? 'CANDIDATE_A_DISCRIMINATOR_FALSIFIED' : 'CANDIDATE_A_DISCRIMINATOR_NOT_PROVEN',
        absolute_elapsed_time_authority:'NOT_PROVEN: elapsed milliseconds are scheduling observations, not stable provenance',
        phase2_executed:false};
}
