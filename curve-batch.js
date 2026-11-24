'use strict';
(() => {
  const fileUrl = name => new URL(name, document.baseURI);
  const isNumber = Number.isFinite;
  const safe = value => escapeHtml(value);
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g,'');
  const sampleKeys = ['curve-stress.png','curve-polarization.png'];
  function download(value, name) {
    const href = URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a'); a.href=href; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(href),2000);
  }
  async function sampleJson() {
    const response=await fetch(fileUrl('curve-reference.json'));
    if (!response.ok) throw Error('无法打开教学参考点。');
    return response.json();
  }
  function summary(result, reference) {
    let legendTotal=0,legendCorrect=0,pointTotal=0,pointCorrect=0;
    const channels=hex=>/^#[a-f\d]{6}$/i.test(hex)?[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)):null;
    const usedSeries=new Set();
    for(const expected of reference?.series||[]) {
      const targetColor=channels(expected.color);
      if(!targetColor || !Array.isArray(expected.points)) throw Error('参考曲线需要十六进制颜色与 points 点集。');
      legendTotal++;
      const closest=result.series.filter(s=>!usedSeries.has(s.id)).map(s=>{
        const color=channels(s.color);
        return {s,cost:color?Math.hypot(...color.map((v,i)=>v-targetColor[i])):Infinity};
      }).sort((a,b)=>a.cost-b.cost)[0];
      const match=closest && closest.cost<=80 ? closest.s : null;
      if(match) usedSeries.add(match.id);
      if(match && norm(match.name)===norm(expected.name)) legendCorrect++;
      const usedPoints=new Set();
      for(const truth of expected.points) {
        if(![truth.px,truth.py,truth.x,truth.y].every(isNumber)) throw Error('每个参考点须包含数值 px、py、x、y。');
        if(truth.x===0 && truth.y===0) continue;
        pointTotal++;
        if(!match) continue;
        const range=Math.max(3,Math.hypot(result.width,result.height)*.012);
        let best=null,dist=range;
        match.points.forEach((point,index)=>{
          if(usedPoints.has(index))return;
          const d=Math.hypot(truth.px-point.px,truth.py-point.py);
          if(d<dist){best={index,point};dist=d;}
        });
        if(!best)continue;
        usedPoints.add(best.index);
        const errors=['x','y'].filter(k=>truth[k]!==0).map(k=>Math.abs((best.point[k]-truth[k])/truth[k]));
        if(errors.reduce((a,b)=>a+b,0)/errors.length<.1)pointCorrect++;
      }
    }
    return {pointTotal,pointCorrect,legendTotal,legendCorrect};
  }
  async function identify(file,batch=null,last=false){
    const start=performance.now(), img=await createImageBitmap(file);
    const width=img.width,height=img.height;
    if(width*height>16000000){img.close();throw Error('图像超过一千六百万像素，请先裁出图表区域。');}
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);img.close();
    const image=ctx.getImageData(0,0,width,height);
    const ocr=await CurveLabels.readText(canvas,undefined,batch);
    const result=CurveOperator.extract(image,ocr,file.name);
    if(last && batch)await batch.close();
    return {...result,seconds:(performance.now()-start)/1000};
  }
  window.curveExtractFile = identify;
  function showBatch(){
    openModal('批量曲线识别与评估','<form class="stack" data-cb-form><label class="field">曲线图片<input type="file" name="images" accept="image/png,image/jpeg,image/webp" multiple></label><label class="field">参考点与图例（可选 JSON）<input type="file" name="truth" accept=".json"></label><p class="cat-note">每张图分别识读坐标和图例、提取曲线并记录耗时。导入参考标注后，可检查数据点误差和图例配对。</p><div class="actions"><button type="submit" class="btn primary">识别所选图片</button><button type="button" class="btn" data-cb-demo>评估两张教学示例</button><button type="button" class="btn" data-cb-template>下载参考标注样例</button><button type="button" class="btn" data-curve-train>仿真样本与配色模板</button></div><p data-cb-status role="status"></p><div data-cb-results></div></form>');
    const f=document.querySelector('[data-cb-form]');
    f.querySelector('[data-cb-template]').onclick=async()=>{try{download(await sampleJson(),'曲线参考标注样例.json');}catch(e){notify(e.message,'error');}};
    const run=async demo=>{
      if(f.dataset.busy)return;f.dataset.busy='1';
      const report=f.querySelector('[data-cb-results]'), status=f.querySelector('[data-cb-status]');
      const buttons=[...f.querySelectorAll('button')];
      buttons.forEach(b=>b.disabled=true);report.replaceChildren();
      const batch=CurveLabels.createOCRBatch();
      try{
        let files=[...f.elements.images.files],truth={};
        if(demo){
          truth=await sampleJson();files=await Promise.all(sampleKeys.map(async n=>{const r=await fetch(fileUrl(n));if(!r.ok)throw Error('教学图无法读取');return new File([await r.blob()],n,{type:'image/png'});}));
        }else if(f.elements.truth.files[0])truth=JSON.parse(await f.elements.truth.files[0].text());
        if(!files.length)throw Error('请选择至少一张曲线图。');
        const rows=[], totals={pointTotal:0,pointCorrect:0,legendTotal:0,legendCorrect:0};
        for(const [i,file] of files.entries()){
          if(!f.isConnected)return;
          status.textContent='正在识别 '+(i+1)+' / '+files.length+' · '+file.name;
          let row;
          try { row=await identify(file,batch,i===files.length-1); }
          catch(e){ row={filename:file.name,series:[],width:0,height:0,error:e.message}; }
          if(Object.hasOwn(truth,file.name)){
            const ref=truth[file.name];
            if(!ref||!Array.isArray(ref.series))throw Error(file.name+' 的参考数据缺少曲线列表。');
            row.metric=summary(row,ref);
            for(const key of Object.keys(totals))totals[key]+=row.metric[key];
          }
          rows.push(row);
        }
        const done=rows.filter(s=>!s.error),mean=done.reduce((n,r)=>n+r.seconds,0)/done.length;
        status.textContent='已完成 '+done.length+' / '+files.length+' 张'+(done.length?'，平均 '+mean.toFixed(2)+' 秒/图。':'。');
        const rate=(c,n)=>n?(100*c/n).toFixed(1)+'%（'+c+'/'+n+'）':'未提供参考值';
        report.innerHTML=workTable(['图像','曲线 / 点数','处理耗时','识读状态'],rows.map(r=>[safe(r.filename),r.error?'—':r.series.length+' / '+r.series.reduce((n,s)=>n+s.points.length,0),r.error?'—':r.seconds.toFixed(2)+' 秒',safe(r.error||r.warnings.join(' ')||'已生成候选')]))+
          '<div class="stack"><p>数据点符合率 '+rate(totals.pointCorrect,totals.pointTotal)+'　图例对应正确率 '+rate(totals.legendCorrect,totals.legendTotal)+'</p><details><summary>评估口径与招标指标</summary><p>按参考图形颜色一对一匹配曲线，在对角线 1.2% 距离内匹配未占用的最近点。物理坐标各非零分量的绝对百分比误差均值小于 10% 计为符合；缺失识别计为未通过。图例须同时匹配曲线颜色和文字。耗时包含图片解码、OCR 与点集结构化。</p><p>约定测试集的目标为数据点符合率不低于 80%、图例对应正确率大于 90%、批量平均耗时小于 3 秒/图。教学样例仅用于核对操作及计算方式。</p></details><button type="button" class="btn" data-cb-out>下载批量结果与评估明细</button></div>';
        report.querySelector('[data-cb-out]').onclick=()=>download({images:rows,totals},'曲线批量识别与评估.json');
      }catch(e){status.textContent=e.message;}finally{
        try { await batch.close(); } finally { delete f.dataset.busy;buttons.forEach(b=>b.disabled=false); }
      }
    };
    f.onsubmit=e=>{e.preventDefault();run(false);};f.querySelector('[data-cb-demo]').onclick=()=>run(true);
  }
  function validated(candidate,w,h){
    const roi=candidate?.roi;
    if(!roi||![roi.left,roi.top,roi.right,roi.bottom].every(isNumber)||roi.left<0||roi.top<0||roi.right>w||roi.bottom>h||roi.left>=roi.right||roi.top>=roi.bottom)throw Error('返回的绘图区超出原图或格式错误。');
    const axes={};
    for(const key of ['x','y','y2']){
      const a=candidate.axes?.[key];if(!a&&key==='y2')continue;
      if(!a || ![a.min,a.max].every(isNumber)||a.max<=a.min||!['linear','log'].includes(a.scale)||a.scale==='log'&&a.min<=0)throw Error('模型未给出可靠的 '+key.toUpperCase()+' 轴刻度。');
      axes[key]={min:a.min,max:a.max,scale:a.scale,reverse:a.reverse===true,label:String(a.label||'').slice(0,130)};
    }
    const legend=(Array.isArray(candidate.legend)?candidate.legend:[]).filter(s=>s && /^#[0-9a-f]{6}$/i.test(s.color)).map(s=>({name:String(s.name||'').slice(0,120),color:s.color,side:s.side==='right'?'right':'left'}));
    return {roi:{left:roi.left,right:roi.right,top:roi.top,bottom:roi.bottom},axes,legend};
  }
  function showModel(editor){
    const picture=editor?.grabCanvas?.();
    if(!picture){notify('请先载入曲线图。','error');return;}
    openModal('视觉语言模型辅助标定','<form class="stack" data-cb-model><label class="field">视觉模型 Chat Completions 接口<input name="url" type="url" required placeholder="https://…/v1/chat/completions"></label><label class="field">模型名称<input name="model" required></label><label class="field">访问密钥（如需要）<input name="secret" type="password" autocomplete="off"></label><p class="cat-note">点击下方按钮会将当前曲线图发送至所填服务。接口须支持图像输入并允许本页面跨域访问。</p><button type="submit" class="btn primary">发送当前图并读取标定建议</button><p role="status"></p><div data-cb-output></div></form>');
    const f=document.querySelector('[data-cb-model]'),status=f.querySelector('[role=status]'),out=f.querySelector('[data-cb-output]');
    f.onsubmit=async e=>{
      e.preventDefault();out.replaceChildren();const b=f.querySelector('[type=submit]');b.disabled=true;
      try{
        const url=new URL(f.elements.url.value);
        if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('请输入 HTTPS 服务或本机地址。');
        const key=f.elements.secret.value,model=f.elements.model.value.trim(),headers={'Content-Type':'application/json'};if(key)headers.Authorization='Bearer '+key;
        status.textContent='正在读取模型建议…';
        const prompt='识别科学曲线图。仅返回JSON对象，roi为绘图区原始像素left,top,right,bottom；axes含x,y，可选y2，各含min,max（严格升序）、scale（linear或log）、reverse（对刻度方向取反）、label（含单位）；legend是{name,color（#rrggbb）,side（left或right）}列表。像素原点左上。无法识读的轴请返回null，勿猜测。原图尺寸 '+picture.width+' × '+picture.height;
        const resp=await fetch(url.href,{method:'POST',mode:'cors',redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',headers,signal:AbortSignal.timeout(90000),body:JSON.stringify({model,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:picture.toDataURL('image/png')}}]}]})});
        if(!resp.ok)throw Error('模型服务返回 HTTP '+resp.status+'，请检查地址、权限及模型名称。');
        const body=await resp.json();const raw=body.choices?.[0]?.message?.content;if(typeof raw!=='string')throw Error('模型没有返回结构化标定建议。');
        const result=validated(JSON.parse(raw.trim().replace(/^\x60{3}(?:json)?\s*/i,'').replace(/\s*\x60{3}$/,'')),picture.width,picture.height);
        status.textContent='请核对候选范围与图例后再应用。';
        out.innerHTML=workTable(['坐标轴','范围','类型'],Object.entries(result.axes).map(([k,a])=>[safe(k+' '+a.label),safe(a.min+' 至 '+a.max),a.scale==='log'?'对数':'线性']))+'<p>图例 '+safe(result.legend.map(l=>l.name).join('、')||'未识读')+'</p><button class="btn primary" type="button">填入校准面板</button>';
        out.querySelector('button').onclick=()=>{closeModal();editor.applyCalibration(result);};
      }catch(err){status.textContent=err.message;}finally{b.disabled=false;}
    };
  }
  document.addEventListener('click',e=>{
    if(e.target.closest('[data-curve-batch]'))showBatch();
    if(e.target.closest('[data-curve-model]'))showModel(document.querySelector('ustb-curve-editor'));
  });
})();
