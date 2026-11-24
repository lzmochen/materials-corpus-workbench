'use strict';

function planProcessingAttr(key,id='') {
  return 'data-pp="'+escapeHtml(key)+'" data-id="'+escapeHtml(id)+'"';
}
function ppBtn(text,key,id='',primary=false) {
  return '<button type="button" class="btn '+(primary?'primary':'small')+'" '+planProcessingAttr(key,id)+'>'+escapeHtml(text)+'</button>';
}
const ppWorkflows=[
  {id:'extract',title:'材料要素抽取',input:'论文、实验记录或结构表',steps:'按字段抽取 → 对照原文核查 → 生成问答 → 规则质检'},
  {id:'facts',title:'原文事实问答',input:'有明确事实的段落、条款或表格行',steps:'定位事实证据 → 生成问答 → 规则质检'},
  {id:'compare',title:'定量比较问答',input:'含同一指标和可比较单位的已核准数据',steps:'配对同指标读数 → 计算差值 → 生成问答 → 规则质检'}
];

const ppTemplateNames={source:'按原文字段抽取',properties:'材料性能与测试',materials:'材料综合属性',process:'材料制备与热处理工艺'};
async function ppWorkflowForm() {
  const plans=await api(pipeBase+'/workflows');
  const rows=ppWorkflows.map(r=>[escapeHtml(r.title),escapeHtml(r.input),escapeHtml(r.steps),pipeWriter()?ppBtn('采用此流程','recipe',r.id):'']);
  rows.push(['科研曲线提取','应力–应变、极化等科学曲线图','图像识别 → 坐标校准 → 数据点校核 → 复核入库',workBtn('打开曲线工作台','nav','curve-work','small')]);
  const latest=new Map();
  plans.forEach(p=>latest.set(p.series,Math.max(latest.get(p.series)||0,p.revision)));
  const saved=plans.map(p=>[escapeHtml(p.title)+' · V'+p.revision,escapeHtml(pipeRecipes[p.params.recipe]),p.params.recipe==='extract'?ppTemplateNames[p.params.template]:p.params.maxCandidates+' 条',
    pipeWriter()?ppBtn('应用版本','apply-plan',p.id)+(latest.get(p.series)===p.revision?ppBtn('修订','edit-plan',p.id):''):'']);
  openModal('加工工作流编排','<div class="stack"><div class="split"><h3>执行路径</h3>'+ppBtn('查看运行记录','runs')+'</div>'+workTable(['制备方式','输入资料','执行步骤','操作'],rows)+'<div class="split"><h3>已保存方案</h3>'+(pipeWriter()?ppBtn('新建流程方案','edit-plan','',true):'')+'</div>'+(saved.length?workTable(['方案版本','执行路径','参数','操作'],saved):workEmpty('暂无自建流程方案','可保存制备方式、字段模板或候选数上限，在不同资料上重复使用。'))+'</div>');
}

async function ppPlan(id) {
  const plans=await api(pipeBase+'/workflows');
  const plan=plans.find(p=>p.id===id);
  if(!plan)throw Error('未找到该加工流程版本');
  return plan;
}
async function ppPlanForm(id) {
  if(!pipeWriter())return;
  const p=id?await ppPlan(id):null, cfg=p?.params||{recipe:'extract',template:'source'};
  openModal(p?'修订加工方案':'新建加工方案','<form data-pp-form="workflow" class="stack" data-prior="'+escapeHtml(id)+'"><label class="field">方案名称<input name="title" maxlength="75" required value="'+escapeHtml(p?.title||'')+'" '+(p?'readonly':'')+'></label><label class="field">执行路径<select name="recipe">'+workSelect(ppWorkflows.map(r=>[r.id,r.title]),cfg.recipe)+'</select></label><p data-pp-steps></p><label class="field" data-pp-field="template">抽取模板<select name="template">'+workSelect(Object.entries(ppTemplateNames),cfg.template||'source')+'</select></label><label class="field" data-pp-field="limit">候选数上限<input name="limit" type="number" min="1" max="200" required value="'+(cfg.maxCandidates||40)+'"></label><div class="actions">'+ppBtn('返回流程方案','workflow')+'<button type="submit" class="btn primary">保存方案版本</button></div></form>');
  ppPlanFields(wb('[data-pp-form="workflow"]'));
}
function ppPlanFields(f) {
  const recipe=f.elements.recipe.value,extract=recipe==='extract';
  f.querySelector('[data-pp-steps]').textContent=ppWorkflows.find(r=>r.id===recipe).steps;
  f.querySelector('[data-pp-field="template"]').hidden=!extract;f.elements.template.disabled=!extract;
  f.querySelector('[data-pp-field="limit"]').hidden=extract;f.elements.limit.disabled=extract;
}
async function ppUseRecipe(id,plan) {
  if(!pipeWriter()||!ppWorkflows.some(r=>r.id===id))return;
  wb('#workspace-dialog').close();
  await productionCommand('new-pipe');
  const form=wb('[data-pipe-form="create"]');
  if(!form)return;
  form.elements.recipe.value=id;
  form.elements.recipe.dispatchEvent(new Event('change',{bubbles:true}));
  if(plan){
    if(id==='extract')form.elements.template.value=plan.params.template;else form.elements.maxCandidates.value=plan.params.maxCandidates;
    // These parameters identify an immutable plan version. Editing them creates an ad-hoc run.
    const bound=document.createElement('input');bound.type='hidden';bound.name='workflowId';bound.value=plan.id;
    const caption=document.createElement('strong');caption.textContent=plan.title+' · V'+plan.revision;form.prepend(caption,bound);
    function unbind(ev){
      if(!['recipe','template','maxCandidates'].includes(ev.target.name))return;
      bound.remove();caption.textContent='自定义运行参数';form.removeEventListener('input',unbind);form.removeEventListener('change',unbind);
    }
    form.addEventListener('input',unbind);form.addEventListener('change',unbind);
  }
  form.elements.versionId.focus();
}

