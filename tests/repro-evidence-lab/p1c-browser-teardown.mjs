/** Test-only owned Chromium teardown. Linux CI: one isolated process group per browser. */
import fs from 'node:fs';

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function stagedFailure(phase, error) {
  const failure = new Error(`${phase}: ${error?.message || String(error)}`, {cause:error});
  failure.name = 'P1CInfrastructureFailure';
  failure.phase = phase;
  return failure;
}

export function preserveFailures(primary, secondary = []) {
  const failures = secondary.filter(Boolean).flatMap(error =>
    error instanceof AggregateError && error.primaryError === null && Array.isArray(error.secondaryErrors)
      ? error.secondaryErrors : [error]);
  if (!failures.length) return primary || null;
  if (!primary && failures.length === 1) return failures[0];
  const error = new AggregateError(primary ? [primary, ...failures] : failures,
    'P1C_EXECUTION_AND_INFRASTRUCTURE_FAILURES', primary ? {cause:primary} : {});
  error.primaryError = primary || null;
  error.secondaryErrors = failures;
  return error;
}

export function failureEvidence(error) {
  if (!error) return null;
  const describe = item => ({phase:item?.phase || 'SUBJECT_OR_ASSERTION',
    stack:String(item?.stack || item)});
  if (error instanceof AggregateError) return {
    primary: error.primaryError ? describe(error.primaryError) : null,
    secondary: error.secondaryErrors?.map(describe) || error.errors.map(describe)
  };
  return {primary:describe(error),secondary:[]};
}

export async function withPreservedCleanup(run, cleanup) {
  let primary, value;
  try { value = await run(); } catch (error) { primary = error; }
  let secondary;
  try { await cleanup(); } catch (error) { secondary = error; }
  const failure = preserveFailures(primary, secondary ? [secondary] : []);
  if (failure) throw failure;
  return value;
}

/** Enumerate only runnable members of the newly owned Linux process group. */
export function runningGroupMembers(pgid, proc = '/proc') {
  if (process.platform !== 'linux' || !Number.isSafeInteger(pgid) || pgid < 2)
    throw Error('CHROMIUM_OWNED_PROCESS_GROUP_UNAVAILABLE');
  const members = [];
  for (const dir of fs.readdirSync(proc)) {
    if (!/^\d+$/.test(dir)) continue;
    let stat;
    try { stat = fs.readFileSync(`${proc}/${dir}/stat`, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') continue; throw error; }
    const tail = stat.slice(stat.lastIndexOf(')') + 2).split(/\s+/);
    const state = tail[0], group = Number(tail[2]);
    if (group === pgid && !['Z','X','x'].includes(state)) members.push(Number(dir));
  }
  return members;
}

async function awaitShutdown(browser, pgid, timeoutMs, members) {
  const stop = Date.now() + timeoutMs;
  do {
    const remaining = members(pgid);
    if ((browser.exitCode !== null || browser.signalCode !== null) && remaining.length === 0)
      return true;
    if (Date.now() >= stop) return false;
    await pause(50);
  } while (true);
}

/** A shutdown request is not proof: require child exit plus no runnable group members. */
export async function shutdownOwnedChromium(browser, cdp, options = {}) {
  if (!browser) return {confirmed:true,phase:'NOT_STARTED'};
  const pid = browser.pid;
  if (!Number.isSafeInteger(pid) || pid < 2) throw Error('CHROMIUM_SHUTDOWN_PID_UNAVAILABLE');
  const members = options.members || runningGroupMembers;
  const signal = options.signal || ((group, name) => process.kill(-group, name));
  const wait = options.wait || awaitShutdown;
  let closeRequest = 'NOT_AVAILABLE';
  if (cdp) {
    try {
      await Promise.race([cdp.send('Browser.close'), pause(1500).then(() => { throw Error('CDP_CLOSE_REQUEST_TIMEOUT'); })]);
      closeRequest = 'ACKNOWLEDGED';
    } catch (error) { closeRequest = `UNACKNOWLEDGED:${error?.message || error}`; }
  }
  if (await wait(browser, pid, 2000, members))
    return {confirmed:true,phase:'CDP_CLOSE',closeRequest};
  for (const [name, timeout] of [['SIGTERM',3000],['SIGKILL',2000]]) {
    const active = members(pid);
    if (active.length) {
      try { signal(pid, name); }
      catch (error) { if (error.code !== 'ESRCH') throw stagedFailure('BROWSER_SHUTDOWN_SIGNAL',error); }
    }
    if (await wait(browser, pid, timeout, members))
      return {confirmed:true,phase:name,closeRequest};
  }
  throw stagedFailure('BROWSER_SHUTDOWN_UNCONFIRMED',Error(`owned_group=${pid}; remaining=${members(pid).join(',')}; request=${closeRequest}`));
}

/** Cleanup only an exact mkdtemp profile, after confirmed shutdown. */
export async function removeOwnedProfile(profile, operations = fs) {
  if (!profile) throw Error('PROFILE_PATH_MISSING');
  const remove = () => operations.rmSync(profile,{recursive:true,force:true,maxRetries:2,retryDelay:100});
  try { remove(); }
  catch (error) {
    if (!['ENOTEMPTY','EBUSY','EPERM'].includes(error.code)) throw stagedFailure('FILESYSTEM_CLEANUP',error);
    await pause(250); // bounded filesystem-settling recovery after confirmed shutdown
    try { remove(); } catch (retryError) { throw stagedFailure('FILESYSTEM_CLEANUP',retryError); }
  }
  if (operations.existsSync(profile)) throw stagedFailure('FILESYSTEM_CLEANUP',Error('PROFILE_STILL_EXISTS'));
  return {confirmed:true};
}

export async function finalizeOwnedBrowser({server,browser,cdp,profile}, options = {}) {
  const failures = [];
  if (server) {
    try {
      server.closeAllConnections();
      await Promise.race([
        new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve())),
        pause(2500).then(() => { throw Error('SERVER_CLOSE_TIMEOUT'); })
      ]);
    } catch (error) { failures.push(stagedFailure('LOCAL_SERVER_SHUTDOWN',error)); }
  }
  let shutdownConfirmed = !browser;
  try {
    const outcome = await (options.shutdown || shutdownOwnedChromium)(browser,cdp);
    shutdownConfirmed = outcome.confirmed;
    console.log('P1C_OWNED_BROWSER_SHUTDOWN_CONFIRMED',JSON.stringify(outcome));
  } catch (error) { failures.push(stagedFailure('BROWSER_SHUTDOWN',error)); }
  if (shutdownConfirmed) {
    try { await (options.remove || removeOwnedProfile)(profile); }
    catch (error) { failures.push(stagedFailure('FILESYSTEM_CLEANUP',error)); }
  } else {
    failures.push(stagedFailure('FILESYSTEM_CLEANUP',Error('PROFILE_NOT_REMOVED_SHUTDOWN_UNCONFIRMED')));
  }
  if (failures.length) throw preserveFailures(null, failures);
  console.log('P1C_OWNED_PROFILE_CLEANUP_CONFIRMED');
}
