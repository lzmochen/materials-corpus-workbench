/* Image coordinates use a top-left origin. OCR rectangles alone are normalized. */
(() => {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mid = values => {
    const s = [...values].sort((a,b) => a-b);
    return s.length ? (s[(s.length-1)>>1]+s[s.length>>1])/2 : 0;
  };
  const site = typeof document !== 'undefined' ? new URL('.', document.currentScript?.src || document.baseURI) : null;
  function full(image) { return {x:0, y:0, width:image.width, height:image.height}; }
  function rect(image, box) {
    if(Number.isFinite(box.left) && !Number.isFinite(box.x)) box={x:box.left,y:box.top,width:box.right-box.left,height:box.bottom-box.top};
    const x=clamp(Math.floor(box.x),0,image.width-1), y=clamp(Math.floor(box.y),0,image.height-1);
    const r=clamp(Math.ceil(box.x+box.width),x+1,image.width), b=clamp(Math.ceil(box.y+box.height),y+1,image.height);
    return {x,y,width:r-x,height:b-y};
  }
  function cropPanel(canvas, box) {
    const r=rect(canvas,box), cut=document.createElement('canvas');
    cut.width=r.width; cut.height=r.height;
    cut.getContext('2d').drawImage(canvas,r.x,r.y,r.width,r.height,0,0,r.width,r.height);
    return cut;
  }
  function runs(flags) {
    const spans=[]; let first=-1;
    for(let i=0;i<=flags.length;i++) {
      if(flags[i] && first<0) first=i;
      if(!flags[i] && first>=0) {spans.push([first,i]);first=-1;}
    }
    return spans;
  }
  function smallMask(image) {
    const step=Math.max(1,Math.ceil(Math.max(image.width,image.height)/650));
    const w=Math.ceil(image.width/step), h=Math.ceil(image.height/step), mask=new Uint8Array(w*h);
    const pixels=image.data;
    for(let y=0;y<image.height;y++) for(let x=0;x<image.width;x++) {
      const i=(y*image.width+x)*4;
      if(pixels[i+3]>100 && Math.min(pixels[i],pixels[i+1],pixels[i+2])<170) mask[Math.floor(y/step)*w+Math.floor(x/step)]=1;
    }
    return {w,h,mask,step};
  }
  // A white gutter alone is insufficient. Require an independent pair of long
  // perpendicular features within each proposed plot and reject cuts through a spine.
  function hasAxes(m,r) {
    const horizontal=[],vertical=[];
    for(let dy=0;dy<r.height;dy++) {
      const row=(r.y+dy)*m.w+r.x;
      for(const [a,b] of runs(m.mask.subarray(row,row+r.width)))
        if(b-a>=r.width*.32)horizontal.push({a:r.x+a,b:r.x+b,y:r.y+dy});
    }
    if(!horizontal.length)return false;
    for(let dx=0;dx<r.width;dx++){
      const x=r.x+dx,col=Array.from({length:r.height},(_,dy)=>m.mask[(r.y+dy)*m.w+x]);
      for(const [a,b] of runs(col))
        if(b-a>=r.height*.28)vertical.push({a:r.y+a,b:r.y+b,x});
    }
    const margin=4;
    return vertical.some(v=>horizontal.some(h=>v.x>=h.a-margin&&v.x<=h.b+margin&&h.y>=v.a-margin&&h.y<=v.b+margin));

  }
  function splitCandidates(m,r,vertical) {
    const length=vertical?r.width:r.height, across=vertical?r.height:r.width;
    if(length<100 || across<50) return [];
    const at=(a,b)=>vertical?m.mask[(r.y+b)*m.w+r.x+a]:m.mask[(r.y+a)*m.w+r.x+b];
    const hist=Array.from({length},(_,i)=>{let n=0;for(let j=0;j<across;j++)n+=at(i,j);return n;});
    const proposals=[];
    for(const [lo,hi] of runs(hist.map(v=>v<=Math.max(1,across*.008)))) {
      const cut=Math.round((lo+hi)/2);
      if(hi-lo<Math.max(5,length*.014) || cut<length*.18 || cut>length*.82) continue;
      let crossing=false;
      for(let j=0;j<across && !crossing;j++) {
        if(!at(cut,j)) continue;
        let left=cut,right=cut;
        while(left>0 && at(left-1,j))left--;
        while(right+1<length && at(right+1,j))right++;
        crossing=cut-left>=3 && right-cut>=3 && right-left>=length*.25;
      }
      if(crossing) continue;
      const a={...r},b={...r};
      if(vertical){a.width=cut;b.x+=cut;b.width-=cut;}else{a.height=cut;b.y+=cut;b.height-=cut;}
      if(hasAxes(m,a)&&hasAxes(m,b)) proposals.push({parts:[a,b],score:(hi-lo)/length*Math.min(cut,length-cut)/length});
    }
    return proposals;
  }
  function detectPanels(image) {
    if(!image?.data || image.width<120 || image.height<80) return [full(image)];
    const m=smallMask(image);
    function visit(r,depth) {
      if(depth===3)return [r];
      const candidates=[...splitCandidates(m,r,true),...splitCandidates(m,r,false)].sort((a,b)=>b.score-a.score);
      return candidates.length ? candidates[0].parts.flatMap(child=>visit(child,depth+1)) : [r];
    }
    return visit({x:0,y:0,width:m.w,height:m.h},0).map(r=>rect(image,{x:r.x*m.step,y:r.y*m.step,width:r.width*m.step,height:r.height*m.step})).sort((a,b)=>a.y-b.y || a.x-b.x);
  }

  function frameForText(image) {
    const mask=smallMask(image), {w,h,step}=mask;
    let horizon=[],spine=[];
    for(let y=0;y<h;y++){
      const row=mask.mask.subarray(y*w,(y+1)*w);
      for(const [a,b] of runs(row)) if(b-a>w*.30)horizon.push({a,b,pos:y,width:b-a});
    }
    for(let x=0;x<w;x++){
      const col=Array.from({length:h},(_,y)=>mask.mask[y*w+x]);
      for(const [a,b] of runs(col)) if(b-a>h*.28)spine.push({a,b,pos:x,width:b-a});
    }
    const combos=[];
    for(const a of horizon)for(const b of spine) {
      const gapX=Math.min(Math.abs(a.a-b.pos),Math.abs(a.b-b.pos)),gapY=Math.min(Math.abs(b.a-a.pos),Math.abs(b.b-a.pos));
      if(gapX<Math.max(8,w*.035)&&gapY<Math.max(8,h*.035))combos.push({a,b,score:a.width/w+b.width/h-(gapX+gapY)/w});
    }
    combos.sort((a,b)=>b.score-a.score);
    if(!combos.length)return null;
    const {a,b}=combos[0];
    // Long axis strokes can include small tick stubs. Prefer the position of
    // a perpendicular spine to the farthest ink pixel of a horizontal/vertical run.
    const edge=(items,p,len,span,fallback)=>{
      const near=items.filter(t=>t.width>=span*.80&&Math.abs(t.pos-p)<=Math.max(5,len*.028));
      return near.length?Math.round(mid(near.map(t=>t.pos))):fallback;
    };
    const left=edge(spine,a.a,w,b.width,a.a),right=edge(spine,a.b-1,w,b.width,a.b-1);
    const top=edge(horizon,b.a,h,a.width,b.a),bottom=edge(horizon,b.b-1,h,a.width,b.b-1);
    return rect(image,{x:left*step,y:top*step,width:(right-left)*step,height:(bottom-top)*step});
  }
  function detectPlot(image,region) {
    if(!region)return frameForText(image);
    const r=rect(image,region), data=new Uint8ClampedArray(4*r.width*r.height);
    for(let y=0;y<r.height;y++){
      const a=4*((r.y+y)*image.width+r.x);
      data.set(image.data.subarray(a,a+4*r.width),4*y*r.width);
    }
    const local=frameForText({width:r.width,height:r.height,data});
    return local?{...local,x:local.x+r.x,y:local.y+r.y}:null;
  }
  function tickPatches(image,roi) {
    const patches=[],max=52;
    const isInk=(x,y)=>{
      const i=4*(y*image.width+x);return image.data[i+3]>96&&Math.min(image.data[i],image.data[i+1],image.data[i+2])<162;
    };
    function bands(x,y,w,h,horizontal){
      if(w<4||h<4)return;
      const r=rect(image,{x,y,width:w,height:h});
      const ys=Array.from({length:r.height},(_,row)=>{
        for(let col=0;col<r.width;col++)if(isInk(r.x+col,r.y+row))return true;
        return false;
      });
      for(const [a,b] of runs(ys)) {
        const h=b-a;
        if(h<4||h>Math.max(32,Math.min(image.height*.08,65)))continue;
        const xs=Array.from({length:r.width},(_,col)=>{
          for(let row=a;row<b;row++) if(isInk(r.x+col,r.y+row)) return true;
          return false;
        });
        let gs=[];
        for(const [start,end] of runs(xs)){
          const last=gs.at(-1);
          if(last&&start-last[1]<=Math.max(2,h*.38))last[1]=end;else gs.push([start,end]);
        }
        // A bottom or top axis needs independently located tick groups; a
        // single long text row is likely an axis title.
        if(horizontal&&(gs.length<2||gs.at(-1)[1]-gs[0][0]<r.width*.27))continue;
        for(const [start,end] of gs) {
          if(end-start<2||end-start>h*7.5)continue;
          const box={x:r.x+start,y:r.y+a,width:end-start,height:h};
          if(patches.length<max)patches.push(box);
        }
      }
    }
    const pad=Math.max(10,Math.min(34,roi.width*.05)), yband=Math.max(27,Math.min(68,roi.height*.16)), xband=Math.max(38,Math.min(100,roi.width*.22));
    const xr=roi.x+roi.width,yb=roi.y+roi.height;
    bands(roi.x-pad,yb+2,roi.width+2*pad,yband,true);
    bands(roi.x-pad,roi.y-yband-2,roi.width+2*pad,yband,true);
    bands(roi.x-xband,roi.y-12,xband-7,roi.height+24,false);
    bands(xr+7,roi.y-12,xband-7,roi.height+24,false);
    return patches;
  }
  async function readTickPatches(worker,canvas,roi,existing) {
    const input=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    roi=roi?rect(input,roi):frameForText(input);
    if(!roi)return [];
    const known=tickWords(input,existing), patches=tickPatches(input,roi), extra=[];
    await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789+-.eE^×%'});
    for(const b of patches) {
      const x=b.x+b.width/2,y=b.y+b.height/2;
      if(known.some(k=>Math.abs(k.cx-x)<Math.max(4,b.width*.40)&&Math.abs(k.cy-y)<Math.max(4,b.height*.55)))continue;
      const tile=document.createElement('canvas'),scale=Math.max(1,Math.min(5,42/b.height));
      const w=Math.ceil(b.width*scale),h=Math.ceil(b.height*scale);tile.width=w+22;tile.height=h+20;
      const cx=tile.getContext('2d');cx.fillStyle='white';cx.fillRect(0,0,tile.width,tile.height);
      cx.drawImage(canvas,b.x,b.y,b.width,b.height,11,10,w,h);
      const r=await worker.recognize(tile),text=String(r.data.text||'').trim(),conf=Number(r.data.confidence)||0;
      if(numeric(text)!==null&&conf>=35)extra.push({text,confidence:conf/100,bbox:{x:b.x/input.width,y:b.y/input.height,width:b.width/input.width,height:b.height/input.height}});
    }
    return extra;
  }
  function cleanRecognizedLine(line){
    const words=line.words||[];
    const first=words.findIndex(w=>!/^[-=~—–一_·•]+$/.test(w.text));
    if(first<=0)return first<0&&words.length?null:line;
    const content=words.slice(first),left=content[0].bbox.x,right=Math.max(...content.map(w=>w.bbox.x+w.bbox.width)),top=Math.min(...content.map(w=>w.bbox.y)),bottom=Math.max(...content.map(w=>w.bbox.y+w.bbox.height));
    const offset=line.text.indexOf(content[0].text);
    return {...line,text:offset>=0?line.text.slice(offset):content.map(w=>w.text).join(' '),words:content,bbox:{x:left,y:top,width:right-left,height:bottom-top}};
  }
  let tessLoader=null;
  async function loadOCRWorker() {
    const base=new URL('runtime/ocr/',site).href;
    if(!globalThis.Tesseract) {
      if(!tessLoader) tessLoader=new Promise((ok,no)=>{
        const script=document.createElement('script');script.src=base+'tesseract.min.js';
        script.onload=ok;script.onerror=()=>{tessLoader=null;script.remove();no(Error('未能载入同站 OCR 组件'));};
        document.head.append(script);
      });
      await tessLoader;
    }
    return Tesseract.createWorker('chi_sim+eng',1,{
      workerPath:base+'worker.min.js',corePath:base+'tesseract-core-lstm.wasm.js',langPath:base,workerBlobURL:false
    });
  }
  function createOCRBatch() {
    let pending=null;
    return {
      acquire() { return pending || (pending=loadOCRWorker()); },
      async close() {
        const promise=pending;
        pending=null;
        const worker=promise && await promise.catch(()=>null);
        if(worker)await worker.terminate();
      }
    };
  }
  async function browserOCR(canvas,roi,batch) {
    const session=batch||createOCRBatch();
    try {
      const worker=await session.acquire();
      // Tick patches restrict the alphabet. Restore normal text for the next image.
      await worker.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
      const scale=Math.min(2,2200/Math.max(canvas.width,canvas.height));
      const copy=document.createElement('canvas');
      copy.width=Math.max(1,Math.round(canvas.width*scale)); copy.height=Math.max(1,Math.round(canvas.height*scale));
      const c=copy.getContext('2d');c.fillStyle='white';c.fillRect(0,0,copy.width,copy.height);
      c.drawImage(canvas,0,0,copy.width,copy.height);
      const result=await worker.recognize(copy);
      const convert=item=>({text:String(item.text||'').trim(),confidence:clamp(item.confidence/100,0,1),
        bbox:{x:item.bbox.x0/copy.width,y:item.bbox.y0/copy.height,width:(item.bbox.x1-item.bbox.x0)/copy.width,height:(item.bbox.y1-item.bbox.y0)/copy.height}});
      const lines=(result.data.lines||[]).filter(s=>s.text?.trim()).map(s=>cleanRecognizedLine({...convert(s),words:(s.words||[]).map(convert)})).filter(Boolean);
      lines.push(...await readTickPatches(worker,canvas,roi,lines));
      return {engine:'Tesseract LSTM',lines,warning:lines.length?'':'未识读到文字，请补录刻度或图例。'};
    } catch (err) {
      if(batch)await session.close();
      throw err;
    } finally { if(!batch)await session.close(); }
  }
  async function readText(canvas,roi,batch) {
    try {
      if(document.querySelector('script[src*="browser-bridge"]'))return await browserOCR(canvas,roi,batch);
      const data=canvas.toDataURL('image/png').split(',')[1];
      const response=await fetch('/api/curves/ocr',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:'curve.png',contentBase64:data})});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw Error(detail.error||'图表文字识别服务暂不可用');}
      return await response.json();
    } catch(e) { return {engine:'',lines:[],warning:'文字识别未完成，请补录刻度和图例。'+(e.message||'')}; }
  }
  function numeric(text) {
    let t=String(text).trim().replace(/[−‒–—﹣]/g,'-').replace(/，/g,',');
    const supers='⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺';
    t=t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+/gu,s=>'^'+[...s].map(ch=>'0123456789-+'[supers.indexOf(ch)]).join(''));
    t=t.normalize('NFKC').replace(/,/g,'').replace(/％/g,'%').trim();
    t=t.replace(/^([+-]?\d+(?:\.\d+)?)\s*[-+]$/, '$1');
    let m=/^(?:([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*[×x*]\s*)?10\s*\^\s*([+-]?\d+)$/i.exec(t);
    if(m){const v=Number(m[1]||1)*10**Number(m[2]);return Number.isFinite(v)?v:null;}
    if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i.test(t))return null;
    const v=Number(t.replace('%',''));return Number.isFinite(v)?v:null;
  }
  function linePixels(image,line) {
    const b=line.bbox||{};
    if(![b.x,b.y,b.width,b.height].every(Number.isFinite)||b.width<=0||b.height<=0)return null;
    const box=rect(image,{x:b.x*image.width,y:b.y*image.height,width:b.width*image.width,height:b.height*image.height});
    return {...box,text:String(line.text||'').trim(),confidence:clamp(Number(line.confidence)||0,0,1),
      cx:box.x+box.width/2,cy:box.y+box.height/2};
  }
  function tickWords(image,lines) {
    return lines.flatMap(line=>{
      if(line.words?.length>1) return line.words.map(w=>linePixels(image,w)).filter(Boolean);
      const box=linePixels(image,line);
      if(!box)return [];
      const parts=[...box.text.matchAll(/\S+/g)];
      if(parts.length<2 || parts.some(p=>numeric(p[0])===null))return [box];
      // Vision may group a complete bottom row into one line. Rediscover the
      // actual word positions from ink gaps instead of spacing numbers uniformly.
      const columns=Array.from({length:box.width},(_,j)=>{
        for(let y=box.y;y<box.y+box.height;y++) {
          const i=(y*image.width+box.x+j)*4;
          if(image.data[i+3]>80 && Math.min(...image.data.subarray(i,i+3))<160)return true;
        }
        return false;
      });
      const ink=runs(columns);
      if(ink.length<parts.length)return [];
      const gaps=ink.slice(1).map((v,i)=>({i,size:v[0]-ink[i][1]})).sort((a,b)=>b.size-a.size);
      const cuts=new Set(gaps.slice(0,parts.length-1).map(g=>g.i));let start=ink[0][0],p=0;
      return ink.flatMap((v,i)=>{
        if(!cuts.has(i)&&i<ink.length-1)return [];
        const w=v[1]-start,x=box.x+start,result={...box,text:parts[p++][0],x,width:w,cx:x+w/2};start=ink[i+1]?.[0];return [result];
      });
    }).map(word=>({...word,value:numeric(word.text)})).filter(word=>word.value!==null && word.confidence>=.2);
  }
  function fitTicks(ticks,lo,hi,scale) {
    const log=scale==='log', transform=v=>log?Math.log10(v):v;
    const data=ticks.filter(t=>!log||t.value>0);
    if(data.length<2 || (log&&data.length<3))return null;
    const tolerance=Math.max(3.5,Math.abs(hi-lo)*.025);
    let best=null;
    for(let i=0;i<data.length;i++) for(let j=i+1;j<data.length;j++) {
      const a=data[i],b=data[j],u=transform(a.value),v=transform(b.value);
      if(u===v || Math.abs(a.pixel-b.pixel)<tolerance*2)continue;
      let slope=(b.pixel-a.pixel)/(v-u), intercept=a.pixel-slope*u;
      const supported=data.filter(t=>Math.abs(t.pixel-(intercept+slope*transform(t.value)))<=tolerance).sort((l,r)=>l.pixel-r.pixel);
      const points=supported.filter((p,k)=>!k||Math.abs(p.pixel-supported[k-1].pixel)>2);
      if(points.length<(log?3:2))continue;
      const xbar=points.reduce((n,p)=>n+transform(p.value),0)/points.length, ybar=points.reduce((n,p)=>n+p.pixel,0)/points.length;
      const varx=points.reduce((n,p)=>n+(transform(p.value)-xbar)**2,0);
      if(!varx)continue;
      slope=points.reduce((n,p)=>n+(transform(p.value)-xbar)*(p.pixel-ybar),0)/varx;intercept=ybar-slope*xbar;
      const span=(points.at(-1).pixel-points[0].pixel)/Math.abs(hi-lo);
      if(!Number.isFinite(slope)||Math.abs(slope)<1e-12||span<.28)continue;
      const residual=Math.sqrt(points.reduce((n,p)=>n+(p.pixel-intercept-slope*transform(p.value))**2,0)/points.length);
      const score=points.length+Math.min(1,span)*.33-residual/tolerance*.28-(log?.08:0);
      if(best&&score<=best.score)continue;
      const at=px=>{
        const near=points.find(p=>Math.abs(px-p.pixel)<=Math.max(2,Math.abs(hi-lo)*.012));
        if(near)return near.value;
        let value=(px-intercept)/slope;
        if(points.length>=3) {
          const levels=[...new Set(points.map(p=>transform(p.value)))].sort((a,b)=>a-b);
          const steps=levels.slice(1).map((v,k)=>v-levels[k]);
          const unit=Math.min(...steps);
          if(unit>0 && steps.every(g=>Math.abs(g/unit-Math.round(g/unit))<.025)){
            const nearest=levels[0]+Math.round((value-levels[0])/unit)*unit;
            if(Math.abs(value-nearest)<=unit*.05)value=nearest;
          }
        }
        return Number((log?10**value:value).toPrecision(6));
      };
      const start=at(lo),end=at(hi);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start===end)continue;
      best={score,scale,start,end,ticks:points,span,residual};
    }
    return best;
  }
  function axisCandidate(axis,roi,numbers,text,onlySide=null) {
    const horiz=axis==='x',left=roi.x,top=roi.y,right=left+roi.width,bottom=top+roi.height;
    const lo=horiz?left:bottom, hi=horiz?right:top;
    const length=horiz?roi.width:roi.height,depth=horiz?roi.height:roi.width;
    const sides=horiz?[bottom,top]:[left,right];
    const tol=Math.max(5,length*.035), band=Math.max(28,Math.min(95,depth*.22));
    let winner=null;
    for(let side=0;side<2;side++) {
      if(onlySide!==null&&side!==onlySide)continue;
      const edge=sides[side],sgn=horiz?(side?-1:1):(side?1:-1);
      const distance=b=>horiz?(b.cy-edge)*sgn:(b.cx-edge)*sgn;
      const next=numbers.filter(b=>{
        const p=horiz?b.cx:b.cy,d=distance(b);
        return p>=Math.min(lo,hi)-tol && p<=Math.max(lo,hi)+tol && d>=-2 && d<=band;
      }).sort((a,b)=>distance(a)-distance(b));
      const all=[];
      // Group tick labels aligned on the same side. Right-align horizontal text
      // on a left y-axis: labels such as -1000 and 0 have different centres.
      const align=b=>horiz?b.cy:(side?b.x:b.x+b.width);
      for(const anchor of next) {
        const group=next.filter(b=>Math.abs(align(anchor)-align(b))<=Math.max(5,Math.max(b.height,anchor.height)*.75));
        if(group.length<2)continue;
        const pts=group.map(b=>({pixel:horiz?b.cx:b.cy,value:b.value,text:b.text}));
        const linear=fitTicks(pts,lo,hi,'linear'),log=fitTicks(pts,lo,hi,'log');
        const best=log&&(!linear||log.score>linear.score)?log:linear;
        if(best) all.push({...best,side,edge,dist:mid(group.map(distance)),score:best.score-distance(anchor)/band*.09-side*.02});
      }
      for(const candidate of all)if(!winner||candidate.score>winner.score)winner=candidate;
    }
    const axisLabel=()=>{
      const side=winner?.side||0, edge=sides[side],sgn=horiz?(side?-1:1):(side?1:-1);
      const ranked=text.filter(t=>numeric(t.text)===null && /[\p{L}]/u.test(t.text) && !/^\(?[a-z]\)?$/i.test(t.text)).map(t=>{
        const distance=(horiz?t.cy-edge:t.cx-edge)*sgn,p=horiz?t.cx:t.cy;
        const centre=Math.abs((p-(lo+hi)/2)/length);
        if(distance<=((winner?.dist||0)+2) || distance>Math.max(67,depth*.32) || centre>.37)return null;
        return {text:t.text,cost:centre+distance/depth*.25};
      }).filter(Boolean).sort((a,b)=>a.cost-b.cost);
      if(ranked.length)return ranked[0].text;
      if(!horiz){
        // Papers also place a horizontal y-axis title just above the upper left.
        const originTitles=text.filter(t=>/[（(][^()（）]+[）)]/.test(t.text) && t.cy<top &&
          top-t.cy<Math.max(26,roi.height*.10) && Math.abs(side?(t.x+t.width-right):(t.x-left))<Math.max(12,roi.width*.065));
        return originTitles.sort((a,b)=>b.cy-a.cy)[0]?.text||'';
      }
      return '';
    };
    const label=axisLabel();
    if(!winner)return {status:'unread',scale:null,start:null,end:null,direction:null,label,ticks:[],needsConfirmation:true};
    const {scale,start,end,ticks}=winner;
    return {status:'candidate',scale,start,end,label,ticks,direction:end>start?'increasing':'decreasing',
      needsConfirmation:true, scaleEvidence:ticks.length===2?'two-ticks':'fitted', axisSide:(horiz?['bottom','top']:['left','right'])[winner.side]};
  }

  const hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  function rgb(s) {
    if(Array.isArray(s)&&s.length>=3)return s.slice(0,3);
    const v=String(s||'').trim();let m=/^#([\da-f]{6})$/i.exec(v);
    if(m)return [0,2,4].map(i=>parseInt(m[1].slice(i,i+2),16));
    m=/^#([\da-f]{3})$/i.exec(v);
    if(m)return [...m[1]].map(c=>parseInt(c+c,16));
    m=/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(v);
    return m?m.slice(1).map(Number):null;
  }
  const distanceRGB=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  function swatch(image,line,roi,series) {
    const maxWidth=Math.min(125,Math.max(43,roi.width*.2)), x2=Math.min(image.width-1,Math.floor(line.x)-1);
    const x1=Math.max(0,Math.floor(x2-maxWidth)), y1=Math.max(0,Math.floor(line.cy-line.height*.43)), y2=Math.min(image.height-1,Math.ceil(line.cy+line.height*.43));
    if(x2-x1<7 || y2<=y1)return null;
    const palette=series.map(s=>rgb(s.color)).filter(Boolean);
    const buckets=new Map(),pixels=image.data;
    for(let y=y1;y<=y2;y++) for(let x=x1;x<=x2;x++) {
      const i=(y*image.width+x)*4, r=pixels[i],g=pixels[i+1],b=pixels[i+2],max=Math.max(r,g,b),min=Math.min(r,g,b);
      if(pixels[i+3]<120 || (max-min<28 && min>152) || min>217) continue;
      const key=max-min<25?'gray':[r,g,b].map(v=>v>>5).join('-');
      let rows=buckets.get(key);
      if(!rows){rows=new Map();buckets.set(key,rows);}
      let pts=rows.get(y);if(!pts){pts=[];rows.set(y,pts);}
      pts.push({x,r,g,b});
    }
    let best=null;
    for(const [key,rows] of buckets)for(const [y,all] of rows) {
      // Start at the text and stop when a gap is larger than a plausible dash gap.
      const groups=[]; let points=[];
      for(const pt of all){if(points.length && pt.x>points.at(-1).x+Math.max(6,Math.min(14,line.height*.85))){groups.push(points);points=[];}points.push(pt);}
      if(points.length)groups.push(points);
      for(const pts of groups){
        const begin=pts[0].x,end=pts.at(-1).x, width=end-begin+1, gap=line.x-end-1;
        if(gap>Math.max(15,line.height*1.25)||gap<0 || width<Math.max(8,line.height*.68) || width>roi.width*.30 || pts.length/width<.22)continue;
        // A stroke with ink on most scanlines of a tall glyph is normally another word.
        const extending=Array.from(rows.values()).filter(row=>row.filter(q=>q.x>=begin&&q.x<=end).length>=Math.max(4,pts.length*.60)).length;
        if(extending>Math.max(5,line.height*.60))continue;
        const tone=[mid(pts.map(p=>p.r)),mid(pts.map(p=>p.g)),mid(pts.map(p=>p.b))];
        if(key==='gray' && palette.length && !palette.some(c=>distanceRGB(c,tone)<85))continue;
        const flags=new Uint8Array(width);for(const p of pts)flags[p.x-begin]=1;
        const ink=runs(flags),lengths=ink.map(([a,b])=>b-a),dash=mid(lengths);
        const style=ink.length===1?'solid':(ink.length>=3&&dash<=Math.max(3,extending*1.5)?'dotted':'dashed');
        const score=Math.min(width,line.height*3.5)/Math.max(10,line.height)+.4*(1-gap/Math.max(15,line.height*1.25))-.55*Math.abs(y-line.cy)/line.height+(key==='gray'?-.6:.4);
        if(!best||score>best.score) best={score,tone,style,begin,end,y,thickness:Math.max(1,extending)};
      }
    }
    return best;
  }
  function skipSwatchText(image,line) {
    const lead=/^[-=~·•—–]+\s*(?=[\p{L}])/u.exec(line.text);
    if(!lead)return line;
    const columns=Array.from({length:line.width},(_,dx)=>{
      let dark=0;
      for(let y=line.y;y<line.y+line.height;y++){
        const i=(y*image.width+line.x+dx)*4;
        if(image.data[i+3]>100 && Math.max(image.data[i],image.data[i+1],image.data[i+2])<165)dark++;
      }
      return dark;
    });
    let start=columns.findIndex(n=>n>=Math.max(4,line.height*.32));
    if(start<3 || start>line.width*.72)return line;
    while(start>0 && columns[start-1])start--;
    return {...line,text:line.text.slice(lead[0].length),x:line.x+start,width:line.width-start,cx:line.x+(line.width+start)/2};
  }
  function legendsOf(image,roi,text,series) {
    const result=[];
    for(const line of text) {
      const t=skipSwatchText(image,line);
      if(!t.text || t.confidence<.24 || (t.text.length===1 && /^\W$/.test(t.text)) || t.text.length>96)continue;
      const mark=swatch(image,t,roi,series);
      if(!mark)continue;
      const onSpine=mark.end>=roi.x && mark.begin<=roi.x+roi.width &&
        Math.min(Math.abs(mark.y-roi.y),Math.abs(mark.y-roi.y-roi.height))<=Math.max(3,roi.height*.009);
      if(onSpine)continue;
      const ranked=series.map(s=>{
        const c=rgb(s.color);
        return {id:s.id,colorError:c?distanceRGB(c,mark.tone):Infinity,style:s.style||s.lineStyle||''};
      }).filter(s=>s.colorError<=112).map(s=>({...s,cost:s.colorError+(s.style&&s.style!==mark.style?48:0)})).sort((a,b)=>a.cost-b.cost);
      const choice=ranked.length && (!ranked[1]||ranked[1].cost-ranked[0].cost>12)?ranked[0]:null;
      const top=Math.min(t.y,mark.y-Math.ceil(mark.thickness/2)), bottom=Math.max(t.y+t.height,mark.y+Math.ceil(mark.thickness/2));
      const box=rect(image,{x:mark.begin-2,y:top-1,width:t.x+t.width-mark.begin+4,height:bottom-top+2});
      const r={name:t.text,color:hex(...mark.tone),style:mark.style,seriesId:choice?.id??null,bbox:box,
        confidence:Math.min(t.confidence,choice?.colorError>60?.60:.93),needsConfirmation:true};
      result.push(r);
    }
    // Distinct labels matching the same color cannot both name a single series.
    const byId=new Map();
    for(const item of result)if(item.seriesId!==null)byId.set(item.seriesId,(byId.get(item.seriesId)||0)+1);
    for(const item of result)if(byId.get(item.seriesId)>1)item.seriesId=null;
    return result;
  }
  function analyze(image,{roi=full(image),lines=[],series=[],panel=null}={}) {
    roi=rect(image,roi);
    const regions=panel?[rect(image,panel)]:detectPanels(image);
    const contains=(r,x,y)=>x>=r.x&&x<=r.x+r.width&&y>=r.y&&y<=r.y+r.height;
    const selected=panel?regions[0]:regions.find(r=>contains(r,roi.x,roi.y)&&contains(r,roi.x+roi.width-1,roi.y+roi.height-1));
    if(selected)lines=lines.filter(l=>{
      const t=linePixels(image,l);return t && contains(selected,t.cx,t.cy);
    });
    const text=lines.map(s=>linePixels(image,s)).filter(Boolean),numbers=tickWords(image,lines);
    const legends=legendsOf(image,roi,text,series);
    const leftAxis=axisCandidate('y',roi,numbers,text,0),rightAxis=axisCandidate('y',roi,numbers,text,1);
    const axes={x:axisCandidate('x',roi,numbers,text),y:leftAxis.status==='candidate'?leftAxis:rightAxis};
    if(leftAxis.status==='candidate' && rightAxis.status==='candidate' &&
      (leftAxis.start!==rightAxis.start || leftAxis.end!==rightAxis.end || leftAxis.scale!==rightAxis.scale))axes.y2=rightAxis;
    const warnings=[];
    for(const [key,axis] of Object.entries(axes)){
      if(/[?？�]/.test(axis.label))warnings.push(key.toUpperCase()+' 轴标题含未识读字符，请对照原图核对单位。');
      if(axis.status==='unread')warnings.push(key.toUpperCase()+' 轴未取得足够的刻度证据，请填写两端数值和轴类型。');
      else if(axis.scaleEvidence==='two-ticks')warnings.push(key.toUpperCase()+' 轴只识读到两个刻度，请确认采用线性还是对数标定。');
    }
    if(!legends.length)warnings.push('未识别到可配对的图例文字与线样，请核对曲线名称。');
    else if(legends.some(l=>l.seriesId===null))warnings.push('部分图例与曲线尚未唯一配对，请按原图核对。');
    return {axes,legends,legendBoxes:legends.map(l=>l.bbox),warnings};
  }
  globalThis.CurveLabels={detectPanels,detectPlot,cropPanel,readText,createOCRBatch,analyze};
})();