function ppSourceModality(version) {
  if(/\.(?:csv|tsv|xlsx?)$/i.test(version.filename))return '表格';
  if(/\.(?:png|jpe?g|webp)$/i.test(version.filename))return '图像';
  if(/\.(?:jsonl?|json5)$/i.test(version.filename))return '结构化记录';
  if(/\.pdf$/i.test(version.filename))return 'PDF 文献';
  return '文本';
}

async function ppTopics(selectedId='',creating=false) {
  const [collections,samples,resources]=await Promise.all(['/api/corpus-collections','/api/samples','/api/resources'].map(p=>api(p)));
  const catalog=new Map(resources.map(r=>[r.id,r])), sampleById=new Map(samples.map(s=>[s.id,s]));
  const esc=escapeHtml;
  const selected=collections.find(x=>x.id===selectedId);
  if(selected){
    const rows=selected.sampleIds.map(id=>{
      const s=sampleById.get(id),r=catalog.get(s?.resourceId);
      return [s?workBtn(s.question,'sample-open',id,'small'):esc(id),esc(r?.title||'—'),esc(s?.versionId||'—')];
    });
    openModal(selected.title,'<div class="stack">'+workTable(['问答样本','原文资料','原文版本'],rows)+'<div class="actions">'+ppBtn('返回专题目录','topics')+'</div></div>');
    return;
  }
  if(!creating || !pipeWriter()){
    const rows=collections.map(c=>[ppBtn(c.title,'topic-read',c.id),c.sampleIds.length,c.versionIds.length,workTime(c.createdAt)]);
    openModal('专题语料组织','<div class="stack"><div class="split"><h3>专题目录</h3>'+(pipeWriter()?ppBtn('新建专题','topic-new','',true):'')+'</div>'+(rows.length?workTable(['专题名称','问答样本','原文版本','建立时间'],rows):workEmpty('暂无自建专题','按研究任务选取质检通过的样本，同一条问答可编入多个专题。'))+'</div>');return;
  }
  const candidates=[];
  for(const s of samples){
    const r=catalog.get(s.resourceId),v=r?.versions.find(v=>v.id===s.versionId);
    if(s.status==='passed' && r?.split==='train' && v?.status==='approved')candidates.push({sample:s,resource:r,family:guideFamily(r),topic:guideResourceTopic(r),modality:ppSourceModality(v)});
  }
  const filters=[['材料门类','family'],['任务专题','topic'],['原文模态','modality']].map(([label,key])=>{
    const options=Array.from(new Set(candidates.map(row=>row[key]))).sort().map(s=>[s,s]);
    return '<label class="field">'+label+'<select name="'+key+'">'+workSelect([['','全部'],...options])+'</select></label>';
  }).join('');
  openModal('新建专题语料组','<form class="stack" data-pp-form="topic">'+workField('专题名称','title',{max:100})+'<div class="grid-2">'+filters+'</div><div class="split"><strong data-pp-count aria-live="polite"></strong>'+ppBtn('选中筛选结果','topic-select')+'</div><div data-pp-candidates style="max-height:36vh;overflow:auto"></div><div class="actions">'+ppBtn('返回专题目录','topics')+'<button class="btn primary" type="submit">保存专题</button></div></form>');
  const f=wb('[data-pp-form="topic"]');
  f.topicRows=candidates;f.picked=new Set();ppTopicRows(f);
}

