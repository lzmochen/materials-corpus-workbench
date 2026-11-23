'use strict';

const lsState = {
  tab:'tasks', taskId:'', recordId:'', recordStatus:'', taskQuery:'', knowledgeQuery:'',
  knowledgeField:'', knowledgePage:0, tasks:[], detail:null, knowledge:[], templates:[]
};
let lsRenderRevision=0;
const lsTabs = [['tasks','抽取任务'],['review','原文核查'],['knowledge','知识库'],['delivery','知识转语料']];
const lsStatuses = {pending:['待核查','amber'],reviewed:['已核查','green'],generated:['已生成语料','blue'],approved:['已通过','green'],rejected:['已剔除','red']};
const lsApi = '/api/luoshu';
const lsBase = id => lsApi+'/extractions/'+encodeURIComponent(id);
const lsWrite = () => workCan('operator','lead','admin');
const lsReview = () => workCan('operator','expert','lead','admin');
const lsEsc = value => escapeHtml(value ?? '');

function lsBadge(status) {
  const [label,tone] = lsStatuses[status] || [status || '—','neutral'];
  return `<span class="badge ${tone}">${lsEsc(label)}</span>`;
}
function lsButton(label,action,id='',tone='') {
  return workBtn(label,'ls-'+action,id,tone);
}
function lsEmpty(label) {
  return `<div class="ls-empty">${lsEsc(label)}</div>`;
}
function lsPanel(title,body,actions='') {
  return `<section class="panel"><div class="panel-head"><h2>${lsEsc(title)}</h2>${actions}</div>${body}</section>`;
}
function lsTable(headers,rows) {
  return `<div class="table-wrap ls-table"><table><thead><tr>${headers.map(h=>`<th scope="col">${lsEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function lsSubject(title,id) {
  return `<strong>${lsEsc(title)}</strong><small class="cell-note muted mono">${lsEsc(id)}</small>`;
}
function lsToolbar() {
  return `<nav class="ls-tabs" aria-label="知识抽取业务">${lsTabs.map(([id,label])=>`<button type="button" class="ls-tab${lsState.tab===id?' active':''}" data-action="ls-tab" data-id="${id}" aria-pressed="${lsState.tab===id}">${lsEsc(label)}</button>`).join('')}</nav>`;
}
function lsSearch(label,id,value) {
  return `<label class="inline-label">${lsEsc(label)}<input type="search" id="${id}" value="${lsEsc(value)}"></label>`;
}
function lsQueryMatch(values,query) {
  const text = query.trim().toLowerCase();
  return values.some(value => String(value ?? '').toLowerCase().includes(text));
}
function lsTaskRows() {
  const tasks = lsState.tasks.filter(task => lsQueryMatch([task.id,task.title,task.resourceId,task.filename,task.templateName],lsState.taskQuery));
  if (!tasks.length) return lsEmpty(lsState.taskQuery ? '无匹配任务' : '暂无抽取任务');
  return lsTable(['抽取任务','来源文件','模板','核查进度','状态','操作'],tasks.map(task=>{
    const count=task.counts || {};
    return [lsSubject(task.title,task.id),lsSubject(task.filename || task.resourceId,task.versionId),lsEsc(task.templateName),`${(count.approved||0)+(count.rejected||0)} / ${count.total||0}`,lsBadge(task.status),lsButton('查看记录','open',task.id,'link small')];
  }));
}
function lsTaskPanel() {
  const find=lsSearch('检索任务','ls-task-query',lsState.taskQuery);
  return lsPanel('抽取任务',`<div id="ls-task-rows">${lsTaskRows()}</div>`,find);
}
function lsTaskPicker() {
  return `<label class="inline-label">抽取任务<select id="ls-task-picker">${workSelect(lsState.tasks.map(task=>[task.id,`${task.title} · ${task.id}`]),lsState.taskId)}</select></label>`;
}
function lsContext(task) {
  const counts=task.counts;
  return `<div class="ls-context"><div><div class="ls-toolbar"><h2>${lsEsc(task.title)}</h2>${lsBadge(task.status)}</div>
    <div class="ls-meta"><span class="mono">${lsEsc(task.id)}</span><span>${lsEsc(task.templateName)}</span><span>${task.split==='holdout'?'评测留出':'训练资料'}</span><span>${lsEsc(task.filename || task.resourceId)}</span><span class="mono">${lsEsc(task.versionId)}</span></div></div>
    <div class="ls-counts"><span>待核查 <strong>${counts.pending}</strong></span><span>通过 <strong>${counts.approved}</strong></span><span>剔除 <strong>${counts.rejected}</strong></span></div></div>`;
}
function lsVisibleRecords(detail) {
  return detail.records.filter(record => !lsState.recordStatus || record.status===lsState.recordStatus);
}
function lsRecordForm(task,record) {
  const locked=Boolean(task.batchId) || task.status==='generated' || !lsReview();
  const disabled=locked?' readonly':'';
  const properties=[['subject','实体名称',record.subject,150],['field','属性',record.field,100]];
  return `<form class="stack ls-record" data-form="ls-review" data-task="${lsEsc(task.id)}" data-id="${lsEsc(record.id)}" data-revision="${lsEsc(task.revision)}">
    <div class="ls-toolbar"><h3>知识记录</h3>${lsBadge(record.status)}</div>
    <div class="ls-fields">${properties.map(([key,label,value,limit])=>`<label class="field">${label}<input required name="${key}" maxlength="${limit}" value="${lsEsc(value)}"${disabled}></label>`).join('')}
    <label class="field">属性值<textarea name="value" required maxlength="2000" rows="3"${disabled}>${lsEsc(record.value)}</textarea></label>
    <label class="field">核查意见<textarea name="note" maxlength="1200" rows="2"${disabled}>${lsEsc(record.note)}</textarea></label></div>
    ${record.reviewer?`<div class="ls-meta"><span>核查人 ${lsEsc(record.reviewer)}</span><span>${workTime(record.reviewedAt)}</span></div>`:''}
    ${locked?'':`<div class="ls-actions"><button type="submit" class="btn">${record.status==='pending'?'保存修改':'修改并转待核查'}</button>${lsButton('剔除记录','reject',record.id)}${lsButton('核查通过','approve',record.id,'primary')}</div>`}
  </form>`;
}
function lsRecordNavigator(visible, record) {
  const options = [['','全部记录'],['pending','待核查'],['approved','已通过'],['rejected','已剔除']];
  const pos=visible.indexOf(record);
  return `<div class="ls-toolbar ls-record-picker"><label class="inline-label">状态<select id="ls-record-status">${workSelect(options,lsState.recordStatus)}</select></label>
    ${record?`<label class="inline-label">记录<select id="ls-record-picker">${workSelect(visible.map((item,index)=>[item.id,`${index+1}. ${item.subject} · ${item.field}`]),record.id)}</select></label>
    <div class="ls-actions"><button type="button" class="btn small" data-action="ls-prev"${pos===0?' disabled':''}>上一条</button>
    <span class="mono">${pos+1} / ${visible.length}</span><button type="button" class="btn small" data-action="ls-next"${pos===visible.length-1?' disabled':''}>下一条</button></div>`:''}</div>`;
}
function lsAnnotatedEvidence(record) {
  const text = Array.from(record.evidence || '');
  const {start,end} = record;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start<0 || end<=start || end>text.length) return lsEsc(record.evidence);
  return lsEsc(text.slice(0,start).join(''))+'<mark>'+lsEsc(text.slice(start,end).join(''))+'</mark>'+lsEsc(text.slice(end).join(''));
}
function lsReviewBody(task) {
  const visible=lsVisibleRecords(task);
  const record=visible.find(item=>item.id===lsState.recordId) || visible[0];
  lsState.recordId=record?.id || '';
  const picker=lsRecordNavigator(visible,record);
  if (!record) return picker+lsEmpty('暂无匹配的知识记录');
  const original=`<article class="ls-source"><div class="ls-toolbar"><h3>原文证据</h3><span class="mono">${lsEsc(record.blockId)}</span></div>
    <div class="ls-meta"><strong>${lsEsc(task.filename)}</strong><span>${lsEsc(record.location)}</span></div>
    <blockquote>${lsAnnotatedEvidence(record)}</blockquote>
    ${record.sourceField?`<p class="ls-meta">原字段 · ${lsEsc(record.sourceField)}</p>`:''}
    <div class="ls-actions">${/\.(?:png|jpe?g|bmp|webp)$/i.test(task.filename) ? workBtn('定位图纸原文','drawing-preview',[task.resourceId,task.versionId,record.blockId].join('|'),'small') : ''}
    ${workBtn('查看源版本','resource-open',task.resourceId+'|'+task.versionId,'small')}</div></article>`;
  return picker+`<div class="ls-review-grid">${original}${lsRecordForm(task,record)}</div>`;
}
function lsKnowledgeFiltered() {
  return lsState.knowledge.filter(row=>(!lsState.knowledgeField || row.field===lsState.knowledgeField) &&
    lsQueryMatch([row.subject,row.field,row.value,row.extractionTitle,row.location,row.extractionId,row.resourceId,row.versionId,row.evidence],lsState.knowledgeQuery));
}
function lsKnowledgeRows() {
  const list=lsKnowledgeFiltered();
  const size=20;
  lsState.knowledgePage=Math.min(lsState.knowledgePage,Math.max(0,Math.ceil(list.length/size)-1));
  const page=lsState.knowledgePage;
  if (!list.length) return lsEmpty('暂无匹配的已核查记录');
  const rows=list.slice(page*size,(page+1)*size).map(row=>[
    lsEsc(row.subject),lsEsc(row.field),lsEsc(row.value),lsSubject(row.extractionTitle,row.extractionId),
    lsEsc(row.location || row.blockId),lsButton('核对来源','trace',row.extractionId+'|'+row.id,'link small')
  ]);
  const pages=`<div class="ls-toolbar ls-pagination"><span>共 ${list.length} 条</span>${list.length>size?`<button type="button" class="btn small" data-action="ls-knowledge-prev"${page===0?' disabled':''}>上一页</button><span>${page+1} / ${Math.ceil(list.length/size)}</span><button type="button" class="btn small" data-action="ls-knowledge-next"${(page+1)*size>=list.length?' disabled':''}>下一页</button>`:''}</div>`;
  return lsTable(['实体','属性','属性值','抽取任务','原文位置','操作'],rows)+pages;
}
function lsKnowledgePanel() {
  const fieldNames=[...new Set(lsState.knowledge.map(row=>row.field).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  if (!fieldNames.includes(lsState.knowledgeField)) lsState.knowledgeField='';
  const filters=`<div class="ls-toolbar">${lsSearch('检索知识','ls-knowledge-query',lsState.knowledgeQuery)}
    <label class="inline-label">属性<select id="ls-knowledge-field">${workSelect([['','全部属性'],...fieldNames.map(f=>[f,f])],lsState.knowledgeField)}</select></label></div>`;
  const actions=`<div class="ls-actions">${lsButton('导出 JSON','export','knowledge-json','small')}${lsButton('导出 CSV','export','knowledge-csv','small')}</div>`;
  return lsPanel('已核查知识',filters+`<div id="ls-knowledge-rows">${lsKnowledgeRows()}</div>`,actions);
}
function lsDelivery(task) {
  const train=task.split==='train';
  const canGenerate=lsWrite() && train && !task.batchId && task.counts.approved>0 && task.counts.pending===0;
  const action=task.batchId?workBtn('查看生成批次','home-batch',task.batchId,'primary'):canGenerate?lsButton('生成训练语料','generate',task.id,'primary'):'';
  const state=task.batchId?lsEsc(task.batchId):!train?'评测留出资源':task.counts.pending?`待核查 ${task.counts.pending} 条`:!task.counts.approved?'无通过记录':'待生成';
  return `<div class="ls-delivery">${lsPanel('抽取结果',`<div class="ls-toolbar"><span>记录总数 <strong>${task.counts.total}</strong></span><div class="ls-actions">${(task.counts.approved?lsButton('查看入库知识','task-knowledge',task.id):'')}${lsButton('下载 JSON','export','task-json')}${lsButton('下载 CSV','export','task-csv')}</div></div>`)}
    ${lsPanel('训练语料',`<div class="ls-toolbar"><span>已核查通过 <strong>${task.counts.approved}</strong> 条</span><span>${state}</span>${action}</div>`)}</div>`;
}
async function renderLuoshu() {
  const revision=++lsRenderRevision;
  const controls=`<div class="ls-actions">${workScopeMenu('production')}${lsWrite()?lsButton('模板管理','config')+lsButton('新建抽取任务','new','','primary'):''}</div>`;
  const header=sectionHead('','知识抽取与核查','',controls)+lsToolbar();
  if (lsState.tab==='knowledge') {
    const records=await api(lsApi+'/knowledge');
    if (revision!==lsRenderRevision) return '';
    lsState.knowledge=records;
    return header+lsKnowledgePanel();
  }
  const tasks=await api(lsApi+'/extractions');
  if (revision!==lsRenderRevision) return '';
  lsState.tasks=workScopeRows(tasks,'production');
  if (lsState.tab==='tasks') {lsState.detail=null;return header+lsTaskPanel();}
  const selected=tasks.find(task=>task.id===lsState.taskId) || lsState.tasks[0];
  if (!selected) {lsState.taskId='';lsState.detail=null;return header+lsEmpty('暂无抽取任务');}
  lsState.taskId=selected.id;
  const detail=await api(lsBase(selected.id));
  if (revision!==lsRenderRevision) return '';
  lsState.detail=detail;
  return header+`<div class="ls-layout">${lsTaskPicker()}${lsContext(detail)}${lsState.tab==='delivery'?lsDelivery(detail):`<section class="panel" id="ls-review-body">${lsReviewBody(detail)}</section>${lsDelivery(detail)}`}</div>`;
}
async function openLuoshuTask(id,recordId='') {
  lsState.taskId=id;
  lsState.recordId=recordId;
  lsState.recordStatus='';
  lsState.tab='review';
  await navigate('luoshu');
}
function lsSourceKind(resource,version) {
  const name=version.filename || '';
  if (/图纸|工程图|零件图|装配图|制图/.test([resource.category,resource.title,name].join(' ')) || /\.(?:png|jpe?g|tiff?|bmp|webp)$/i.test(name)) return 'drawing';
  if (/\.(?:tsv|csv|xlsx?|jsonl?)$/i.test(name)) return 'data';
  return 'document';
}
const lsSourceTypes = [['','全部类型'],['document','文献与报告'],['drawing','图纸与 OCR'],['data','结构化数据']];
function lsSourceOptions(kind,selected) {
  const sources=(lsState.sources || []).filter(item=>!kind || item.kind===kind);
  return workSelect([['','选择源版本'],...sources.map(item=>[item.id,item.label])],selected);
}
function lsTemplateFields(id) {
  const tpl=lsState.templates.find(item=>item.key===id);
  if (!tpl) return '';
  if (tpl.id==='source') return '';
  if (tpl.id==='custom' && !tpl.config) return '<label class="field">抽取字段（每行一项）<textarea name="fields" required rows="4"></textarea></label>';
  return `<div class="field">抽取字段<div class="ls-field-tags">${tpl.fields.map(field=>`<span>${lsEsc(field)}</span>`).join('')}</div></div>`;
}
function lsExtractionInput(form) {
  const [resourceId,versionId]=form.elements.source.value.split('|');
  const tpl=lsState.templates.find(t=>t.key===form.elements.template.value);
  if(!resourceId||!versionId||!tpl)return null;
  const input={resourceId,versionId,template:tpl.config?'custom':tpl.id};
  if(tpl.config){input.fields=tpl.fields;input.templateLabel=tpl.name;}
  else if(tpl.id==='custom')input.fields=form.elements.fields.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  return input;
}
function lsMatchPreview(result, sourceAction) {
  if(result.count){
    const rows=result.examples.map(row=>[lsEsc(row.label),lsEsc(row.answer),lsEsc(row.location)]);
    return '<section class="ls-match"><header><strong>可抽取 '+result.count+' 条记录</strong><span>'+result.sourceBlocks+' 个原文证据块</span></header>'+
      lsTable(['原文字段','取值摘录','证据位置'],rows)+'</section>';
  }
  const names=result.alternatives||[];
  const fields=result.fields||[];
  const source=result.sourceExcerpt;
  const reason=fields.length?'本版原文没有与「'+lsEsc(fields.slice(0,5).join('、'))+(fields.length>5?'等':'')+'」对应的明确取值。':'本版原文没有可识别的字段与取值。';
  const fix=names.length?'<p>可用原文字段：'+names.map(lsEsc).join('、')+'</p><button class="btn small" type="button" '+sourceAction+'>改用原文字段并预览</button>':'<p>请核对源文件版本，或在原文中确认属性名及取值后改用自定义字段。</p>';
  return '<section class="ls-match ls-match-empty"><strong>未找到可抽取的记录</strong><p>'+reason+'</p>'+fix+
    (source?.text?'<details><summary>查看原文片段 · '+lsEsc(source.location)+'</summary><blockquote>'+lsEsc(source.text)+'</blockquote></details>':'')+'</section>';
}
const lsPreviewTimers=new WeakMap();
function lsSchedulePreview(form,delay=0) {
  clearTimeout(lsPreviewTimers.get(form));
  const region=form.querySelector('[data-ls-preview]');
  const submit=form.querySelector('[type="submit"]');
  const request=Number(form.dataset.previewRequest||0)+1;
  form.dataset.previewRequest=String(request);
  delete form.dataset.previewInput;
  submit.disabled=true;
  const input=lsExtractionInput(form);
  if(!input||input.fields?.length===0){
    region.textContent=input?'输入需要抽取的字段后可预览。':'请选择已核准的原文版本。';
    return;
  }
  region.textContent='正在核对原文…';
  lsPreviewTimers.set(form,setTimeout(async()=>{
    if(!form.isConnected||Number(form.dataset.previewRequest)!==request)return;
    try{
      const result=await api(lsApi+'/extractions/preview','POST',input);
      if(!form.isConnected||Number(form.dataset.previewRequest)!==request)return;
      region.innerHTML=lsMatchPreview(result,'data-ls-use-source');
      if(result.count){form.dataset.previewInput=JSON.stringify(input);submit.disabled=false;}
    }catch(error){
      if(form.isConnected&&Number(form.dataset.previewRequest)===request){
        region.innerHTML='<p>'+lsEsc(error.message)+'</p><button class="btn small" type="button" data-ls-preview-retry>重新预览</button>';
      }
    }
  },delay));
}
async function createLuoshuTask(source='') {
  if (!lsWrite()) throw new Error('当前岗位无权创建抽取任务');
  const [resources,templates,configs]=await Promise.all([api('/api/resources'),api(lsApi+'/templates'),api(lsApi+'/configs')]);
  lsState.templates=[...templates.map(item=>({...item,key:item.id})),...configs.map(item=>({...item,key:'cfg-'+item.id,config:true}))];
  lsState.sources=workSourceChoices(resources,'production',source.split('|')[0]).flatMap(resource=>resource.versions.filter(version=>version.status==='approved').map(version=>{
    const kind=lsSourceKind(resource,version);
    return {id:resource.id+'|'+version.id,resourceId:resource.id,active:version.id===resource.activeVersion,kind,
      label:`${resource.title} · v${version.number} · ${version.filename} · ${resource.split==='train'?'训练':'评测留出'}`};
  }));
  if (!lsState.sources.length) {
    openModal('新建抽取任务',lsEmpty('暂无已核准的源版本')+`<div class="ls-actions">${workBtn('打开资源目录','nav','resources','primary')}</div>`);
    return;
  }
  const selected=lsState.sources.find(item=>item.id===source) || (!source.includes('|') && lsState.sources.find(item=>item.resourceId===source && item.active));
  const defaultTemplate=lsState.templates.find(item=>item.id==='source') || lsState.templates[0];
  if (!defaultTemplate) throw new Error('未找到可用抽取模板');
  openModal('新建抽取任务',workModalForm('ls-create',`
    <div class="ls-fields"><label class="field">原文类型<select id="ls-source-kind">${workSelect(lsSourceTypes)}</select></label>
      <label class="field">已核准源版本<select name="source" required>${lsSourceOptions('',selected?.id)}</select></label></div>
    <label class="field">任务名称（可选）<input name="title" maxlength="180"></label>
    <label class="field">抽取模板<select name="template" id="ls-create-template">${workSelect(lsState.templates.map(item=>[item.key,item.name]),defaultTemplate.key)}</select></label>
    <div id="ls-template-fields">${lsTemplateFields(defaultTemplate.key)}</div><div data-ls-preview aria-live="polite"></div>`, '执行抽取'));
  lsSchedulePreview(wb('form[data-form="ls-create"]'));
}
function lsCsvCell(value) {
  const raw=String(value??'');
  const safe=/^\s*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? "'"+raw : raw;
  return '"'+safe.replaceAll('"','""')+'"';
}
function lsExport(scope,format) {
  let rows,name;
  if (scope==='knowledge') {
    rows=lsKnowledgeFiltered();name='已核查知识库';
  } else {
    const task=lsState.detail;
    rows=task.records.map(record=>({...record,extractionId:task.id,extractionTitle:task.title,resourceId:task.resourceId,
      versionId:task.versionId,filename:task.filename,split:task.split,templateName:task.templateName}));
    name=task.id+'-抽取结果';
  }
  if (!rows.length) throw new Error('无符合条件的记录可导出');
  if (format==='json') return downloadJson(name+'.json',rows);
  const columns=[['记录编号','id'],['任务编号','extractionId'],['抽取任务','extractionTitle'],['源资源','resourceId'],['版本','versionId'],['文件','filename'],
    ['模板','templateName'],['实体','subject'],['属性','field'],['属性值','value'],['原字段','sourceField'],['证据块','blockId'],['原文位置','location'],['原文','evidence'],
    ['状态','status'],['核查人','reviewer'],['核查意见','note'],['核查时间','reviewedAt']];
  const lines=[columns.map(([label])=>lsCsvCell(label)).join(','),...rows.map(row=>columns.map(([,key])=>lsCsvCell(key==='status'?(lsStatuses[row.status]?.[0] || row.status):row[key])).join(','))];
  workDownload(name+'.csv',new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));
}
function lsRenderReview() {
  const host=document.querySelector('#ls-review-body');
  if (host && lsState.detail) host.innerHTML=lsReviewBody(lsState.detail);
}
function lsRenderKnowledge() {
  const host=document.querySelector('#ls-knowledge-rows');
  if (host) host.innerHTML=lsKnowledgeRows();
}
async function lsSaveRecord(form,decision) {
  if (decision!=='reject' && !form.reportValidity()) return;
  const {task,id,revision}=form.dataset;
  const formData=new FormData(form);
  const payload={decision,recordId:id,revision:Number(revision)};
  for (const key of ['subject','field','value','note']) payload[key]=String(formData.get(key)||'').trim();
  try {
    await api(lsBase(task)+'/review','POST',payload);
  } catch(error) {
    if (error.status===409 && !form.querySelector('[data-action="ls-reload"]')) {
      form.querySelector('.ls-actions')?.insertAdjacentHTML('beforeend',lsButton('读取最新记录','reload',task,'small'));
    }
    throw error;
  }
  lsState.recordId=id;
  await refresh();
  notify({save:'已保存核查草稿',approve:'知识记录已通过核查',reject:'知识记录已剔除'}[decision]);
}
async function handleLuoshuSubmit(form) {
  const formType=form.dataset.form;
  const values=new FormData(form);
  if (formType==='ls-create') {
    const input=lsExtractionInput(form);
    if(!input || JSON.stringify(input)!==form.dataset.previewInput){lsSchedulePreview(form);return true;}
    const payload={...input,title:String(values.get('title')||'').trim()};
    const task=await api(lsApi+'/extractions','POST',payload);
    closeModal();
    await openLuoshuTask(task.id);
    notify('抽取任务已完成');
    return true;
  }
  if (formType==='ls-review') {await lsSaveRecord(form,'save');return true;}
  if (formType==='ls-generate') {
    const response=await api(lsBase(form.dataset.id)+'/generate','POST',{revision:Number(form.dataset.revision),title:String(values.get('title')||'').trim()});
    closeModal();
    lsState.tab='delivery';
    lsState.taskId=response.extraction.id;
    await refresh();
    notify('已生成训练批次 '+response.batch.id);
    return true;
  }
  return false;
}
async function handleLuoshuAction(action,el) {
  const id=el.dataset.id || '';
  switch(action) {
    case 'ls-tab':
      if (!lsTabs.some(([key])=>key===id)) return false;
      lsState.tab=id;await refresh();break;
    case 'ls-new': await createLuoshuTask(id);break;
    case 'ls-open': await openLuoshuTask(id);break;
    case 'ls-reload': await refresh();break;
    case 'ls-task-knowledge':
      lsState.knowledgeQuery=id;lsState.knowledgeField='';lsState.knowledgePage=0;lsState.tab='knowledge';await refresh();break;
    case 'ls-trace': {
      const [task,record]=id.split('|');
      await openLuoshuTask(task,record);break;
    }
    case 'ls-prev':
    case 'ls-next': {
      const visible=lsVisibleRecords(lsState.detail);
      const next=visible[visible.findIndex(item=>item.id===lsState.recordId)+(action==='ls-next'?1:-1)];
      if (next) {lsState.recordId=next.id;lsRenderReview();}
      break;
    }
    case 'ls-knowledge-prev':
    case 'ls-knowledge-next':
      lsState.knowledgePage=Math.max(0,lsState.knowledgePage+(action==='ls-knowledge-next'?1:-1));
      lsRenderKnowledge();break;
    case 'ls-approve':
    case 'ls-reject':
      await lsSaveRecord(el.closest('form'),action==='ls-approve'?'approve':'reject');break;
    case 'ls-generate': {
      const task=lsState.detail;
      if (!task || task.id!==id) throw new Error('请重新选择抽取任务');
      openModal('生成训练语料',`<form class="stack" data-form="ls-generate" data-id="${lsEsc(id)}" data-revision="${lsEsc(task.revision)}">
        <div>${lsSubject(task.title,id)}</div><div class="ls-meta">已核查通过 ${task.counts.approved} 条 · 生成后锁定抽取记录</div>
        <label class="field">批次名称（可选）<input name="title" maxlength="180"></label>
        <div class="ls-actions">${workBtn('取消','dialog-close')}<button type="submit" class="btn primary">生成批次</button></div></form>`);
      break;
    }
    case 'ls-export': {
      const [scope,format]=id.split('-');
      lsExport(scope,format);break;
    }
    default:return false;
  }
  return true;
}
document.addEventListener('input',event=>{
  const el=event.target;
  if(el.name==='fields' && el.form?.dataset.form==='ls-create')lsSchedulePreview(el.form,220);
  if (el.id==='ls-task-query') {lsState.taskQuery=el.value;document.querySelector('#ls-task-rows').innerHTML=lsTaskRows();}
  if (el.id==='ls-knowledge-query') {lsState.knowledgeQuery=el.value;lsState.knowledgePage=0;lsRenderKnowledge();}
});
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-ls-use-source],[data-ls-preview-retry]');
  if(!button?.form)return;
  if(button.hasAttribute('data-ls-use-source')){
    button.form.elements.template.value='source';
    button.form.querySelector('#ls-template-fields').innerHTML=lsTemplateFields('source');
  }
  lsSchedulePreview(button.form);
});
document.addEventListener('change',async event=>{
  const el=event.target;
  try {
    if (el.id==='ls-source-kind') {const source=el.form.elements.source;source.innerHTML=lsSourceOptions(el.value,source.value);}
    if (el.id==='ls-create-template') document.querySelector('#ls-template-fields').innerHTML=lsTemplateFields(el.value);
    if(el.form?.dataset.form==='ls-create' && (el.id==='ls-source-kind'||el.name==='template'||el.name==='source'))lsSchedulePreview(el.form);
    if (el.id==='ls-task-picker') {lsState.taskId=el.value;lsState.recordId='';lsState.recordStatus='';await refresh();}
    if (el.id==='ls-record-status') {lsState.recordStatus=el.value;lsState.recordId='';lsRenderReview();}
    if (el.id==='ls-record-picker') {lsState.recordId=el.value;lsRenderReview();}
    if (el.id==='ls-knowledge-field') {lsState.knowledgeField=el.value;lsState.knowledgePage=0;lsRenderKnowledge();}
  } catch(error) {notify(error.message,'error');}
});
