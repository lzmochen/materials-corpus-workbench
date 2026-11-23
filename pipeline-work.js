'use strict';

const pipeBase='/api/pipeline-work';
const pipeRecipes={extract:'知识抽取与问答合成',facts:'原文事实合成',compare:'定量比较合成'};
const pipeStates={review:'待人工核查',generation:'可合成',excluded:'知识全部剔除',queued:'等待合成',quality:'待质检',failed:'合成失败',finished:'质检完成'};
const pipeRecordStates={pending:'待核查',approved:'已通过',rejected:'已剔除'};
const pipeUi={selected:'',state:'',tab:'',sources:[],run:null,timer:null};
function pipeButton(action,label,id='',primary=false){
  return '<button type="button" class="btn '+(primary?'primary':'small')+'" data-pipe="'+action+'" data-id="'+escapeHtml(id)+'">'+escapeHtml(label)+'</button>';
}
function pipeWriter(){return workCan('operator','lead','admin');}
function pipeBadge(key){
  const tone={review:'amber',quality:'amber',failed:'red',excluded:'red',generation:'blue',queued:'neutral',finished:'green'}[key]||'neutral';
  return '<span class="badge '+tone+'">'+escapeHtml(pipeStates[key]||key)+'</span>';
}
function pipeSteps(r){
  const b=r.batch,t=r.extraction;
  const count=b?.sampleIds.length||0;
  const stats=b?.counts||{};
  const steps=[['锁定源版本','V'+r.source.number+' · '+r.source.blockCount+' 个证据块','done']];
  if(t){
    steps.push(['结构化抽取',t.counts.total+' 条属性 · '+t.templateName,'done'],
      ['人工核查',t.counts.approved+' 通过 / '+t.counts.rejected+' 剔除 / '+t.counts.pending+' 待办',t.counts.pending?'current':t.counts.approved?'done':'blocked']);
  }
  steps.push([t?'知识问答合成':pipeRecipes[r.recipe],b?.status==='failed'?'任务失败':b?.status==='queued'?'已进入加工队列':b?count+' 条候选':'待核查完成',b?.status==='failed'?'blocked':b?.status==='queued'?'current':b?'done':'later']);
  steps.push(['规则质检',b?.status==='reviewed'?stats.passed+' 通过 / '+stats.rejected+' 剔除':b?.status==='generated'?'待执行规则质检':'待候选就绪',b?.status==='reviewed'?'done':b?.status==='generated'?'current':'later']);
  return '<ol class="pw-steps">'+steps.map(([name,value,state])=>'<li class="pw-step '+state+'"><strong>'+escapeHtml(name)+'</strong><span>'+escapeHtml(value)+'</span></li>').join('')+'</ol>';
}
function pipeKnowledge(r){
  const t=r.extraction;
  return workTable(['对象','属性','取值','证据位置','核查状态','操作'],t.records.map(k=>[
    escapeHtml(k.subject),escapeHtml(k.field),'<strong>'+escapeHtml(k.value)+'</strong>',escapeHtml(k.location),
    escapeHtml(pipeRecordStates[k.status]),pipeButton('record',k.status==='pending'&&workCan('operator','expert','lead','admin')?'对照核查':'查看记录',k.id)
  ]));
}
function pipeSamples(r,bySample){
  return r.samples.length?workTable(['候选问答','证据位置','规则评分','处置','操作'],r.samples.map(s=>[
    '<strong>'+escapeHtml(s.question)+'</strong><div class="pw-answer">'+escapeHtml(s.answer)+'</div>',
    escapeHtml(s.evidence.map(x=>x.location).join('、')),s.quality?escapeHtml(String(s.quality.score))+' / 100':'待计算',
    statusBadge(s.status),workBtn('核对样本','sample-open',s.id,'small')+(s.status==='passed'?productionAnnotationAction(s,bySample.get(s.id)):'')
  ])):workEmpty(r.state==='queued'?'正在等待合成任务':'暂无候选问答');
}
function pipeSource(r){
  const s=r.source;
  return '<dl class="pw-source"><dt>文件名</dt><dd>'+escapeHtml(s.filename)+'</dd><dt>源版本</dt><dd>V'+escapeHtml(s.number)+' · '+escapeHtml(s.versionId)+'</dd><dt>原件摘要 SHA-256</dt><dd class="mono">'+escapeHtml(s.sha256)+'</dd><dt>证据块</dt><dd>'+s.blockCount+'</dd></dl>'+workBtn('打开原文与证据','resource-open',s.id+'|'+s.versionId,'small');
}
function pipeContent(r,bySample){
  const t=r.extraction,b=r.batch;
  const tabs=[...(t?[['knowledge','核查条目 · '+t.counts.total]]:[]),['samples','产出样本 · '+r.samples.length],['source','输入版本']];
  if(!tabs.some(([id])=>id===pipeUi.tab))pipeUi.tab=t&&!b?'knowledge':'samples';
  const actions=[];
  if(t&&!b&&['review','excluded'].includes(r.state)&&workCan('operator','expert','lead','admin')){
    const next=t.records.find(x=>x.status==='pending')||t.records[0];
    actions.push(pipeButton('record',r.state==='excluded'?'重新核查条目':'核查下一条',next.id,true));
  }
  if(r.state==='generation'&&pipeWriter()) actions.push(pipeButton('generate','合成问答并质检','',true));
  if(r.state==='quality'&&pipeWriter()) actions.push(pipeButton('quality','执行规则质检','',true));
  if(r.state==='failed'&&pipeWriter()) actions.push(pipeButton('retry','重试合成任务','',true));
  if(b?.status==='reviewed')actions.push(workBtn('查看质量评价','batch-quality-details',b.id,'small'));
  if(b) actions.push(workBtn('打开语料批次','home-batch',b.id,'small'));
  if(t)actions.push(workBtn('打开完整核查记录','home-extraction',t.id,'small'));
  const controls=tabs.map(([key,label])=>'<button type="button" data-pipe="tab" data-id="'+key+'" aria-pressed="'+(pipeUi.tab===key)+'">'+escapeHtml(label)+'</button>').join('');
  return '<article class="pw-sheet"><header class="pw-sheet-head"><div><div class="pw-run-mode">'+escapeHtml(pipeRecipes[r.recipe])+'</div><h2>'+escapeHtml(r.title)+'</h2></div>'+pipeBadge(r.state)+'</header>'
    +'<div class="pw-context">'+(r.workflow?'<span>加工方案 '+escapeHtml(r.workflow.title)+' · V'+Number(r.workflow.revision)+'</span>':'')+'<span>'+escapeHtml(r.source.filename)+' · V'+escapeHtml(r.source.number)+'</span><span>经办人 '+escapeHtml(r.createdBy)+'</span><span>更新于 '+workTime(r.updatedAt)+'</span></div>'
    +pipeSteps(r)+(r.state==='failed'?'<p class="form-error">'+escapeHtml(b.error||r.job?.error||'合成任务执行失败')+'</p>':'')
    +'<div class="pw-actions">'+actions.join('')+'</div><div class="pw-tabs" aria-label="运行明细">'+controls+'</div><div class="pw-detail">'+(pipeUi.tab==='knowledge'?pipeKnowledge(r):pipeUi.tab==='samples'?pipeSamples(r,bySample):pipeSource(r))+'</div></article>';
}
async function renderPipelineWork(){
  clearTimeout(pipeUi.timer);
  if (pipeUi.openTarget!==undefined) {
    history.replaceState({...history.state,pipeRunId:pipeUi.openTarget},'',location.href);
    delete pipeUi.openTarget;
  }
  pipeUi.selected=history.state?.pipeRunId || '';
  const desk=await api(pipeBase);
  pipeUi.sources=desk.sources;
  const visible=workScopeRows(desk.runs,'production').filter(r=>!pipeUi.state||r.state===pipeUi.state);
  const active=desk.runs.find(r=>r.id===pipeUi.selected);
  if(!active){
    pipeUi.run=null;
    const states='<label class="pd-inline-filter">运行状态<select data-pipe-filter="state">'+workSelect([['','全部状态'],...Object.entries(pipeStates)],pipeUi.state)+'</select></label>';
    return sectionHead('','语料制备管线','',pipeWriter()?pipeButton('create','新建制备任务','',true):'')
      +'<div class="pd-desk">'+productionPanel('制备任务',workScopeMenu('production')+states,productionList(['任务名称','制备方式','当前状态','更新时间'],visible.map(productionPipeRow),'当前范围没有制备任务'))+'</div>';
  }
  const run=await api(pipeBase+'/'+encodeURIComponent(active.id));
  pipeUi.run=run;
  const annotations=run.samples.some(s=>s.status==='passed') ? await api('/api/annotations') : [];
  const body=pipeContent(run,new Map(annotations.map(a=>[a.sampleId,a])));
  if(run.state==='queued')pipeUi.timer=setTimeout(()=>{if(window.workspacePage==='pipeline-work'&&!wb('#workspace-dialog').open)refresh();},1800);
  return sectionHead('','语料制备管线','',productionControl(productionAction('pipes'),'返回制备任务'))
    +'<div class="pw-desk">'+body+'</div>';
}
async function openPipelineFromResource(resourceId,versionId){
  if(!pipeWriter())throw new Error('当前岗位没有制备语料的权限。');
  pipeUi.openTarget='';pipeUi.state='';pipeUi.tab='';
  await navigate('pipeline-work');
  if(window.workspacePage!=='pipeline-work')return;
  const source=pipeUi.sources.find(s=>s.resourceId===resourceId && s.versionId===versionId);
  if(!source)throw new Error('所选版本须为已核准、带有原文证据的训练资料。');
  rememberCaseTrail(resourceId,versionId);
  return pipePreviewForm(source);
}
function pipePreviewForm(lockedSource){
  const choices=lockedSource?[lockedSource]:workSourceChoices(pipeUi.sources,'production');
  const options=choices.map(s=>[s.versionId,s.title+' · V'+s.number]);
  if(!options.length)return openModal('新建制备任务',workEmpty('暂无可用的核准训练版本')+workBtn('打开训练资源目录','nav','resources'));
  const initial=choices[0];
  openModal('新建制备任务','<form class="stack pw-form" data-pipe-form="create"><label class="field">输入版本<select name="versionId">'+workSelect(options,initial.versionId)+'</select></label>'
    +'<label class="field">制备方式<select name="recipe">'+workSelect(Object.entries(pipeRecipes),'extract')+'</select></label>'
    +'<label class="field" data-pipe-field="template">抽取模板<select name="template">'+workSelect([['source','按原文字段抽取'],['properties','材料性能与测试'],['materials','材料综合属性'],['process','材料制备与热处理工艺']])+'</select></label>'
    +'<label class="field" data-pipe-field="limit" hidden>候选数上限<input name="maxCandidates" type="number" min="1" max="200" step="1" value="40" disabled required></label>'
    +workField('任务名称','title',{max:150,value:initial.title+' · '+pipeRecipes.extract})
    +'<div data-pipe-preview aria-live="polite">先预览匹配到的原文证据，再开始制备。</div><div class="actions">'+workBtn('取消','dialog-close')+pipeButton('preview','预览匹配结果')+'<button type="submit" class="btn primary" disabled>开始制备</button></div></form>');
}
function resetPipePreview(form) {
  form.querySelector('[data-pipe-preview]').textContent='参数已更新，请重新预览匹配结果。';
  form.querySelector('[type="submit"]').disabled=true;
}
function pipeConfig(form){
  const v=Object.fromEntries(new FormData(form));
  v.resourceId=pipeUi.sources.find(s=>s.versionId===v.versionId)?.resourceId;
  if(v.recipe==='extract')delete v.maxCandidates;
  else{delete v.template;v.maxCandidates=Number(v.maxCandidates);}
  return v;
}
function pipeRecord(id){
  const r=pipeUi.run,t=r?.extraction,k=t?.records.find(x=>x.id===id);
  if(!k)return;
  const can=workCan('operator','expert','lead','admin')&&!t.batchId;
  const points=Array.from(k.evidence);
  const text=points.slice(k.start,k.end).join('')===k.value
    ? escapeHtml(points.slice(0,k.start).join(''))+'<mark>'+escapeHtml(k.value)+'</mark>'+escapeHtml(points.slice(k.end).join('')):escapeHtml(k.evidence);
  const prior=k.reviewer?'<p class="pw-last-review">'+escapeHtml(pipeRecordStates[k.status])+' · '+escapeHtml(k.reviewer)+' · '+workTime(k.reviewedAt)+(k.note?' · '+escapeHtml(k.note):'')+'</p>':'';
  const controls=can?'<form class="stack" data-pipe-form="review" data-id="'+escapeHtml(id)+'" data-revision="'+t.revision+'"><label class="field">核查意见<textarea rows="2" name="note" maxlength="1200"></textarea></label><div class="actions"><button class="btn" type="submit" value="reject">剔除并记录原因</button><button class="btn primary" type="submit" value="approve">通过核查</button></div></form>':'';
  openModal('知识条目核查','<div class="stack"><div class="pw-review-head"><h3>'+escapeHtml(k.subject)+' · '+escapeHtml(k.field)+'</h3><strong>'+escapeHtml(k.value)+'</strong></div><div><b>'+escapeHtml(k.location)+'</b><blockquote class="pw-quote">'+text+'</blockquote></div>'+prior+controls+'<div>'+workBtn('查看源版本','resource-open',r.source.id+'|'+r.source.versionId,'small')+'</div></div>');
}
document.addEventListener('change',async event=>{
  const el=event.target;
  if(el.dataset.pipeFilter){
    if(el.dataset.pipeFilter==='state')pipeUi.state=el.value;
    else pipeUi.selected=el.value;
    pipeUi.tab='';
    await refresh();return;
  }
  const form=el.closest('form[data-pipe-form="create"]');
  if(!form||el.name==='title')return;
  const isExtract=form.elements.recipe.value==='extract';
  form.querySelector('[data-pipe-field="template"]').hidden=!isExtract;
  form.elements.template.disabled=!isExtract;
  form.querySelector('[data-pipe-field="limit"]').hidden=isExtract;
  form.elements.maxCandidates.disabled=isExtract;
  if(['versionId','recipe'].includes(el.name)&&!form.dataset.customTitle){
    const src=pipeUi.sources.find(s=>s.versionId===form.elements.versionId.value);
    form.elements.title.value=src.title+' · '+pipeRecipes[form.elements.recipe.value];
  }
  resetPipePreview(form);
});
document.addEventListener('input',event=>{
  const el=event.target;
  const form=el.closest('form[data-pipe-form="create"]');
  if(!form)return;
  if(el.name==='title'){form.dataset.customTitle='true';return;}
  resetPipePreview(form);
});
document.addEventListener('click',async event=>{
  const btn=event.target.closest('button[data-pipe]');
  if(!btn||btn.disabled)return;
  const action=btn.dataset.pipe;btn.disabled=true;
  try{
    if(action==='create')return pipePreviewForm();
    if(action==='tab'){pipeUi.tab=btn.dataset.id;await refresh();return;}
    if(action==='record')return pipeRecord(btn.dataset.id);
    if(action==='use-source'){
      const form=btn.form;
      form.elements.template.value='source';
      form.elements.template.dispatchEvent(new Event('change',{bubbles:true}));
      form.querySelector('[data-pipe="preview"]').click();
      return;
    }
    if(action==='preview'){
      const form=btn.form;
      if(!form.reportValidity())return;
      const cfg=pipeConfig(form);
      form.querySelector('[data-pipe-preview]').textContent='正在核对原文证据…';
      const result=await api(pipeBase+'/preview','POST',cfg);
      if(!form.isConnected||JSON.stringify({...cfg,title:''})!==JSON.stringify({...pipeConfig(form),title:''}))return;
      const region=form.querySelector('[data-pipe-preview]');
      if(cfg.recipe==='extract'){
        region.innerHTML=lsMatchPreview(result,'data-pipe="use-source"');
        if(!result.count&&!result.alternatives?.length)region.insertAdjacentHTML('beforeend',workBtn('对照原文配置字段','work-extraction-create',cfg.resourceId+'|'+cfg.versionId,'small'));
      }else region.innerHTML='<section class="pw-preview"><h3>'+result.sourceBlocks+' 个源证据块 · '+result.count+' 条候选问答</h3>'
        +(result.count?workTable(['匹配内容','取值／答案','原文位置'],result.examples.map(row=>[escapeHtml(row.label),escapeHtml(row.answer),escapeHtml(row.location)])):'<p>当前源版本没有匹配内容，请更换模板或制备方式。</p>')+'</section>';
      form.querySelector('[type="submit"]').disabled=!result.count;
      return;
    }
    const r=pipeUi.run;
    if(!r)return;
    await api(pipeBase+'/'+encodeURIComponent(r.id)+'/'+action,'POST',{revision:r.extraction?.revision});
    pipeUi.state='';pipeUi.tab=action==='generate'||action==='quality'?'samples':'';
    await refresh();
    notify(action==='retry'?'已重新提交同一批次。':action==='quality'?'批次质检已完成。':'问答批次已生成并完成质检。');
  }catch(err){
    if(action==='preview' && btn.form?.isConnected) {
      btn.form.querySelector('[data-pipe-preview]').textContent='预览失败，可核对参数后重新预览。';
      btn.form.querySelector('[type="submit"]').disabled=true;
    }
    notify(err.message,'error');
  }finally{btn.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-pipe-form]');
  if(!form)return;
  event.preventDefault();
  const btn=event.submitter;
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  try{
    if(form.dataset.pipeForm==='create'){
      const config=pipeConfig(form);
      const result=await api(pipeBase,'POST',config);
      rememberCaseTrail(config.resourceId,config.versionId,'',config.recipe==='extract'?'':result.id,config.recipe==='extract'?result.id:'');
      pipeUi.openTarget=result.id;pipeUi.state='';pipeUi.tab='';
      closeModal();await refresh();notify('已打开制备任务。');return;
    }
    const note=form.elements.note.value.trim();
    if(btn.value==='reject'&&!note)throw new Error('请填写剔除原因。');
    await api(pipeBase+'/'+encodeURIComponent(pipeUi.run.id)+'/review','POST',{recordId:form.dataset.id,
      revision:Number(form.dataset.revision),decision:btn.value,note});
    closeModal();pipeUi.state='';await refresh();notify('知识核查决定已保存。');
  }catch(err){
    if(err.status===409&&form.dataset.pipeForm==='review'){
      closeModal();await refresh();
    }
    notify(err.message,'error');
  }
  finally{btn.disabled=false;}
});