function ppTopicRows(f) {
  const visible=f.topicRows.filter(r=>['family','topic','modality'].every(k=>!f.elements[k].value||r[k]===f.elements[k].value));
  f.visibleRows=visible;
  f.querySelector('[data-pp-count]').textContent='筛选到 '+visible.length+' 条 · 已选 '+f.picked.size+' 条';
  const rows=visible.map(({sample,resource})=>['<input type="checkbox" name="sample" value="'+escapeHtml(sample.id)+'" aria-label="选择这条样本"'+(f.picked.has(sample.id)?' checked':'')+'>',escapeHtml(sample.question),escapeHtml(resource.title)]);
  f.querySelector('[data-pp-candidates]').innerHTML=rows.length?workTable(['选择','问答','原文'],rows):workEmpty('当前筛选没有样本');
}

const ppKinds={point:'特征点',rect:'矩形区域',line:'折线／曲线点列',polygon:'多边形区域'};

async function ppImages() {
  const pairs=workScopeRows(await api('/api/multimodal-pairs'),'catalog');
  const rows=pairs.map(p=>[ppBtn(p.image.title,'image-edit',p.id),escapeHtml(p.evidence.location),escapeHtml(p.text.title),(p.regions||[]).length]);
  openModal('多模态证据标注','<div class="stack"><div class="split"><h3>图像与原文证据</h3>'+workBtn('科学曲线识别与标注','nav','curve-work')+ (guideWritable()?'<button class="btn primary" type="button" data-guide="new-pair">新建图文配对</button>':'')+'</div>'+(rows.length?workTable(['图像原件','引用位置','配对文本','区域标注'],rows):workEmpty('暂无图文配对','先将一份图像与已核准的文本或表格证据配对。'))+'<div class="actions">'+ppBtn('配对库与导出','pair-library')+'</div></div>');
}

function ppDraw(f) {
  if(!f.picture.complete||!f.picture.naturalWidth)return;
  const cv=f.querySelector('canvas'), ctx=cv.getContext('2d'),w=cv.width,h=cv.height;
  const pen=Math.max(2,Math.round(Math.max(w,h)/300)),scale=Math.max(w,h)/650;
  ctx.clearRect(0,0,w,h);ctx.drawImage(f.picture,0,0,w,h);
  const shapes=[...f.entries,{kind:f.elements.kind?.value,points:f.draft}];
  shapes.forEach((r,i)=>{
    if(!r.points.length)return;
    const draft=i===f.entries.length,points=r.points.map(([x,y])=>[x*w,y*h]);
    function trace(){
      ctx.beginPath();
      const [x,y]=points[0];
      if(r.kind==='point'||points.length===1){ctx.arc(x,y,pen*2,0,Math.PI*2);return;}
      if(r.kind==='rect'){ctx.rect(x,y,points[1][0]-x,points[1][1]-y);return;}
      ctx.moveTo(x,y);points.slice(1).forEach(p=>ctx.lineTo(...p));if(r.kind==='polygon'&&points.length>=3)ctx.closePath();
    }
    ctx.lineJoin='round';trace();ctx.lineWidth=pen+2*scale;ctx.strokeStyle='white';ctx.stroke();ctx.lineWidth=pen;
    ctx.strokeStyle=draft?'#bb4c10':'#005d91';ctx.stroke();
    if(!draft){
      const [x,y]=points[0];ctx.font='bold '+Math.round(14*scale)+'px sans-serif';
      const text=String(i+1),px=Math.max(0,Math.min(w-26*scale,x)),py=Math.max(18*scale,Math.min(h,y));
      ctx.fillStyle='#005d91';ctx.fillRect(px,py-17*scale,24*scale,17*scale);ctx.fillStyle='white';ctx.fillText(text,px+4*scale,py-3*scale);
    }
  });
}

function ppImageState(f) {
  f.querySelector('[data-pp-entries]').innerHTML=f.entries.length?workTable(['序号','形态','标记对象',''],f.entries.map((r,i)=>[i+1,ppKinds[r.kind],escapeHtml(r.label),f.editable?ppBtn('移除','shape-remove',i.toString()):''])):workEmpty('尚未记录区域标注');
  if(f.editable){
    f.querySelector('[data-pp-points]').textContent='已定位 '+f.draft.length+' 个点';
    const kind=f.elements.kind.value;
    f.querySelector('[data-pp="shape-add"]').disabled=f.draft.length<({point:1,rect:2,line:2,polygon:3})[kind]||!f.elements.label.value.trim();
    f.querySelector('[type="submit"]').disabled=JSON.stringify(f.entries)===f.saved||f.draft.length>0;
    f.querySelector('[data-pp="shape-undo"]').disabled=!f.draft.length;
  }
  ppDraw(f);
}

