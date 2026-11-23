'use strict';

function distillButton(label, action, id='', primary=false) {
  return `<button class="btn${primary?' primary':''}" type="button" data-distill="${action}" data-id="${escapeHtml(id)}">${label}</button>`;
}
function distillSummary(result) {
  return `<div class="dst-summary"><span>来源版本 <b>${result.sourceCount}</b></span><span>候选 <b>${result.total}</b></span><span>纳入 <b>${result.count}</b></span><span>剔除 <b>${result.total-result.count}</b></span></div>`;
}
function distillCoverage(result) {
  const coverage = result.coverage;
  if (!coverage) return '<p class="cell-note">这份早期选集未保存门类统计。</p>';
  const table = workTable(['材料门类','候选','通过门槛','实际入选'], coverage.families.map(group => [
    escapeHtml(group.family), group.candidates, group.eligible, group.selected
  ]));
  const summary = '材料门类覆盖　' + coverage.covered + ' / 4 类 · 入选原文 ' + coverage.sourceVersions + ' 个版本';
  return `<details class="dst-evidence"><summary>${summary}</summary>${table}<small>门类取自资源目录。通过门槛的样本还要按去重设置和数量上限筛选。</small></details>`;
}
function distillRows(result) {
  return workTable(['问答样本','规则分','筛选结论'], result.rows.map(row=>[
    `<strong>${escapeHtml(row.question)}</strong><small class="cell-note mono muted">${escapeHtml(row.batchId)} · ${escapeHtml(row.sampleId)}</small>`,
    row.score??'—',`<span class="badge ${row.included?'green':'neutral'}">${row.included?'纳入':'剔除'}</span><small class="cell-note">${escapeHtml(row.reason)}</small>`
  ]));
}
async function distillLibrary() {
  const list=await api('/api/distillations');
  const rows=list.map(r=>[escapeHtml(r.title),r.count,r.sourceCount,workTime(r.createdAt),distillButton('打开','open',r.id)]);
  const create=workCan(...workflowWriters)?distillButton('新建选集','create','',true):'';
  openModal('蒸馏选集',`<div class="stack"><div class="split"><h3>已保存选集 · ${list.length}</h3>${create}</div>${rows.length?workTable(['名称','样本','源版本','保存时间','操作'],rows):workEmpty('暂无已保存选集')}</div>`);
}
async function distillCreate() {
  const batches=workSourceChoices(await api('/api/batches'),'production',workGenerationBatch);
  const checks=batches.map(b=>`<label><input type="checkbox" name="batch" value="${escapeHtml(b.id)}"${b.id===workGenerationBatch?' checked':''}><span>${escapeHtml(b.title)}<small>${escapeHtml(b.id)} · 通过 ${b.counts?.passed||0} 条</small></span></label>`).join('');
  openModal('新建蒸馏选集',`<form class="stack" id="dst-form"><label class="field">选集名称<input name="title" required maxlength="120"></label><fieldset class="dst-batches"><legend>来源批次</legend>${checks||'没有可用批次'}</fieldset><div class="dst-config"><label class="field">最低规则分<input name="minScore" type="number" min="0" max="100" value="80" required></label><label class="field">数量上限<input name="limit" type="number" min="1" max="10000" value="100" required></label></div><label class="dst-check"><input type="checkbox" name="deduplicate" checked>按规范化问题与答案去重</label><label class="field">取样顺序<select name="selectionOrder"><option value="batch">按批次依次取样</option><option value="family">各材料门类轮流取样</option></select><small>轮流取样按金属、无机非金属、高分子、复合材料、待归类的顺序，每轮每类取一条，直至达到上限。</small></label><div class="actions">${distillButton('返回选集','library')}${distillButton('预览筛选结果','preview','',true)}</div><div class="stack" id="dst-result" aria-live="polite"></div></form>`);
  const form=wb('#dst-form');
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('input',()=>{delete form.dataset.token;form.dataset.revision=String(Number(form.dataset.revision||0)+1);form.querySelector('#dst-result').replaceChildren();});
}
function distillConfig(form) {
  const fields=new FormData(form);
  return {batchIds:fields.getAll('batch'),minScore:Number(fields.get('minScore')),limit:Number(fields.get('limit')),deduplicate:fields.has('deduplicate'),selectionOrder:fields.get('selectionOrder')};
}
async function distillAction(action,id,el) {
  if(action==='library') return distillLibrary();
  if(action==='annotation') {
    const sample = await api('/api/samples/'+encodeURIComponent(id));
    if(sample.status!=='passed') throw new Error('该样本当前未通过质检，请先在来源批次核对。');
    return openNewSampleAnnotation(id);
  }
  if(action==='create') return distillCreate();
  if(action==='export') {
    const file=await api('/api/distillations/'+id+'/export');
    return workDownload(file.filename,new Blob([file.content],{type:'application/x-ndjson;charset=utf-8'}));
  }
  if(action==='open') {
    const record=await api('/api/distillations/'+id);
    return openModal(record.title,`<div class="stack"><div class="split"><span class="mono muted">${escapeHtml(record.id)}</span>${workCan('operator','annotator')?distillButton('导出 JSONL','export',id,true):''}</div>${distillSummary(record)}<p class="muted">最低规则分 ${record.config.minScore} · 数量上限 ${record.config.limit} · ${record.config.deduplicate?'已启用去重':'未启用去重'} · ${record.config.selectionOrder==='family'?'各材料门类轮流取样':'按批次依次取样'}</p>${distillCoverage(record)}${distillRows(record)}<h3>入选问答与原文</h3>${record.items.map(s=>`<details class="dst-evidence"><summary>${escapeHtml(s.question)}</summary><p>${escapeHtml(s.answer)}</p><small>${escapeHtml(s.resourceId)} · ${escapeHtml(s.versionId)}</small>${s.evidence.map(e=>`<blockquote><small>${escapeHtml(e.location)} · ${escapeHtml(e.blockId)}</small><p>${escapeHtml(e.text)}</p></blockquote>`).join('')}${distillButton('查看该样本的标注','annotation',s.id)}</details>`).join('')}${distillButton('返回选集','library')}</div>`);
  }
  const form=el.closest('#dst-form');
  if(!form||!form.reportValidity()) return;
  const cfg=distillConfig(form);
  if(!cfg.batchIds.length) throw new Error('请选择至少一个批次');
  if(action==='preview') {
    const revision=form.dataset.revision;
    const result=await api('/api/distillations/preview','POST',cfg);
    if(!form.isConnected||revision!==form.dataset.revision) return;
    form.dataset.token=result.previewHash;
    form.querySelector('#dst-result').innerHTML=distillSummary(result)+distillCoverage(result)+distillRows(result)+(result.count?distillButton('确认保存选集','save','',true):workEmpty('没有符合条件的样本'));
  }
  if(action==='save'&&form.dataset.token) {
    const saved=await api('/api/distillations','POST',{...cfg,title:form.elements.title.value,previewHash:form.dataset.token});
    return distillAction('open',saved.id);
  }
}
document.addEventListener('click',async event=>{
  const el=event.target.closest('button[data-distill]');
  if(!el||el.disabled) return;
  el.disabled=true;
  try {await distillAction(el.dataset.distill,el.dataset.id,el);}
  catch(error){notify(error.message,'error');}
  finally{el.disabled=false;}
});
