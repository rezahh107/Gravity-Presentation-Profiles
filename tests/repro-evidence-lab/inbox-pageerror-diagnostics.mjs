import { createHash } from 'node:crypto';

// Evidence-only instrumentation; it never changes navigation, native state, or pageerror gates.
// Query strings, cookies, bodies and private response payloads are intentionally excluded.
function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.origin + url.pathname;
  } catch {
    return '[unavailable]';
  }
}
function safeStack(value) {
  return String(value || '').replace(/https?:\/\/[^\s)]+/g, match => safeUrl(match)).slice(0, 2400);
}
function signature(buffer) {
  const prefix = buffer.subarray(0, 128).toString('utf8').trimStart();
  const tag = /^<(?:!doctype\s+)?([a-z][\w-]*)/i.exec(prefix);
  return {
    byte_length: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    safe_prefix: tag ? '<' + tag[1].toLowerCase() + ' … [redacted]' : '[non-HTML prefix redacted]',
  };
}
export async function instrumentInboxPage(page, report, identity) {
  const state = { route: identity.route, phase: identity.phase || 'before-navigation' };
  const scripts = new Map();
  const outstanding = [];
  const resources = [];
  const result = {
    route: identity.route, execution: identity.execution || 'gpp', pageerrors: [],
    exceptions: [], script_responses: [], script_catalog: [],
    debugger: 'NOT_ATTACHED', failed_parse_scripts: [], diagnostic_errors: [],
  };
  report.probes.push(result);
  const phase = name => { state.phase = name; };
  page.on('pageerror', error => {
    // PageError is retained by the original gate independently; this only records provenance.
    result.pageerrors.push({
      route: state.route, phase: state.phase, document: safeUrl(page.url()),
      message: String(error).slice(0, 400), stack: safeStack(error?.stack),
      ordinal: result.pageerrors.length + 1, observed_at_ms: Date.now(),
    });
  });
  page.on('response', response => {
    const type = response.request().resourceType();
    if (!['script', 'xhr', 'fetch'].includes(type)) return;
    const headers = response.headers();
    const mime = (headers['content-type'] || '[missing]').split(';')[0].toLowerCase();
    // A fetch/eval path can parse HTML as JS without a script-tag request.
    // Capture only suspicious non-script resources, never arbitrary API bodies.
    if (type !== 'script' && !/html|xml/.test(mime) && response.status() < 400) return;
    const record = {
      route: state.route, phase: state.phase, document: safeUrl(page.url()),
      url: safeUrl(response.url()), status: response.status(), mime,
      request_resource_type: type,
    };
    result.script_responses.push(record);
    resources.push({ response, record });
    if (!/javascript|ecmascript/.test(mime) || response.status() >= 400) {
      outstanding.push((async () => {
        try { record.response_signature = signature(await response.body()); }
        catch (e) { record.signature_error = String(e).slice(0, 120); }
      })());
    }
  });
  try {
    const session = await page.context().newCDPSession(page);
    session.on('Debugger.scriptParsed', params => {
      scripts.set(params.scriptId, {
        url: params.url ? safeUrl(params.url) : '[inline-or-evaluated]',
        start_line: params.startLine, start_column: params.startColumn,
        execution_context_id: params.executionContextId,
      });
    });
    // SyntaxError may prevent scriptParsed entirely. Failed-to-parse events
    // are therefore authoritative correlation candidates, not an optional log.
    session.on('Debugger.scriptFailedToParse', params => {
      const source = {
        route: state.route, phase: state.phase, document: safeUrl(page.url()),
        url: params.url ? safeUrl(params.url) : '[inline-or-evaluated]',
        start_line: params.startLine, start_column: params.startColumn,
        end_line: params.endLine, end_column: params.endColumn,
        script_id: params.scriptId || null, execution_context_id: params.executionContextId,
        observed_at_ms: Date.now(),
      };
      result.failed_parse_scripts.push(source);
      if (params.scriptId) scripts.set(params.scriptId, source);
    });
    session.on('Runtime.exceptionThrown', ({ exceptionDetails: details }) => {
      const frames = details.stackTrace?.callFrames || [];
      const location = frames[0] || {};
      const script = scripts.get(location.scriptId || details.scriptId);
      result.exceptions.push({
        route: state.route, phase: state.phase, document: safeUrl(page.url()),
        observed_at_ms: Date.now(),
        text: String(details.text || '').slice(0, 300),
        description: safeStack(details.exception?.description),
        url: details.url ? safeUrl(details.url) : script?.url || '[not-reported]',
        line: location.lineNumber ?? details.lineNumber ?? null,
        column: location.columnNumber ?? details.columnNumber ?? null,
        script_id: location.scriptId || details.scriptId || null,
        script_context: script || null,
        stack_frames: frames.slice(0, 7).map(f => ({
          function: String(f.functionName || '').slice(0, 100),
          url: f.url ? safeUrl(f.url) : scripts.get(f.scriptId)?.url || '[inline-or-evaluated]',
          line: f.lineNumber, column: f.columnNumber,
        })),
      });
    });
    await session.send('Runtime.enable');
    await session.send('Debugger.enable');
    result.debugger = 'ATTACHED';
  } catch (error) {
    result.debugger = 'NOT_AVAILABLE';
    result.diagnostic_errors.push(safeStack(error?.message));
  }
  return {
    setPhase: phase,
    async flush() {
      await Promise.allSettled(outstanding);
      // MIME alone is not proof of bytes. If CDP associates a parse error
      // with a script URL, inspect that exact response even if HTTP advertised
      // a JavaScript MIME (mislabelled HTML is a real failure mode).
      const implicated = new Set([
        ...result.exceptions.map(e => e.url),
        ...result.exceptions.flatMap(e => e.stack_frames.map(f => f.url)),
        ...result.failed_parse_scripts.map(e => e.url),
      ].filter(value => value && !value.startsWith('[')));
      await Promise.allSettled(resources.filter(x =>
        implicated.has(x.record.url) && !x.record.response_signature).map(async x => {
        try { x.record.response_signature = signature(await x.response.body()); }
        catch (e) { x.record.signature_error = String(e).slice(0, 120); }
      }));

      const groups = new Map();
      const matched = new Set();
      for (const error of result.pageerrors) {
        const candidates = result.exceptions.map((e, i) => ({ e, i }))
          .filter(({ e, i }) => !matched.has(i) && e.phase === error.phase &&
            (e.description.includes(error.message) || error.message.includes(e.text) ||
              e.description.includes('Unexpected token')));
        candidates.sort((a, b) =>
          Math.abs(a.e.observed_at_ms - error.observed_at_ms) -
          Math.abs(b.e.observed_at_ms - error.observed_at_ms));
        const candidate = candidates[0];
        if (candidate) matched.add(candidate.i);
        const exception = candidate?.e;
        const related = result.failed_parse_scripts.filter(f =>
          f.phase === error.phase && Math.abs(f.observed_at_ms - error.observed_at_ms) < 2500);
        const source = exception?.url && exception.url !== '[not-reported]'
          ? exception.url : related.length === 1 ? related[0].url : '[not-discriminated]';
        const key = JSON.stringify([error.phase, error.message, source]);
        const group = groups.get(key) || { phase: error.phase, message: error.message,
          source, occurrences: [] };
        group.occurrences.push({
          ordinal: error.ordinal, exception_index: candidate?.i ?? null,
          failed_parse_candidates: related.map(f => ({
            url: f.url, line: f.start_line, column: f.start_column, script_id: f.script_id,
          })),
        });
        groups.set(key, group);
      }
      result.grouped = [...groups.values()];
      result.script_catalog = [...scripts.values()].filter(s => s.url !== '[inline-or-evaluated]');
      result.script_count = scripts.size;
      delete result.script_catalog; // no gratuitous full resource inventory
    },
  };
}
