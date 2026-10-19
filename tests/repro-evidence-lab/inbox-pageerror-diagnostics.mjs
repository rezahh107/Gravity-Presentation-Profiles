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
  const result = {
    route: identity.route, execution: identity.execution || 'gpp', pageerrors: [],
    exceptions: [], script_responses: [], script_catalog: [],
    debugger: 'NOT_ATTACHED', diagnostic_errors: [],
  };
  report.probes.push(result);
  const phase = name => { state.phase = name; };
  page.on('pageerror', error => {
    // PageError is retained by the original gate independently; this only records provenance.
    result.pageerrors.push({
      route: state.route, phase: state.phase, document: safeUrl(page.url()),
      message: String(error).slice(0, 400), stack: safeStack(error?.stack),
      ordinal: result.pageerrors.length + 1,
    });
  });
  page.on('response', response => {
    if (response.request().resourceType() !== 'script') return;
    const headers = response.headers();
    const mime = (headers['content-type'] || '[missing]').split(';')[0].toLowerCase();
    const record = {
      route: state.route, phase: state.phase, document: safeUrl(page.url()),
      url: safeUrl(response.url()), status: response.status(), mime,
      request_resource_type: 'script',
    };
    result.script_responses.push(record);
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
    session.on('Runtime.exceptionThrown', ({ exceptionDetails: details }) => {
      const frames = details.stackTrace?.callFrames || [];
      const location = frames[0] || {};
      const script = scripts.get(location.scriptId || details.scriptId);
      result.exceptions.push({
        route: state.route, phase: state.phase, document: safeUrl(page.url()),
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
      const groups = new Map();
      for (const error of result.pageerrors) {
        const event = result.exceptions.find(e => e.phase === error.phase &&
          (e.description.includes(error.message) || error.message.includes(e.text)));
        const key = JSON.stringify([error.phase, error.message, event?.url || '[unknown]']);
        const group = groups.get(key) || { phase: error.phase, message: error.message,
          source: event?.url || '[unknown]', occurrences: [] };
        group.occurrences.push(error.ordinal);
        groups.set(key, group);
      }
      result.grouped = [...groups.values()];
      result.script_catalog = [...scripts.values()].filter(s => s.url !== '[inline-or-evaluated]');
      result.script_count = scripts.size;
      delete result.script_catalog; // no gratuitous full resource inventory
    },
  };
}
