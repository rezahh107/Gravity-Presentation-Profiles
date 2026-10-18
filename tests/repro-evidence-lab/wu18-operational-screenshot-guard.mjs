import fs from 'node:fs';

// A screenshot filename is never evidence of the browser surface. Verify the
// real route and rendered marker immediately around the Playwright capture.
const surfaces={
  entry_detail:'.gpp-entry-dossier[data-gpp-entry-detail="ready"]',
  inbox:'.gflow-inbox.gflow-grid.gflow-common .ag-header-cell'
};
const signature=Buffer.from([137,80,78,71,13,10,26,10]);

async function observe(page){
  return page.evaluate(({detail,inbox})=>{
    const rendered=selector=>{
      const el=document.querySelector(selector);
      if(!el||!el.isConnected||!el.getClientRects().length)return false;
      const style=getComputedStyle(el);
      return style.display!=='none'&&style.visibility!=='hidden';
    };
    return {
      url:location.href,
      entry_detail_ready:rendered(detail),
      inbox_ready:rendered(inbox)
    };
  },{detail:surfaces.entry_detail,inbox:surfaces.inbox});
}
function expectedRoute(surface,actual,expected){
  const a=new URL(actual),e=new URL(expected);
  if(a.origin!==e.origin||a.pathname!==e.pathname||a.searchParams.get('page')!=='gravityflow-inbox')return false;
  if(surface==='entry_detail'){
    return a.searchParams.get('view')==='entry'&&
      a.searchParams.get('id')===e.searchParams.get('id')&&
      a.searchParams.get('lid')===e.searchParams.get('lid');
  }
  return !a.searchParams.has('view')&&!a.searchParams.has('id')&&!a.searchParams.has('lid');
}
function matches(surface,actual,expected){
  return expectedRoute(surface,actual.url,expected)&&
    (surface==='entry_detail'?actual.entry_detail_ready:actual.inbox_ready)&&
    !(surface==='entry_detail'?actual.inbox_ready:actual.entry_detail_ready);
}
function surfaceError(surface,observation,reason){
  const error=new Error('SCREENSHOT_SURFACE_IDENTITY_MISMATCH: '+reason+
    '; requested='+surface+'; actual='+JSON.stringify(observation));
  error.code='SURFACE_IDENTITY_MISMATCH';
  return error;
}

export async function captureVerifiedOperationalScreenshot(page,{surface,expectedUrl,width,path,fullPage=false}){
  if(!Object.hasOwn(surfaces,surface))throw new Error('Unknown evidence surface: '+surface);
  if(!Number.isInteger(width)||width<1)throw new Error('Invalid screenshot width: '+width);
  const viewport=page.viewportSize();
  if(!viewport||viewport.width!==width)throw new Error('Screenshot viewport mismatch for '+surface);
  const before=await observe(page);
  if(!matches(surface,before,expectedUrl)){
    throw surfaceError(surface,before,'pre-capture route or ready DOM marker');
  }
  await page.screenshot({path,fullPage});
  const after=await observe(page);
  if(!matches(surface,after,expectedUrl)||after.url!==before.url){
    fs.rmSync(path,{force:true});
    throw surfaceError(surface,after,'post-capture route or ready DOM marker');
  }
  const bytes=fs.readFileSync(path);
  if(bytes.length<24||!bytes.subarray(0,8).equals(signature)){
    fs.rmSync(path,{force:true});
    throw new Error('Screenshot is not a PNG: '+path);
  }
  const png={width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  if((fullPage?png.width<width:png.width!==width||png.height!==viewport.height)||png.height<1){
    fs.rmSync(path,{force:true});
    throw new Error('Screenshot PNG dimensions invalid for '+surface+': '+JSON.stringify(png));
  }
  return {file:path.split('/').at(-1),surface,requested_width:width,
    route:before.url,dom_marker:surfaces[surface],observed_before:before,
    observed_after:after,viewport,png,full_page:fullPage};
}
