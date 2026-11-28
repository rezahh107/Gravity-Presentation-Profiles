import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {withPreservedCleanup, preserveFailures, failureEvidence,
  shutdownOwnedChromium, removeOwnedProfile, finalizeOwnedBrowser} from './p1c-browser-teardown.mjs';

const reports = [];
function profile() {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'p1c-teardown-case-'));fs.writeFileSync(path.join(dir,'profile'),'test');return dir;}
const test = async(name,fn)=>{await fn();reports.push({name,status:'PASS'}); console.log('P1C_CLEANUP_FALSIFICATION_PASS',name);};
function persistentOperations(profileDir) { return {
  rmSync(p) {assert.equal(p,profileDir);const error=Error('persistent busy');error.code='ENOTEMPTY';throw error;},
  existsSync() {return true;}
};}
function flattenError(error) {return error instanceof AggregateError ? error.errors : [error];}

await test('A_subject_pass_and_real_process_cleanup_pass',async()=>{
  const dir=profile();
  const browser=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
  try {
    const value=await withPreservedCleanup(async()=>42,()=>finalizeOwnedBrowser({browser,cdp:null,server:null,profile:dir}));
    assert.equal(value,42);assert.equal(fs.existsSync(dir),false);
    assert.notEqual(browser.exitCode===null && browser.signalCode===null,true);
  } finally { try{process.kill(-browser.pid,'SIGKILL');}catch{} fs.rmSync(dir,{recursive:true,force:true}); }
});
await test('B_subject_failure_preserved_with_successful_cleanup',async()=>{
  const dir=profile(),original=Error('ORIGINAL_SUBJECT_FAILURE');
  try {
    await assert.rejects(withPreservedCleanup(async()=>{throw original},async()=>removeOwnedProfile(dir)),
      error=>error===original);
    assert.equal(fs.existsSync(dir),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
await test('C_subject_and_persistent_cleanup_both_preserved',async()=>{
  const dir=profile(),original=Error('ORIGINAL_ASSERTION_FAILURE');
  try {
    await assert.rejects(withPreservedCleanup(async()=>{throw original},async()=>removeOwnedProfile(dir,persistentOperations(dir))),error=>{
      assert.equal(error instanceof AggregateError,true);
      assert.equal(error.cause,original);assert.equal(error.errors[0],original);
      assert.equal(error.errors[1].phase,'FILESYSTEM_CLEANUP');
      assert.match(failureEvidence(error).secondary[0].stack,/FILESYSTEM_CLEANUP/);
      return true;
    });
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
await test('D_subject_pass_but_persistent_cleanup_fails',async()=>{
  const dir=profile();
  try {
    await assert.rejects(withPreservedCleanup(async()=>true,async()=>removeOwnedProfile(dir,persistentOperations(dir))),
      error=>error.phase==='FILESYSTEM_CLEANUP');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
await test('E_transient_cleanup_recovers_and_previous_failure_still_fatal',async()=>{
  const dir=profile(),original=Error('SUBJECT_BEFORE_TRANSIENT');
  let attempts=0;
  const operations={
    rmSync(...args){attempts++;if(attempts===1){const error=Error('transient race');error.code='ENOTEMPTY';throw error;}return fs.rmSync(...args);},
    existsSync(p){return fs.existsSync(p);}
  };
  try {
    await assert.rejects(withPreservedCleanup(async()=>{throw original},async()=>removeOwnedProfile(dir,operations)),
      error=>error===original);
    assert.equal(attempts,2);assert.equal(fs.existsSync(dir),false);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
await test('F_unconfirmed_browser_shutdown_is_fatal_and_profile_remains',async()=>{
  const dir=profile();let signals=[];
  const fake={pid:12345,exitCode:null,signalCode:null};
  const shutdown=(browser,cdp)=>shutdownOwnedChromium(browser,cdp,{
    members:()=>[12345],signal:(group,s)=>{signals.push([group,s])},wait:async()=>false
  });
  try {
    await assert.rejects(finalizeOwnedBrowser({server:null,browser:fake,cdp:null,profile:dir},{shutdown}),error=>{
      const parts=flattenError(error);
      assert.ok(parts.some(x=>x.phase==='BROWSER_SHUTDOWN'));
      assert.ok(parts.some(x=>x.phase==='FILESYSTEM_CLEANUP'));
      return true;
    });
    assert.deepEqual(signals,[[12345,'SIGTERM'],[12345,'SIGKILL']]);
    assert.equal(fs.existsSync(dir),true);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
await test('G_nested_primary_and_secondary_chain_not_masked',async()=>{
  const subject=Error('SUBJECT'),fixture=Error('FIXTURE_RESTORATION'),cleanup=Error('BROWSER_CLEANUP');
  const nested=preserveFailures(subject,[fixture]);
  const final=preserveFailures(nested,[cleanup]);
  assert.equal(final.primaryError,nested);
  assert.equal(final.errors[0].primaryError,subject);
  assert.equal(final.errors[0].errors[1],fixture);
  assert.equal(final.errors[1],cleanup);
  const evidence=failureEvidence(final);
  assert.match(evidence.primary.primary.stack,/SUBJECT/);
  assert.match(evidence.primary.secondary[0].stack,/FIXTURE_RESTORATION/);
  assert.match(evidence.secondary[0].stack,/BROWSER_CLEANUP/);
});
console.log('P1C_CLEANUP_FALSIFICATION_TOTAL_PASS',reports.length);
