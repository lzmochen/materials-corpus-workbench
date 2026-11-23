'use strict';

const caseStorageKey = 'materials-case-trail-v1';
let caseChoice = {};
try {
  const saved = JSON.parse(sessionStorage.getItem(caseStorageKey) || '{}');
  if (saved && typeof saved.resourceId === 'string' && typeof saved.versionId === 'string') caseChoice = saved;
} catch {}
let caseScreen = null;

function rememberCaseTrail(resourceId, versionId, sampleId = '', batchId = '', extractionId = '') {
  if (!resourceId || !versionId) return;
  caseChoice = {resourceId, versionId, sampleId, batchId, extractionId};
  try { sessionStorage.setItem(caseStorageKey, JSON.stringify(caseChoice)); } catch {}
}
async function openCaseTrail(resourceId, versionId, sampleId = '') {
  if (resourceId && versionId) rememberCaseTrail(resourceId, versionId, sampleId);
  await navigate('workflow');
}
function trailButton(key,label,primary=false) {
  return '<button type="button" class="btn '+(primary?'primary':'small')+'" data-trail-action="'+key+'">'+escapeHtml(label)+'</button>';
}
function trailSelect(label, key, options, value) {
  return '<label class="ct-field"><span>'+escapeHtml(label)+'</span><select data-trail-select="'+key+'">'+workSelect(options,value)+'</select></label>';
}
function trailStage(label,state,tone,subject,button,owner='') {
  return {label,state,tone,subject,button,owner};
}
function trailProgress(rows) {
  const next=rows.findIndex(row=>row.tone!=='complete');
  const count=rows.filter(row=>row.tone==='complete').length;
  const stages=rows.map((row,index)=>{
    const current=index===next;
    const owner=row.owner && row.tone!=='complete' ? '<span class="ct-owner">'+escapeHtml(row.owner)+'</span>' : '';
    return '<li class="ct-stage'+(current?' ct-current':'')+'"'+(current?' aria-current="step"':'')+'><div class="ct-stage-title"><span class="ct-index '+row.tone+'" aria-hidden="true">'+(index+1)+'</span><div><h3>'+escapeHtml(row.label)+'</h3>'+owner+'</div></div><div class="ct-detail"><strong>'+escapeHtml(row.state)+'</strong><span>'+escapeHtml(row.subject)+'</span></div><div class="ct-action">'+(row.button||'')+'</div></li>';
  }).join('');
  return '<div class="ct-summary"><span><b>'+count+' / '+rows.length+'</b> 个环节已完成</span><strong>'+escapeHtml(next<0?'本条办理流程已完成':'当前环节 · '+rows[next].label)+'</strong></div><ol class="ct-stages">'+stages+'</ol>';
}
function trailBenchmarkTask(benchmark) {
  const items=benchmark.items||[];
  const actor=window.workspaceUser.username;
  const lead=workCan('lead','admin');
  if(benchmark.status==='published') return ['查看冻结基准','',false];
  if(benchmark.status==='draft') {
    const canEdit=benchmark.owner===actor || lead;
    return [canEdit?'编制评测题':'查看评测进度','命题人 · '+reviewOwner(benchmark.owner),canEdit];
  }
  const conflict=items.some(item=>item.reviewState==='conflict');
  if(conflict && lead && benchmark.owner!==actor) return ['处理仲裁','评测负责人',true];
  if(items.length && items.every(item=>item.reviewState==='accepted')) return [lead?'办理冻结发布':'查看评测进度','评测负责人',lead];
  if(workCan('expert') && benchmark.owner!==actor && items.some(item=>item.reviewState==='pending'&&!item.hasReviewed)) return ['办理独立评分','评审专家',true];
  return ['查看评测进度',conflict?'评测负责人仲裁':'评审专家独立评分',false];
}
function trailLatest(rows) {
  return rows.slice().sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''));
}
function trailChoose(data) {
  const visible=r=>r.catalogTier!=='archived-practice';
  const resources=trailLatest(data.resources.filter(r=>r.split==='train' && r.versions?.length && (visible(r)||r.id===caseChoice.resourceId)));
  const completed=data.benchmarks.find(b=>b.handoff?.annotationId && b.status==='published') || data.benchmarks.find(b=>b.handoff?.annotationId);
  const research=data.resources.find(row=>row.seedKey==='research-sic-solubility-v1');
  const scholarly=research && data.annotations.find(a=>a.resourceId===research.id);
  const example = scholarly || completed?.handoff || data.annotations.find(a=>a.status==='approved'&&visible(a)) || data.annotations.find(visible);
  const exampleSample=data.samples.find(s=>s.id===example?.sampleId);
  const preferred=caseChoice.resourceId ? caseChoice : {resourceId:exampleSample?.resourceId,versionId:exampleSample?.versionId,sampleId:exampleSample?.id};
  const resource = resources.find(r=>r.id===preferred.resourceId) || resources[0];
  if(!resource) return {resources};
  const versions = resource.versions.slice().sort((a,b)=>b.number-a.number);
  const version = versions.find(v=>v.id===preferred.versionId) || versions.find(v=>v.id===resource.activeVersion) || versions[0];
  const same = row=>row.resourceId===resource.id && row.versionId===version.id;
  const batches=trailLatest(data.batches.filter(same));
  const available=trailLatest(data.samples.filter(same));
  const requestedSample=available.find(s=>s.id===preferred.sampleId);
  const extractions=trailLatest(data.extractions.filter(same));
  const branches=trailLatest([
    ...batches.map(b=>({...b,kind:'batch'})),
    ...extractions.filter(e=>!batches.some(b=>b.id===e.batchId || b.extractionId===e.id)).map(e=>({...e,kind:'extraction'}))
  ]);
  const priorExtraction=extractions.find(e=>e.id===preferred.extractionId);
  const target=requestedSample?.batchId || preferred.batchId || priorExtraction?.batchId || preferred.extractionId;
  const branch=branches.find(b=>b.id===target) || branches.find(b=>b.extractionId===target) || branches[0];
  const batch=branch?.kind==='batch' ? branch : null;
  const samples=batch ? available.filter(s=>s.batchId===batch.id) : [];
  const sample=samples.find(s=>s.id===requestedSample?.id) || samples.find(s=>s.status==='passed') || samples[0];
  const annotation=sample && data.annotations.find(a=>a.sampleId===sample.id && (!a.versionId||a.versionId===version.id) && (!a.resourceId||a.resourceId===resource.id));
  const benchmark=annotation && data.benchmarks.find(b=>b.handoff?.annotationId===annotation.id && b.handoff.sampleId===sample.id && b.handoff.resourceId===resource.id && b.handoff.versionId===version.id);
  const extraction=batch ? extractions.find(e=>e.batchId===batch.id || e.id===batch.extractionId) : branch;
  return {resources,resource,versions,version,branches,branch,batch,samples,sample,annotation,benchmark,extraction};
}
function trailRows(record,data) {
  const {version,resource,batch,samples,sample,annotation,benchmark,extraction}=record;
  const manager=workCan('operator','lead','admin');
  const approved=version.status==='approved';
  const rows=[trailStage('原文登记与核准',workStatuses[version.status]?.[0]||version.status,approved?'complete':'active',
    version.filename+' · v'+version.number,trailButton('source',approved||!manager?'查看原文':'办理原文核查',manager&&!approved),'数据管理员')];
  const pass=samples.filter(s=>s.status==='passed').length;
  if(batch){
    const needsReview=sample?.status==='candidate' && sample.quality?.requiresExpert;
    const done=batch.status==='reviewed' && sample?.status==='passed';
    const review=needsReview && workCan('expert','lead','admin');
    rows.push(trailStage('问答生成与质检',needsReview?'当前问答待专家复核':sample?.status==='rejected'?'当前问答已剔除':workStatuses[batch.status]?.[0]||batch.status,done?'complete':'active',
      batch.title+' · '+samples.length+' 条问答，'+pass+' 条通过',review?trailButton('inspect','复核当前问答',true):trailButton('batch',done||!manager?'查看语料批次':'办理当前批次',manager&&!done),needsReview?'评审专家':'数据管理员'));
  }else if(extraction){
    const counts=extraction.counts || {};
    const state=counts.pending?'待核查抽取条目':counts.approved?'待合成问答':counts.rejected?'抽取条目已剔除':'制备进行中';
    rows.push(trailStage('问答生成与质检',state,'active',extraction.title,trailButton('pipeline','查看制备任务',manager),'数据管理员'));
  }else{
    rows.push(trailStage('问答生成与质检',approved?'待制备':'待核准',approved?'active':'',
      approved?'输入已锁定为所选训练原文版本':'原文核准后可开始制备',approved&&manager?trailButton('prepare','从此版本开始制备',true):'','数据管理员'));
  }
  const writable=workCan('operator','lead','admin','annotator');
  if(annotation){
    const reviewing=annotation.status==='submitted' && workCan('expert','lead','admin') && annotation.author!==window.workspaceUser.username;
    const editing=['draft','returned'].includes(annotation.status)&&annotation.author===window.workspaceUser.username;
    const state={approved:'复核通过',submitted:'待专家复核',draft:'草稿',returned:'已退回'}[annotation.status]||annotation.status;
    rows.push(trailStage('CoT 标注与专家复核',state,annotation.status==='approved'?'complete':'active',
      sample.question,trailButton('annotation',reviewing?'办理专家复核':editing?'继续标注':'查看标注工单',reviewing||editing),annotation.status==='submitted'?'评审专家':'标注人 · '+reviewOwner(annotation.author)));
  }else{
    const passed=sample?.status==='passed';
    rows.push(trailStage('CoT 标注与专家复核',passed?'待标注':sample?.status==='rejected'?'当前问答已剔除':'待质检通过',passed?'active':'',
      sample?sample.question:'使用通过质检的问答建立标注工单',passed&&writable?trailButton('sample','标注当前问答',true):sample?trailButton('inspect','查看问答'):'','语料标注员'));
  }
  if(benchmark){
    const h=benchmark.handoff;
    const held=data.resources.find(r=>r.id===h.holdoutResourceId);
    const heldVersion=held?.versions?.find(v=>v.id===h.holdoutVersionId);
    const bound=heldVersion ? ' · 独立留出原文 '+heldVersion.filename+' v'+heldVersion.number : '';
    const state=benchmark.status==='published'?'已冻结发布':workStatuses[benchmark.status]?.[0]||benchmark.status;
    const [action,owner,canAct]=trailBenchmarkTask(benchmark);
    rows.push(trailStage('独立留出评测',state,benchmark.status==='published'?'complete':'active',
      benchmark.title+bound,trailButton('benchmark',action,canAct),owner));
  }else{
    const ready=annotation?.status==='approved';
    const next=ready?'由数据管理员或评测负责人选择独立留出题，核对证据及评分标准':'标注复核通过后，使用另一份留出原文出题';
    rows.push(trailStage('独立留出评测',ready?'待关联留出题':'待标注通过',ready?'active':'',next,
      ready&&!workCan('annotator')?trailButton('handoff',manager?'制备关联评测':'查看评测交接',manager):'','数据管理员或评测负责人'));
  }
  return trailProgress(rows);
}

