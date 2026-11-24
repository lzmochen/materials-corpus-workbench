/* Local simulation and supervised color calibration for the curve workbench. */
(() => {
  'use strict';
  const STORAGE='ustb.curve.palette.v1', FORMAT='ustb-curve-palette-v1';
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hex=c=>'#'+c.map(n=>Math.round(Math.max(0,Math.min(255,n))).toString(16).padStart(2,'0')).join('');
  const rgb=s=>typeof s==='string'&&/^#[a-f0-9]{6}$/i.test(s)?[1,3,5].map(i=>parseInt(s.slice(i,i+2),16)):null;
  const gap=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const median=a=>{const v=a.slice().sort((x,y)=>x-y);return (v[(v.length-1)>>1]+v[v.length>>1])/2;};
  const colors=['#2167a5','#b05236'];
  const R={left:90,top:53,right:815,bottom:346},W=870,H=416;
  const models={
    stress:{name:'应力–应变',params:[
      ['elastic','弹性模量 E（GPa）',210,80,260,1],['yield','屈服强度（MPa）',620,100,1400,10],['hard','硬化模量 H（MPa）',2800,300,10000,100]],
      note:'弹性段按胡克定律计算，屈服后采用双线性硬化。B 组屈服强度取 A 组的 1.15 倍，用于生成两条可区分的曲线。'},
    polar:{name:'循环极化',params:[
      ['exchange','交换电流密度（μA/cm²）',3,.2,40,.2],['rate','扫描速率（mV/s）',80,5,300,5],['cap','双电层电容（μF/cm²）',120,10,250,5]],
      note:'在 298 K 下叠加 Butler–Volmer 法拉第电流与双电层充电电流；往返扫描时充电电流反向。B 组交换电流密度取 A 组的 1.35 倍。'}
  };
  function num(v,d){if(!Number.isFinite(v)||v<d[3]||v>d[4])throw Error(d[1]+'应在 '+d[3]+' 至 '+d[4]+' 之间。');return v;}
  function simulator(type,values){
    const m=models[type];if(!m)throw Error('未知物理模型。');
    const p=Object.fromEntries(m.params.map(d=>[d[0],num(Number(values[d[0]]),d)]));
    const stress=type==='stress';let axes;
    const series=colors.map((color,i)=>{
      const points=[];
      if(stress){
        const E=p.elastic*1000,Y=p.yield*(i ? 1.15 : 1),H=p.hard*(i ? .86 : 1),ey=Y/E;
        const emax=.16;
        const strains=Array.from({length:81},(_,k)=>emax*k/80).concat([ey]).sort((a,b)=>a-b);
        for(const e of strains)points.push({x:e*100,y:e<=ey?E*e:Y+H*(e-ey)});
      }else{
        const i0=p.exchange*1e-6*(i ? 1.35 : 1),cap=p.cap*1e-6*(i ? .76 : 1),rate=p.rate/1000;
        for(const forward of [true,false])for(let j=0;j<=75;j++){
          const eta=forward?-.20+.40*j/75:.20-.40*j/75;
          const t=96485.33212*eta/(2*8.314462618*298);
          const current=2*i0*Math.sinh(t)+(forward?1:-1)*cap*rate;
          points.push({x:Math.max(1e-11,Math.abs(current)),y:eta});
        }
      }
      return {name:'Sample '+(i?'B':'A'),color,side:'left',points};
    });
    if(stress){
      const top=Math.max(...series.flatMap(s=>s.points.map(p=>p.y)));
      axes={x:{min:0,max:16,label:'Strain (%)',scale:'linear'},y:{min:0,max:Math.ceil(top/200)*200,label:'Stress (MPa)',scale:'linear'}};
    }else{
      const xx=series.flatMap(s=>s.points.map(p=>p.x));
      const lo=10**Math.floor(Math.log10(Math.min(...xx))),hi=10**Math.ceil(Math.log10(Math.max(...xx)));
      axes={x:{min:lo,max:hi,label:'Absolute current density (A/cm2)',scale:'log'},y:{min:-.2,max:.2,label:'Potential vs. equilibrium (V)',scale:'linear'}};
    }
    for(const s of series)s.points=s.points.map(v=>{
      const f=axes.x.scale==='log'?Math.log(v.x/axes.x.min)/Math.log(axes.x.max/axes.x.min):(v.x-axes.x.min)/(axes.x.max-axes.x.min);
      return {x:v.x,y:v.y,px:R.left+f*(R.right-R.left),py:R.bottom-(v.y-axes.y.min)/(axes.y.max-axes.y.min)*(R.bottom-R.top)};
    });
    const tag=m.params.map(d=>String(p[d[0]]).replace('.','p')).join('-');
    return {filename:'sim-'+type+'-'+tag+'.png',meta:{title:m.name+'模型校准样本',source:'简化物理模型生成的教学样本',model:type,parameters:p,width:W,height:H,roi:{...R},axes,series}};
  }
  function draw(sim,canvas){
    canvas.width=W;canvas.height=H;const c=canvas.getContext('2d',{willReadFrequently:true}),{axes,series,model}=sim.meta;
    c.fillStyle='#fff';c.fillRect(0,0,W,H);c.font='600 19px system-ui, sans-serif';c.fillStyle='#23394a';c.textAlign='left';
    c.fillText(model==='stress'?'Bilinear stress-strain model':'Cyclic polarization model',R.left,30);
    c.lineWidth=1;c.font='13px system-ui, sans-serif';const ndx=axes.x.scale==='log'?Math.round(Math.log10(axes.x.max/axes.x.min)):4;
    for(let i=0;i<=ndx;i++){
      const f=i/ndx,x=R.left+f*(R.right-R.left),v=axes.x.scale==='log'?'1e'+Math.round(Math.log10(axes.x.min)+i):String(axes.x.min+f*(axes.x.max-axes.x.min));
      c.strokeStyle='#e2e6ea';c.beginPath();c.moveTo(x,R.top);c.lineTo(x,R.bottom);c.stroke();c.fillStyle='#23394a';c.textAlign='center';c.fillText(v,x,R.bottom+20);
    }
    for(let i=0;i<=4;i++){
      const f=i/4,y=R.bottom-f*(R.bottom-R.top),v=axes.y.min+f*(axes.y.max-axes.y.min);
      c.strokeStyle='#e2e6ea';c.beginPath();c.moveTo(R.left,y);c.lineTo(R.right,y);c.stroke();
      c.fillStyle='#23394a';c.textAlign='right';c.fillText(Number(v.toPrecision(3)).toString(),R.left-10,y+5);
    }
    c.strokeStyle='#3b4248';c.strokeRect(R.left,R.top,R.right-R.left,R.bottom-R.top);
    c.font='15px system-ui,sans-serif';c.fillStyle='#23394a';c.textAlign='center';c.fillText(axes.x.label,(R.left+R.right)/2,H-15);
    c.save();c.translate(24,(R.top+R.bottom)/2);c.rotate(-Math.PI/2);c.fillText(axes.y.label,0,0);c.restore();
    for(const [i,s] of series.entries()){
      c.beginPath();s.points.forEach((p,k)=>k?c.lineTo(p.px,p.py):c.moveTo(p.px,p.py));c.strokeStyle=s.color;c.lineWidth=2.8;c.stroke();
      const x=R.right-182+i*99;c.beginPath();c.moveTo(x,26);c.lineTo(x+23,26);c.stroke();
      c.fillStyle='#34495a';c.font='12px system-ui,sans-serif';c.textAlign='left';c.fillText(s.name,x+27,30);
    }
  }
  function checkedReference(data,filename){
    if(!data||!Object.hasOwn(data,filename)||!Array.isArray(data[filename]?.series)||!data[filename].series.length)throw Error('参考标注中找不到同名图片 '+filename+'。');
    const series=data[filename].series;
    if(series.length>40)throw Error('单张图片最多支持 40 个标注序列。');
    const names=new Set();
    for(const s of series){
      if(!s||typeof s.name!=='string'||!s.name.trim()||s.name.length>160||!rgb(s.color)||!Array.isArray(s.points)||!s.points.length)throw Error(filename+' 的每个序列须有名称、十六进制颜色与参考点。');
      if(names.has(s.name))throw Error(filename+' 中存在重复序列名，请先区分。');names.add(s.name);
      if(s.points.some(p=>!p||![p.x,p.y,p.px,p.py].every(Number.isFinite)))throw Error(filename+' 的参考点须包含数值 x、y、px、py。');
    }return series;
  }
  function pixelCalibration(image,series){
    const {width:w,height:h,data}=image;
    const bins=new Map();
    function pixel(x,y){const k=4*(y*w+x),a=data[k+3]/255;return [data[k],data[k+1],data[k+2]].map(v=>v*a+255*(1-a));}
    for(let j=0;j<34;j++)for(let i=0;i<34;i++){
      const c=pixel(Math.min(w-1,Math.floor((i+.5)*w/34)),Math.min(h-1,Math.floor((j+.5)*h/34)));
      const key=c.map(v=>v>>4).join('/');let a=bins.get(key);if(!a){a={n:0,c};bins.set(key,a);}a.n++;
    }
    const bg=[...bins.values()].sort((a,b)=>b.n-a.n)[0].c;
    return series.map(s=>{
      const nominal=rgb(s.color),points=[],step=Math.max(1,Math.ceil(s.points.length/7000));let considered=0;
      for(let i=0;i<s.points.length;i+=step){
        const {px,py}=s.points[i];const x=Math.round(px),y=Math.round(py);
        considered++;
        if(x<0||x>=w||y<0||y>=h)continue;
        let best=null,score=Infinity;
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
          if(dx*dx+dy*dy>5||x+dx<0||x+dx>=w||y+dy<0||y+dy>=h)continue;
          const c=pixel(x+dx,y+dy),contrast=gap(c,bg);if(contrast<37)continue;
          const v=gap(c,nominal)*.18+Math.hypot(dx,dy)*12-Math.min(220,contrast)*.06;
          if(v<score){score=v;best=c;}
        }
        if(best)points.push(best);
      }
      if(points.length<Math.min(3,considered))throw Error('“'+s.name+'”的有效参考点不足，请核对图片大小和 px、py。');
      const center=[0,1,2].map(k=>median(points.map(c=>c[k])));
      const errors=points.map(c=>gap(c,center)),limit=Math.max(19,median(errors)*2.7);
      const clean=points.filter((c,i)=>errors[i]<=limit);
      const sums=[0,0,0];for(const c of clean)for(let k=0;k<3;k++)sums[k]+=Math.round(c[k]);
      return {name:s.name.trim(),side:s.side==='right'?'right':'left',count:clean.length,sum:sums};
    });
  }
  const blank=()=>({format:FORMAT,revision:0,sources:[]});
  function validate(model){
    if(model?.format!==FORMAT||!Number.isSafeInteger(model.revision)||model.revision<0||!Array.isArray(model.sources)||model.sources.length>240)throw Error('配色模板格式无效。请导入本工具导出的模板 JSON。');
    const used=new Set();
    for(const s of model.sources){
      if(!s||typeof s.file!=='string'||!s.file||s.file.length>250||used.has(s.file)||!Array.isArray(s.stats)||!s.stats.length||s.stats.length>40)throw Error('配色模板的来源记录无效。');
      used.add(s.file);const names=new Set();
      for(const v of s.stats){
        if(!v||typeof v.name!=='string'||!v.name.trim()||v.name.length>160||names.has(v.name)||!Number.isSafeInteger(v.count)||v.count<=0||v.count>7000||!Array.isArray(v.sum)||v.sum.length!==3||v.sum.some(n=>!Number.isSafeInteger(n)||n<0||n>255*v.count))throw Error('配色模板的取样统计无效。');
        names.add(v.name);
      }
    }
    return {format:FORMAT,revision:model.revision,sources:model.sources.map(s=>({file:s.file,stats:s.stats.map(v=>({name:v.name,side:v.side==='right'?'right':'left',count:v.count,sum:v.sum.slice()}))}))};
  }
  function aggregate(model){
    const groups=new Map();
    for(const src of model.sources)for(const row of src.stats){
      const key=row.name;
      if(!groups.has(key))groups.set(key,{name:key,side:row.side,count:0,sum:[0,0,0]});
      const a=groups.get(key);a.count+=row.count;row.sum.forEach((v,i)=>a.sum[i]+=v);
    }
    return [...groups.values()].map(v=>({name:v.name,side:v.side,count:v.count,color:hex(v.sum.map(n=>n/v.count))}));
  }
  function update(model,batch){
    const sources=new Map(model.sources.map(s=>[s.file,s]));let changed=0;
    for(const s of batch){const old=sources.get(s.file);if(!old||JSON.stringify(old.stats)!==JSON.stringify(s.stats)){sources.set(s.file,s);changed++;}}
    return changed?validate({format:FORMAT,revision:model.revision+1,sources:[...sources.values()]}):model;
  }
  function persisted(){
    try{const a=JSON.parse(localStorage.getItem(STORAGE)||'null');if(a)return {current:validate(a.current),previous:a.previous?validate(a.previous):null};}catch{}
    return {current:blank(),previous:null};
  }
  function save(model){
    const old=persisted();
    localStorage.setItem(STORAGE,JSON.stringify({current:validate(model),previous:old.current}));return persisted();
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);}
  function jsonOut(value,name){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),name);}
  function show(editor){
    if(typeof openModal!=='function')return;
    openModal('科学曲线仿真与配色校准','<div data-palette-tool class="stack"><div class="actions"><button type="button" class="btn" data-ct-tab="sim">物理模型示例</button><button type="button" class="btn" data-ct-tab="train">配色模板校准</button></div><div data-ct-body class="stack"></div><p data-ct-report role="status" aria-live="polite"></p></div>');
    const box=document.querySelector('[data-palette-tool]');if(!box)return;
    const body=box.querySelector('[data-ct-body]'),status=box.querySelector('[data-ct-report]');
    let tab='sim',type='stress',sim=null,canvas=null,busy=false;
    const values={stress:{},polar:{}};
    const say=m=>{status.textContent=m||'';};
    function button(id,name,primary=false,disabled=false){return '<button type="button" class="btn'+(primary?' primary':'')+'" data-ct="'+id+'"'+(disabled?' disabled':'')+'>'+safe(name)+'</button>';}
    function showSimulation(){
      const m=models[type];
      body.innerHTML='<label class="field">物理模型<select data-ct-model><option value="stress">弹塑性应力–应变</option><option value="polar">循环极化扫描</option></select></label><div class="actions" style="align-items:end">'+m.params.map(d=>'<label class="field" style="flex:1 1 135px">'+safe(d[1])+'<input data-ct-param="'+d[0]+'" type="number" min="'+d[3]+'" max="'+d[4]+'" step="'+d[5]+'" value="'+(values[type][d[0]]??d[2])+'"></label>').join('')+'</div><p class="cat-note">'+safe(m.note)+'</p><div class="actions">'+button('generate','生成曲线图',true)+'</div><canvas data-ct-plot aria-label="简化物理模型生成的曲线预览" style="width:100%;height:auto;max-height:330px;object-fit:contain;border:1px solid #d9e2ea;border-radius:6px"></canvas><p data-ct-meta class="cat-note"></p><div class="actions">'+button('png','下载样本图 PNG')+button('truth','下载参考点 JSON')+button('use','用此样本校准配色')+'</div>';
      body.querySelector('[data-ct-model]').value=type;canvas=body.querySelector('canvas');generate();
    }
    function generate(){
      const d=Object.fromEntries([...body.querySelectorAll('[data-ct-param]')].map(el=>[el.dataset.ctParam,el.valueAsNumber]));
      sim=simulator(type,d);values[type]=d;draw(sim,canvas);
      body.querySelector('[data-ct-meta]').textContent='模拟样本 · '+sim.meta.series.length+' 条曲线，'+sim.meta.series.reduce((n,s)=>n+s.points.length,0)+' 个带物理坐标和像素位置的参考点。';
      body.querySelectorAll('[data-ct="png"],[data-ct="truth"],[data-ct="use"]').forEach(b=>b.disabled=false);
    }
    function train(){
      const {current,previous}=persisted(),rows=aggregate(current),canApply=rows.length&&editor&&typeof editor.applyPaletteTemplate==='function'&&editor.editing&&editor.grabCanvas?.();
      body.innerHTML='<p class="cat-note">此处在浏览器内进行轻量配色校准。选择人工校核的原图和参考点，按标注位置读取实际像素，再按序列名称更新配色模板。同名图片再次校准时会替换该图的旧统计。</p><label class="field">参考图片<input type="file" data-ct-images accept="image/png,image/jpeg,image/webp" multiple></label><label class="field">参考标注 JSON（与批量评估格式相同）<input type="file" data-ct-reference accept=".json,application/json"></label><div class="actions">'+button('learn','从参考点校准',true)+'</div><h3>当前配色模板</h3><p class="cat-note">'+(rows.length?'版本 '+current.revision+' · '+current.sources.length+' 张图 · '+rows.reduce((n,s)=>n+s.count,0)+' 个有效参考点':'尚无模板。可先使用物理模型示例，或导入已校核样本。')+'</p>'+
        (rows.length?'<table style="width:100%;text-align:left"><thead><tr><th>序列</th><th>学习颜色</th><th>参考点</th></tr></thead><tbody>'+rows.map(s=>'<tr><td>'+safe(s.name)+'</td><td><span style="display:inline-block;width:1em;height:1em;background:'+s.color+';border-radius:3px;vertical-align:middle"></span> '+s.color+'</td><td>'+s.count+'</td></tr>').join('')+'</tbody></table>':'')+
        '<div class="actions">'+button('apply','用于当前曲线图',true,!canApply)+button('export','导出配色模板',false,!rows.length)+button('undo','回退上次校准',false,!previous)+'</div>'+(!canApply&&rows.length?'<p class="cat-note">在可编辑的曲线工作台打开图像后，即可应用模板。</p>':'')+'<label class="field">导入配色模板<input type="file" accept=".json,application/json" data-ct-import></label>';
    }
    function select(which){tab=which;box.querySelectorAll('[data-ct-tab]').forEach(b=>{b.classList.toggle('primary',b.dataset.ctTab===tab);b.setAttribute('aria-pressed',String(b.dataset.ctTab===tab));});say('');if(tab==='sim')showSimulation();else train();}
    function commit(batch){
      const was=persisted().current,now=update(was,batch);
      if(now!==was)save(now);
      select('train');say(now===was?'这些参考图的取样结果与当前模板一致。':'已生成版本 '+now.revision+'，可应用于当前曲线图。');
    }
    async function uploaded(){
      const files=[...body.querySelector('[data-ct-images]').files];const truth=body.querySelector('[data-ct-reference]').files[0];
      if(!files.length||!truth)throw Error('请选择参考图片及其配套标注 JSON。');
      if(new Set(files.map(f=>f.name)).size!==files.length)throw Error('本次校准的图片文件名应互不重复。');
      const data=JSON.parse(await truth.text());const batch=[];
      for(const f of files){
        const s=checkedReference(data,f.name);say('正在读取 '+f.name+' 的参考点…');
        const img=await createImageBitmap(f);
        try{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);batch.push({file:f.name,stats:pixelCalibration(ctx.getImageData(0,0,c.width,c.height),s)});}
        finally{img.close();}
        if(!box.isConnected)return;
      }
      commit(batch);
    }
    box.addEventListener('change',async e=>{
      try{
        if(e.target.matches('[data-ct-model]')){type=e.target.value;showSimulation();say('');}
        else if(e.target.matches('[data-ct-import]')&&e.target.files[0]){
          const v=validate(JSON.parse(await e.target.files[0].text()));if(!box.isConnected)return;
          if(!v.sources.length)throw Error('模板尚未包含任何样本。');
          save(v);train();say('配色模板已导入，可继续添加样本或应用到当前图像。');
        }
      }catch(err){say(err.message);}
    });
    box.addEventListener('input',e=>{
      if(!e.target.matches('[data-ct-param]'))return;
      body.querySelectorAll('[data-ct="png"],[data-ct="truth"],[data-ct="use"]').forEach(b=>b.disabled=true);
      say('参数已修改，请重新生成曲线图。');
    });
    box.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b||busy||b.disabled)return;
      try{
        if(b.dataset.ctTab){select(b.dataset.ctTab);return;}
        switch(b.dataset.ct){
          case 'generate':generate();say('已按当前参数生成样本。');break;
          case 'truth':jsonOut({[sim.filename]:sim.meta},sim.filename.replace('.png','-reference.json'));break;
          case 'png':{const current=sim.filename;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('样本图片未能生成。');download(blob,current);break;}
          case 'use':{const ctx=canvas.getContext('2d');commit([{file:sim.filename,stats:pixelCalibration(ctx.getImageData(0,0,W,H),sim.meta.series)}]);break;}
          case 'learn':busy=true;b.disabled=true;await uploaded();break;
          case 'apply':{const t=persisted().current;if(!editor?.isConnected||!editor?.editing||!editor?.grabCanvas?.())throw Error('请先在可编辑的工作台载入图片。');editor.applyPaletteTemplate({version:t.revision,series:aggregate(t)});say('配色模板已应用。返回工作台后点击“自动提取”。');break;}
          case 'export':{const m=persisted().current;jsonOut(m,'曲线配色模板-v'+m.revision+'.json');break;}
          case 'undo':{const m=persisted();if(!m.previous)return;localStorage.setItem(STORAGE,JSON.stringify({current:m.previous,previous:null}));train();say('已回退到上一份模板。');break;}
        }
      }catch(err){say(err.message||'操作未完成。');}
      finally{busy=false;if(b.dataset.ct==='learn'&&b.isConnected)b.disabled=false;}
    });
    select('sim');
  }
  document.addEventListener('click',e=>{const t=e.target.closest?.('[data-curve-train]');if(t){e.preventDefault();show(t.closest('ustb-curve-editor')||document.querySelector('ustb-curve-editor'));}});
  window.CurveTraining={open:show,simulator,pixelCalibration,validate,aggregate,update,checkedReference};
})();