async function ppImageEditor(id) {
  const pair=await api('/api/multimodal-pairs/'+encodeURIComponent(id));
  const source=pair.image, file=await api('/api/resources/'+encodeURIComponent(source.resourceId)+'/versions/'+encodeURIComponent(source.versionId)+'/file');
  const editable=guideWritable();
  const actions=editable?'<div class="grid-2"><label class="field">标注形态<select name="kind">'+workSelect(Object.entries(ppKinds))+'</select></label><label class="field">标记对象<input name="label" maxlength="140" placeholder="如 晶界、孔隙或谱峰"></label></div><p>在图中依次点选位置。矩形选取两个对角，折线和多边形依次点选顶点。</p><details><summary>按坐标定位</summary><div class="grid-2"><label class="field">横坐标（%）<input name="x" type="number" min="0" max="100" step="any"></label><label class="field">纵坐标（%）<input name="y" type="number" min="0" max="100" step="any"></label></div>'+ppBtn('加入坐标点','shape-point')+'</details><div class="actions"><span data-pp-points aria-live="polite"></span>'+ppBtn('撤销末点','shape-undo')+ppBtn('加入标注','shape-add')+'</div>':'';
  openModal('图像证据标注','<form class="stack" data-pp-form="image"><div><h3>'+escapeHtml(source.title)+'</h3><small>'+escapeHtml(source.filename)+' · 区域标注修订 '+Number(pair.regionRevision||0)+'</small></div><canvas aria-label="原图与标注位置" style="max-width:100%;max-height:48vh;width:auto;height:auto;justify-self:center;align-self:center;touch-action:manipulation;cursor:'+(editable?'crosshair':'default')+'"></canvas>'+actions+'<div data-pp-entries></div><details><summary>查看关联原文证据</summary><strong>'+escapeHtml(pair.evidence.location)+'</strong><p>'+escapeHtml(pair.evidence.text)+'</p></details><div class="actions">'+ppBtn('返回图像列表','image')+(editable?'<button type="submit" class="btn primary">保存区域标注</button>':'')+'</div></form>');
  const f=wb('[data-pp-form="image"]');Object.assign(f,{pair,editable,entries:structuredClone(pair.regions||[]),saved:JSON.stringify(pair.regions||[]),draft:[],picture:new Image()});
  f.picture.src='data:'+(/\.png$/i.test(source.filename)?'image/png':'image/jpeg')+';base64,'+file.contentBase64;
  await f.picture.decode();if(!f.isConnected)return;
  const cv=f.querySelector('canvas'),ratio=Math.min(1,1600/Math.max(f.picture.naturalHeight,f.picture.naturalWidth));
  cv.width=Math.max(1,Math.round(f.picture.naturalWidth*ratio));cv.height=Math.max(1,Math.round(f.picture.naturalHeight*ratio));
  if(editable)cv.addEventListener('click',e=>{const b=cv.getBoundingClientRect();ppPoint(f,(e.clientX-b.left)/b.width,(e.clientY-b.top)/b.height);});
  ppImageState(f);
}

function ppPoint(f,x,y) {
  if(![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)){notify('坐标需在原图的 0–100% 范围内。','error');return;}
  const cap={point:1,rect:2,line:96,polygon:96}[f.elements.kind.value];
  if(f.draft.length>=cap){notify('已选够该形态的点，请加入标注或撤销末点。','error');return;}
  f.draft.push([Number(x.toFixed(6)),Number(y.toFixed(6))]);ppImageState(f);
}

function ppSuggest(el) {
  const form=el.closest('[data-form="ex-annotation-edit"]'),row=el.closest('[data-ex-step]'),field=row.querySelector('textarea');
  if(field.value.trim()){notify('本步已有说明。如需重新起草，请先调整或清空本步内容。');return;}
  const ids=Array.from(row.querySelectorAll('input[name="blockId"]:checked'),v=>v.value);
  if(!ids.length){notify('请先勾选本步要引用的原文证据。','error');return;}
  const blocks=exState.blocks.filter(b=>ids.includes(b.id));
  if(!blocks.length)return;
  field.value=blocks.map(b=>b.location+'：'+b.text).join('\n').slice(0,2000);
  exSyncEditor(form,exEditorViews.get(form.dataset.id),true);field.focus();notify('已起草本步，请核对原文并补写判断依据。');
}