async function renderCaseTrail() {
  const key=window.workspaceUser.username;
  const wanted=caseChoice;
  const [resources,extractions,batches,samples,annotations,benchmarks]=await Promise.all(
    ['resources','luoshu/extractions','batches','samples','annotations','benchmarks'].map(k=>api('/api/'+k)));
  if(window.workspacePage!=='workflow'||key!==window.workspaceUser.username||wanted!==caseChoice) return '';
  const data={resources,extractions,batches,samples,annotations,benchmarks};
  const r=trailChoose(data);
  caseScreen=r;
  const actions=workCan('operator','lead','admin')?workBtn('登记训练文件','resource-create','','primary','plus'):'';
  const dossier=r.resource?.researchCase;
  const routes={'sic-solvent-growth-v1':['crystal','碳化硅科研案例'],'dual-phase-annealing-v1':['research','双相钢科研案例']};
  const guide=routes[dossier] ? workBtn(routes[dossier][1],'nav',routes[dossier][0]) : '';
  const heading=sectionHead('','全流程办理','',guide+actions);
  if(!r.resource) return heading+workEmpty('暂无训练资料','登记训练文件后可查看各环节的办理进度。');
  rememberCaseTrail(r.resource.id,r.version.id,r.sample?.id,r.batch?.id,r.extraction?.id);
  const savedChoice=r.resource.id===wanted.resourceId&&wanted.versionId&&wanted.versionId!==r.version.id || wanted.resourceId&&r.resource.id!==wanted.resourceId;
  const casePicker=trailSelect('训练资料','resource',r.resources.map(o=>[o.id,o.title]),r.resource.id)
    +trailSelect('原文版本','version',r.versions.map(o=>[o.id,'v'+o.number+' · '+o.filename]),r.version.id);
  const batchPicker=r.branches.length>1 ? trailSelect('制备记录','branch',r.branches.map(o=>[o.id,o.title+' · '+(o.kind==='batch'?'语料批次':'抽取任务')]),r.branch.id) : '';
  const samplePicker=r.samples.length>1 ? trailSelect('当前问答','sample',r.samples.map(o=>[o.id,o.question]),r.sample.id) : '';
  return heading+`<section class="ct-work"><header class="ct-heading"><h2>办理进度</h2><button class="btn small" type="button" data-action="refresh">刷新进度</button></header>
    ${savedChoice?'<p class="ct-note">此前选中的资料或版本已无法访问，请核对当前选择。</p>':''}
    <div class="ct-pickers">${casePicker}</div>
    ${batchPicker||samplePicker?'<details class="ct-branches"><summary>切换制备记录或问答</summary><div class="ct-pickers">'+batchPicker+samplePicker+'</div></details>':''}
    ${trailRows(r,data)}</section>`;
}
document.addEventListener('change',async event=>{
  const select=event.target.closest('select[data-trail-select]');
  if(!select || !caseScreen?.resource) return;
  const r=caseScreen;
  let resource=r.resource.id,version=r.version.id,sample='',batch='',extraction='';
  if(select.dataset.trailSelect==='resource') {
    const chosen=r.resources.find(x=>x.id===select.value);if(!chosen)return;
    resource=chosen.id;version=chosen.activeVersion||chosen.versions[0].id;
  }else if(select.dataset.trailSelect==='version'){version=select.value;}
  else if(select.dataset.trailSelect==='branch'){
    const branch=r.branches.find(b=>b.id===select.value);
    if(!branch)return;
    if(branch.kind==='batch')batch=branch.id;else extraction=branch.id;
  }
  else{sample=select.value;batch=r.batch?.id;}
  rememberCaseTrail(resource,version,sample,batch,extraction);
  await refresh();
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-trail-action]');
  if(!button || !caseScreen?.resource || window.workspacePage!=='workflow')return;
  const r=caseScreen; button.disabled=true;
  try{
    switch(button.dataset.trailAction){
      case 'source': return await resourceOpen(r.resource.id,r.version.id);
      case 'prepare': return await openPipelineFromResource(r.resource.id,r.version.id);
      case 'pipeline': return await productionCommand('pipe',r.extraction.id);
      case 'batch': return await openProductionBatch(r.batch.id);
      case 'annotation': return await openAnnotationRecord(r.annotation.id);
      case 'sample': return await openNewSampleAnnotation(r.sample.id);
      case 'inspect': return await sampleOpen(r.sample.id);
      case 'handoff': return await openAnnotationBenchmarkHandoff(r.annotation.id);
      case 'benchmark':
        if(r.benchmark.handoff.itemId)exItemViews.set(r.benchmark.id,r.benchmark.handoff.itemId);
        return await openBenchmarkRecord(r.benchmark.id);
    }
  }catch(error){notify(error.message,'error');}finally{button.disabled=false;}
});