async function planProcessingOpen(key,id='',el=null) {
  switch(key){
    case 'extract': return productionCommand('extract');
    case 'workflow': return ppWorkflowForm();
    case 'recipe': return ppUseRecipe(id);
    case 'edit-plan': return ppPlanForm(id);
    case 'apply-plan': {const plan=await ppPlan(id);return ppUseRecipe(plan.params.recipe,plan);}
    case 'runs': return productionCommand('pipes');
    case 'filter': return pipeWriter()?distillCreate():distillLibrary();
    case 'review': return navigate('annotations');
    case 'image': return ppImages();
    case 'image-edit': return ppImageEditor(id);
    case 'pair-library': return guidePairLibrary();
    case 'qa': return productionCommand(pipeWriter()?'new-pipe':'pipes');
    case 'topics': return ppTopics();
    case 'topic-read': return ppTopics(id);
    case 'topic-new': return ppTopics('',true);
    case 'versions': return navigate('releases');
    case 'prefill': return ppSuggest(el);
    case 'topic-select': {
      const f=el.form;f.visibleRows.forEach(r=>f.picked.add(r.sample.id));return ppTopicRows(f);
    }
  }
  const f=el?.closest('[data-pp-form="image"]');if(!f?.editable)return;
  switch(key){
    case 'shape-remove': f.entries.splice(Number(id),1);break;
    case 'shape-undo': f.draft.pop();break;
    case 'shape-point':
      if(f.elements.x.value===''||f.elements.y.value===''){notify('请同时填写横、纵坐标。','error');return;}
      return ppPoint(f,f.elements.x.valueAsNumber/100,f.elements.y.valueAsNumber/100);
    case 'shape-add':
      if(f.entries.length>=40){notify('每份图文配对最多保存 40 个标注。','error');return;}
      f.entries.push({kind:f.elements.kind.value,label:f.elements.label.value.trim(),points:f.draft});
      f.draft=[];f.elements.label.value='';break;
    default:return;
  }
  ppImageState(f);
}

document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-pp]');if(!button||button.disabled)return;
  const key=button.dataset.pp;
  try{await planProcessingOpen(key,button.dataset.id,button);}catch(error){notify(error.message,'error');}
});
document.addEventListener('change',e=>{
  const f=e.target.closest('[data-pp-form]');if(!f)return;
  if(f.dataset.ppForm==='workflow'&&e.target.name==='recipe')ppPlanFields(f);
  if(f.dataset.ppForm==='image'&&e.target.name==='kind'){f.draft=[];ppImageState(f);}
  if(f.dataset.ppForm!=='topic')return;
  if(e.target.name==='sample'){
    const input=e.target;input.checked?f.picked.add(input.value):f.picked.delete(input.value);
    f.querySelector('[data-pp-count]').textContent='筛选到 '+f.visibleRows.length+' 条 · 已选 '+f.picked.size+' 条';
  }else if(e.target.tagName==='SELECT')ppTopicRows(f);
});
document.addEventListener('input',e=>{
  const f=e.target.closest('[data-pp-form="image"]');if(f&&e.target.name==='label')ppImageState(f);
});
document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-pp-form]');if(!f)return;
  e.preventDefault();const submit=e.submitter;if(!submit||submit.disabled)return;submit.disabled=true;
  try{
    if(f.dataset.ppForm==='workflow'){
      const recipe=f.elements.recipe.value;
      const data={title:f.elements.title.value,previousId:f.dataset.prior,recipe};
      if(recipe==='extract')data.template=f.elements.template.value;else data.maxCandidates=f.elements.limit.valueAsNumber;
      const record=await api(pipeBase+'/workflows','POST',data);
      await ppWorkflowForm();notify('已保存加工方案 V'+record.revision+'。');
    }else if(f.dataset.ppForm==='topic'){
      if(!f.picked.size)throw new Error('请先选择要编入专题的样本。');
      const r=await api('/api/corpus-collections','POST',{title:f.elements.title.value,sampleIds:[...f.picked]});
      await ppTopics(r.id);notify('已保存专题及样本引用。');
    }else if(f.dataset.ppForm==='image'&&f.editable&&!f.draft.length){
      const r=await api('/api/multimodal-pairs/'+encodeURIComponent(f.pair.id)+'/regions','POST',{revision:f.pair.regionRevision||0,regions:f.entries});
      await ppImageEditor(r.id);notify('已保存区域标注。');
    }
  }catch(error){notify(error.message,'error');}finally{if(submit.isConnected)submit.disabled=false;}
});
