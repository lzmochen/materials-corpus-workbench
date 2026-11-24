'use strict';
let catCategory='', catOwner='', catBatch=null;
let catPage=1, catFilterSignature='';
const catPageSize=8;
const catSelected=new Set();
const catActive=item=>item.versions.find(v=>v.id===item.activeVersion);
const catWritable=()=>workCan('operator');
const catAccessible=item=>item.split!=='holdout'||!workCan('annotator');
const catEligible=item=>catAccessible(item)&&catWritable()&&catActive(item)?.status==='approved';
const catUses=[['train','训练资源'],['holdout','评测留出']];

function catFiltered(){
  const query=workFilter.query.trim().toLowerCase();
  return workCatalog.filter(item=>(!catCategory||guideFamily(item)===catCategory)&&(!guideTopic||guideTopic===guideResourceTopic(item))&&(!guideOrigin||guideOrigin===guideProvenance(item))&&(!workFilter.split||item.split===workFilter.split)&&(!workFilter.status||item.status===workFilter.status)&&[item.title,item.category,item.source,item.id,guideFamily(item),item.topic,catActive(item)?.filename].join(' ').toLowerCase().includes(query));
}
function catButton(label,action,value,cls='',extra=''){
  return `<button type="button" class="cat-btn ${cls}" data-cat="${action}" data-value="${escapeHtml(value)}" ${extra}>${label}</button>`;
}
function catPageView(){
  const signature=JSON.stringify([workFilter.query,workFilter.status,workFilter.split,catCategory,guideTopic,guideOrigin]);
  if(signature!==catFilterSignature){catPage=1;catFilterSignature=signature;}
  const rows=catFiltered();
  const pages=Math.max(1,Math.ceil(rows.length/catPageSize));
  catPage=Math.max(1,Math.min(pages,catPage));
  const first=(catPage-1)*catPageSize;
  return {rows:rows.slice(first,first+catPageSize),total:rows.length,pages,first};
}
function catDesk(){
  if(catOwner!==window.workspaceUser.username){catOwner=window.workspaceUser.username;catSelected.clear();catBatch=null;catIntake=null;catCategory='';guideTopic='';guideOrigin='';catPage=1;}
  for(const id of catSelected)if(!workCatalog.some(r=>r.id===id&&catEligible(r)))catSelected.delete(id);
  const families=[...new Set(workCatalog.map(guideFamily))].sort((a,b)=>a.localeCompare(b,'zh'));
  if(!families.includes(catCategory))catCategory='';
  const scopes=[['','全部资源'],...catUses].map(([key,label])=>{
    const count=key?workCatalog.filter(r=>r.split===key).length:workCatalog.length;
    return catButton(`<span>${label}</span><small>${count}</small>`,'split',key,'cat-scope',`aria-pressed="${key===workFilter.split}"`);
  }).join('');
  const intakeTool=catWritable()?'<button type="button" data-catalog-plan="api">'+workIcon('rows')+'接口采集</button>':'';
  const tools=`<details class="cat-menu"><summary class="cat-trigger">目录工具<i aria-hidden="true"></i></summary><div class="cat-popover">${intakeTool}<button type="button" data-guide="coverage">${workIcon('chart')}专题覆盖</button><button type="button" data-catalog-plan="assets">${workIcon('box')}资产发布台账</button><button type="button" data-gstd="library">${workIcon('sheets')}标准与成果台账</button>${catWritable()?'<button type="button" data-intake-action="history">'+workIcon('clock')+'采集记录</button>':''}</div></details>`;
  const registers=catWritable()? `<button class="btn" type="button" data-intake-action="open">批量采集</button>${workBtn('登记资源','resource-create','','primary','plus')}`:'';
  const filters=`<details class="cat-advanced"><summary class="cat-trigger">${platIcon('tools')}筛选条件<i aria-hidden="true"></i></summary>
    <div class="cat-filter-pop"><label>材料门类<select aria-label="材料门类筛选" data-cat-field="family">${workSelect([['','全部门类'],...guideOptions(families)],catCategory)}</select></label>
    <label>语料专题<select aria-label="语料专题筛选" data-guide-filter="topic">${workSelect([['','全部专题'],...guideOptions([...guideTopics,'待归类'])],guideTopic)}</select></label>
    <label>资料来源<select aria-label="来源类型" data-guide-filter="origin">${workSelect([['','全部来源'],...Object.entries(guideOrigins)],guideOrigin)}</select></label></div></details>`;
  return `<section class="cat-desk"><div class="cat-main"><header class="cat-head"><h2>资源台账</h2><div class="cat-actions">${workScopeMenu('catalog')}${tools}${registers}</div></header>
    <div class="cat-scopes" role="group" aria-label="资源用途">${scopes}</div>
    <div class="cat-tools"><label class="cat-search">${platIcon('search')}<input type="search" id="work-resource-query" aria-label="搜索资源" placeholder="搜索资源名称、来源或编号" value="${escapeHtml(workFilter.query)}"></label>
    <select id="work-resource-status" aria-label="资源状态">${workSelect([['','全部状态'],...['registered','parsing','parsed','approved','failed'].map(k=>[k,workStatuses[k][0]])],workFilter.status)}</select>
    ${filters}<button type="button" class="cat-evidence-launch" data-catalog-evidence="open">${workIcon('target')}按试验记录查找</button></div>
    <div id="work-resource-rows">${catTable()}</div></div></section>`;
}
async function catalogOpenFamily(family){
  workFilter.query='';workFilter.status='';workFilter.split='';
  catCategory='';guideTopic='';guideOrigin='';catPage=1;
  const owner=window.workspaceUser?.username;
  workRecordScopes.delete(workScopeKey('catalog'));
  await navigate('resources');
  if(!owner||window.workspaceUser?.username!==owner||window.workspacePage!=='resources'||!wb('.cat-desk'))return;
  if(family&&workCatalog.some(resource=>guideFamily(resource)===family)){
    catCategory=family;
    wb('[data-cat-field="family"]').value=family;
    catUpdate();
  }
}
function catFilterChips(){
  const values=[['family',catCategory],['topic',guideTopic],['origin',guideOrigins[guideOrigin]]].filter(([,value])=>value);
  if(!values.length)return '';
  return `<div class="cat-active-filters">${values.map(([key,value])=>catButton(`${escapeHtml(value)}<span aria-hidden="true">×</span>`,'remove-filter',key,'cat-chip',`aria-label="取消${escapeHtml(value)}筛选"`)).join('')}</div>`;
}
function catResourceRow(item,selectable){
  const version=catActive(item);
  const ext=(version?.filename?.split('.').pop()||'').toUpperCase();
  const kind=['PNG','JPG','JPEG'].includes(ext)?'image':['CSV','TSV','JSONL'].includes(ext)?'sheet':'file';
  const title=catAccessible(item)?`<button type="button" class="cat-title" data-action="resource-open" data-id="${escapeHtml(item.id)}">${escapeHtml(item.title)}</button>`:`<span class="cat-restricted">${escapeHtml(item.title)}</span>`;
  return `<tr>${selectable?`<td class="cat-check"><input type="checkbox" data-cat-check="${escapeHtml(item.id)}" aria-label="选择 ${escapeHtml(item.title)}" ${catSelected.has(item.id)?'checked':''} ${catEligible(item)?'':'disabled title="仅可批量抽取已核准版本"'}></td>`:''}
    <td class="cat-name"><div class="cat-record"><span class="cat-file cat-${kind}" aria-hidden="true">${workIcon(kind==='sheet'?'rows':'file')}<small>${escapeHtml(ext.slice(0,5))}</small></span>${title}${workSourceLabel(item)?'<span class="cat-source-type">'+escapeHtml(workSourceLabel(item))+'</span>':''}</div></td>
    <td class="cat-family-cell">${escapeHtml(guideFamily(item))}</td><td class="cat-topic-cell">${escapeHtml(guideResourceTopic(item))}</td>
    <td class="cat-purpose-cell">${item.split==='holdout'?'评测留出':'训练'}</td><td class="cat-version-cell">${version?'v'+escapeHtml(version.number):'—'}</td><td class="cat-status-cell">${statusBadge(item.status)}</td></tr>`;
}
function catTable(){
  const {rows,total,pages,first}=catPageView();
  const eligible=rows.filter(catEligible),selectable=catWritable();
  const all=eligible.length>0&&eligible.every(r=>catSelected.has(r.id));
  const batchTools=catSelected.size||catBatch?`<div class="cat-selection">${catSelected.size?`<span>已选 <b>${catSelected.size}</b> 份</span>${catButton('批量抽取','batch','','cat-batch')}${catButton('清除选择','clear','')}`:''}${catBatch&&selectable?catButton('提交记录','results',''):''}</div>`:'';
  const pageButton=(label,n,disabled)=>catButton(label,'page',n,'cat-page-btn',disabled?'disabled':'');
  const footer=`<div class="cat-pagination"><span>${total?`第 ${first+1}–${first+rows.length} 条，共 ${total} 份资源`:'共 0 份资源'}</span>${pages>1?`<div>${pageButton('上一页',catPage-1,catPage<=1)}<span aria-live="polite">${catPage} / ${pages}</span>${pageButton('下一页',catPage+1,catPage>=pages)}</div>`:''}</div>`;
  return `${catFilterChips()}${batchTools}<div class="cat-scroll"><table class="cat-table"><thead><tr>${selectable?`<th class="cat-check"><input type="checkbox" data-cat-check="all" aria-label="选择本页全部已核准版本" ${all?'checked':''} ${eligible.length?'':'disabled'}></th>`:''}<th>资源名称</th><th class="cat-family-cell">材料门类</th><th class="cat-topic-cell">语料专题</th><th class="cat-purpose-cell">用途</th><th class="cat-version-cell">版本</th><th>状态</th></tr></thead><tbody>${rows.map(item=>catResourceRow(item,selectable)).join('')}</tbody></table></div>${total?'':workEmpty('暂无匹配资源')}${footer}`;
}
function catUpdate(){const el=wb('#work-resource-rows');if(el)el.innerHTML=catTable();}
function catCloseMenus(except){
  for(const menu of document.querySelectorAll('.cat-menu[open],.cat-advanced[open]'))if(menu!==except)menu.open=false;
}
document.addEventListener('click',event=>{
  const target=event.target;
  const menu=target.closest('.cat-menu,.cat-advanced');
  catCloseMenus(menu);
  if(menu?.classList.contains('cat-menu')&&target.closest('button'))menu.open=false;
});
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const menu=document.querySelector('.cat-menu[open],.cat-advanced[open]');
  if(menu){menu.open=false;menu.querySelector('summary')?.focus();}
});
document.addEventListener('change',e=>{
  if(e.target.dataset.catField==='family'){catCategory=e.target.value;catUpdate();return;}
  const key=e.target.dataset.catCheck;if(!key)return;
  const rows=(key==='all'?catPageView().rows:workCatalog.filter(r=>r.id===key)).filter(catEligible);
  rows.forEach(r=>e.target.checked?catSelected.add(r.id):catSelected.delete(r.id));catUpdate();
});
async function catSetup(){
  if(catBatch?.running){catResults();return;}
  const rows=workCatalog.filter(r=>catSelected.has(r.id)&&catEligible(r));
  if(!rows.length)return;
  const templates=(await api('/api/luoshu/templates')).filter(t=>t.id!=='custom');
  if(!templates.length)throw new Error('暂无可用模板');
  openModal('批量创建抽取任务',`<div class="stack"><label class="field">抽取模板<select id="cat-template">${workSelect(templates.map(t=>[t.id,t.name]),'source')}</select></label><div class="cat-batch-list">${rows.map(r=>`<div><strong>${escapeHtml(r.title)}</strong><small>v${catActive(r).number}</small></div>`).join('')}</div><div class="actions">${catButton('提交 '+rows.length+' 份资源','submit','','cat-batch')}</div></div>`);
}
function catResults(){
  if(!catBatch)return;
  const rows=catBatch.rows.map(row=>{
    let action='';
    if(row.taskId) action=workBtn('核查抽取结果','home-extraction',row.taskId,'small');
    if(row.status==='failed'&&row.fieldMismatch) action=workBtn('调整抽取字段','work-extraction-create',row.id+'|'+row.version,'small');
    if(row.status==='unknown') action=catLineageButton(row.id,row.version);
    return `<div><div><strong>${escapeHtml(row.title)}</strong><br><small>v${escapeHtml(row.number)} · ${escapeHtml(row.message)}</small></div>${action}</div>`;
  }).join('');
  const retry=!catBatch.running&&catBatch.rows.some(row=>row.status==='failed')?catButton('重试失败项','retry','','cat-batch'):'';
  openModal('批量抽取提交记录',`<div class="stack"><div class="cat-batch-list">${rows}</div>${retry}</div>`);
}
async function catRun(batch){
  if(batch.running)return;
  batch.running=true;catResults();catUpdate();
  for(const row of batch.rows.filter(r=>['pending','failed'].includes(r.status))){
    if(batch!==catBatch||batch.owner!==window.workspaceUser?.username)break;
    try{
      const task=await api('/api/luoshu/extractions','POST',{resourceId:row.id,versionId:row.version,template:batch.template});
      row.status='ok';row.taskId=task.id;row.message='已提交 · '+task.id;
    }catch(err){
      const rejected=err.status>=400&&err.status<500&&err.status!==408;
      row.status=rejected?'failed':'unknown';
      row.fieldMismatch=err.status===422;
      row.message=rejected?'未提交 · '+err.message:'提交结果待确认，请核对该版本的关联记录';
    }
    if(batch!==catBatch||batch.owner!==window.workspaceUser?.username)break;
    if(row.status!=='failed')catSelected.delete(row.id);
    if(wb('#workspace-dialog')?.open&&wb('#dialog-title').textContent==='批量抽取提交记录')catResults();
  }
  batch.running=false;
  if(batch!==catBatch||batch.owner!==window.workspaceUser?.username)return;
  catUpdate();
  if(wb('#workspace-dialog')?.open&&wb('#dialog-title').textContent==='批量抽取提交记录')catResults();
}
document.addEventListener('click',async event=>{
  const btn=event.target.closest('[data-cat]');if(!btn)return;
  const action=btn.dataset.cat;
  try{
    if(action==='split'){
      workFilter.split=btn.dataset.value;
      for(const scope of btn.closest('.cat-desk').querySelectorAll('.cat-scope'))scope.setAttribute('aria-pressed',String(scope===btn));
      catUpdate();return;
    }
    if(action==='remove-filter'){
      const field=btn.dataset.value;
      if(field==='family')catCategory='';
      if(field==='topic')guideTopic='';
      if(field==='origin')guideOrigin='';
      const control=document.querySelector(field==='family'?'[data-cat-field="family"]':'[data-guide-filter="'+field+'"]');
      if(control)control.value='';
      catUpdate();wb('.cat-advanced summary')?.focus({preventScroll:true});return;
    }
    if(action==='page'){
      catPage=Number(btn.dataset.value);catUpdate();
      const next=[...document.querySelectorAll('.cat-page-btn:not(:disabled)')].find(el=>el.textContent===btn.textContent)||wb('.cat-page-btn:not(:disabled)');
      next?.focus({preventScroll:true});return;
    }
    if(action==='clear'){catSelected.clear();catUpdate();}
    if(action==='results')catResults();
    if(action==='batch'&&catWritable())await catSetup();
    if(action==='submit'&&catWritable()){
      if(catBatch?.running)return;
      const rows=workCatalog.filter(r=>catSelected.has(r.id)&&catEligible(r)).map(r=>({id:r.id,title:r.title,version:r.activeVersion,number:catActive(r).number,status:'pending',message:'待提交'}));
      catBatch={owner:catOwner,template:wb('#cat-template').value,running:false,rows};
      await catRun(catBatch);
    }
    if(action==='retry'&&catWritable()&&catBatch)await catRun(catBatch);
  }catch(error){openModal('操作提示',escapeHtml(error.message));}
});

function catLineageButton(id,version){
  return version?`<button type="button" class="cat-btn" data-cat-lineage="${escapeHtml(id)}" data-version="${escapeHtml(version)}">关联记录</button>`:'';
}

function catRenderResourceDetail(resource,version){
  const writable=catWritable();
  const id=resource.id;
  const versionKey=version ? id+'|'+version.id : '';
  const blocks=version?.blocks||[];
  const isImage=/\.(png|jpe?g)$/i.test(version?.filename||'');
  const current=version&&version.id===resource.activeVersion;
  let actions='';
  if(writable&&current&&['registered','failed'].includes(version.status))actions=workBtn(isImage?'执行图纸文字识别':'发起解析','resource-parse',versionKey,'primary');
  if(writable&&current&&version.status==='parsed')actions=workBtn('确认原文核查','resource-approve',versionKey,'primary');
  if(writable&&version?.status==='approved'){
    if(resource.split==='train') actions=workBtn('从此版本制备语料','resource-pipeline',versionKey,'primary');
    actions+=workBtn('创建知识抽取任务','work-extraction-create',versionKey,resource.split==='train'?'':'primary');
    if(resource.split==='train') actions+=workBtn('生成训练样本','batch-create',versionKey);
  }
  const meta=[['资源编号',id],['材料门类',guideFamily(resource)],['材料子类',resource.category],['语料专题',guideResourceTopic(resource)],['资料来源',resource.source],['数据用途',resource.split==='holdout'?'评测留出':'训练'],['使用许可',resource.license||'未登记']];
  const tabs=[['evidence','原文与证据'],['clean','规范化'],['metadata','来源与权限'],['versions','版本与关联']];
  const documentTool=block=>writable && version.status==='approved' && mrTextMatch(block.text).length
    ? '<button type="button" class="btn small" data-material-block="'+escapeHtml(block.id)+'">提取本段反应记录</button>' : '';
  const origin=version?.toolEvidence;
  const originLink=origin?'<div class="cat-detail-actions"><button type="button" class="btn" data-material-origin="'+escapeHtml(origin.resourceId)+'" data-version="'+escapeHtml(origin.versionId)+'" data-block="'+escapeHtml(origin.blockId)+'">查看工具记录的原文证据</button></div>':'';
  const evidence=blocks.map(block=>`<details class="evidence-row"><summary><span class="mono">${escapeHtml(block.id)}</span><strong>${escapeHtml(block.location)}</strong><span>${escapeHtml(block.text.slice(0,70))}</span></summary><p>${escapeHtml(block.text)}</p>${block.fields?`<dl class="cat-block-fields">${Object.entries(block.fields).map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(typeof v==='object'?JSON.stringify(v):v)}</dd></div>`).join('')}</dl>`:''}${documentTool(block)}</details>`).join('');
  openModal('资源详情',`<section class="cat-detail" data-resource-id="${escapeHtml(id)}" data-version-id="${escapeHtml(version?.id||'')}" data-parse-job="${escapeHtml(version?.status==='parsing'?version.jobId:'')}"><header class="cat-detail-header"><div><h3>${escapeHtml(resource.title)}</h3><span>${escapeHtml(guideFamily(resource))} · ${resource.split==='holdout'?'评测留出':'训练资源'}</span></div>${statusBadge(version?.status||resource.status)}</header>
    <div class="cat-detail-tabs" role="group" aria-label="资源详情视图">${tabs.map(([k,t])=>`<button type="button" data-cat-detail-tab="${k}" aria-pressed="${k==='evidence'}" aria-controls="cat-detail-${k}">${t}</button>`).join('')}</div>
    <section id="cat-detail-evidence"><header class="cat-document-head"><div><strong>${version?escapeHtml(version.filename):'暂无原文件'}</strong>${version?`<span>v${escapeHtml(version.number)} · ${blocks.length} 条证据${version.template?' · '+escapeHtml(workTemplateNames[version.template]||version.template):''}</span>`:''}</div>
    <div class="actions">${isImage?workBtn('查看图纸原文','drawing-preview',versionKey,'small')+workBtn('识别科学曲线','resource-curve',versionKey,'small'):''}${version?workBtn('下载原文件','resource-file',versionKey,'small'):''}</div></header>
    ${version?.error?`<p class="form-error">${escapeHtml(version.error)}</p>`:''}
    ${blocks.length?`<section class="evidence-list" aria-label="抽取证据">${evidence}</section>`:'<p class="cat-note" role="status">'+(version?.status==='parsing'?'正在解析原文件，完成后可核对原文并核准本版本。':'当前版本暂无解析证据。')+'</p>'}
    ${actions?`<div class="cat-detail-actions">${actions}</div>`:''}</section>
    <section id="cat-detail-clean" hidden><div data-catalog-receipt="clean"></div></section>
    <section id="cat-detail-metadata" hidden><dl class="cat-detail-meta">${meta.map(([k,v])=>`<div><dt>${k}</dt><dd>${escapeHtml(v||'—')}</dd></div>`).join('')}</dl>${guideSources(resource)}${originLink}<div data-catalog-receipt="metadata"></div>${writable?`<div class="cat-detail-actions"><button type="button" class="btn" data-guide="classify" data-value="${escapeHtml(id)}">编辑分类</button></div>`:''}</section>
    <section id="cat-detail-versions" hidden><label class="field">文件版本<select id="work-resource-version-picker" data-resource="${escapeHtml(id)}">${workSelect(resource.versions.map(v=>[v.id,`v${v.number} · ${v.filename} · ${workStatuses[v.status]?.[0]||v.status}`]),version?.id)}</select></label>
    ${version?`<dl class="cat-detail-meta"><div><dt>文件校验值（SHA-256）</dt><dd class="mono">${escapeHtml(version.sha256||'—')}</dd></div></dl>`:''}<div class="cat-detail-actions">${resource.split==='train'&&version?workBtn('查看办理进度','resource-case-trail',versionKey):''}${catLineageButton(id,version?.id)}${writable?workBtn('登记新版本','resource-version',id):''}</div><div data-catalog-receipt="versions"></div></section></section>`);
  detailCatalogSource={resource,version,owner:window.workspaceUser.username};
}
document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-cat-detail-tab]');if(!tab)return;
  const detail=tab.closest('.cat-detail');
  for(const btn of detail.querySelectorAll('[data-cat-detail-tab]')){
    const selected=btn===tab;
    btn.setAttribute('aria-pressed',String(selected));
    detail.querySelector('#'+btn.getAttribute('aria-controls')).hidden=!selected;
  }
  if(tab.dataset.catDetailTab!=='evidence')loadCatalogReceipt(detail,tab.dataset.catDetailTab);
});

let catIntake=null;
const intakeStatuses={pending:'待登记',registered:'已登记',reused:'已去重',failed:'需处理'};
const intakeDone=row=>['registered','reused'].includes(row.status);
const intakeUrl='/api/intake-batches';
const intakeFormats='.pdf,.docx,.txt,.md,.csv,.tsv,.jsonl,.png,.jpg,.jpeg';
const intakeFields=[['source','资料来源',180],['license','权属或使用许可',180],['category','材料子类',100]];
function intakeDraft(){
  return {requestId:crypto.randomUUID(),rows:[],defaults:{source:'',license:'',category:''},running:false};
}
function intakeControl(label,key,value,number,max){
  return `<label class="field">${label}<input data-intake-key="${key}" data-intake-row="${number}" maxlength="${max}" value="${escapeHtml(value||'')}"></label>`;
}
function intakeChoice(label,key,choices,value,number){
  return `<label class="field">${label}<select data-intake-key="${key}" data-intake-row="${number}">${workSelect(choices,value)}</select></label>`;
}
function intakeButton(label,action,extra='',primary=false){
  return `<button type="button" class="btn${primary?' primary':''}" data-intake-action="${action}" ${extra}>${label}</button>`;
}
function intakeCounts(rows){
  return Object.fromEntries(Object.keys(intakeStatuses).map(key=>[key,rows.filter(r=>r.status===key).length]));
}
function intakeTally(counts){
  return Object.entries(intakeStatuses).filter(([k])=>counts[k]).map(([k,label])=>`${label} ${counts[k]}`).join(' · ');
}
function intakeRowMarkup(row,i){
  const n=i+1, fields=row.fields;
  const state=`<span class="intake-state" data-status="${row.status}">${intakeStatuses[row.status]}</span>`;
  const heading=`<span class="intake-number">${n}</span><strong>${escapeHtml(row.filename)}</strong>${state}`;
  if(intakeDone(row)){
    return `<div class="intake-done">${heading}${workBtn('查看资源','resource-open',row.resourceId,'link small')}</div>`;
  }
  const split=intakeChoice('数据用途','split',catUses,fields.split,i);
  const family=intakeChoice('材料门类','materialFamily',[['','待归类'],...guideOptions(guideFamilies)],fields.materialFamily,i);
  const topic=intakeChoice('语料专题','topic',[['','待归类'],...guideOptions(guideTopics)],fields.topic,i);
  const missingFile=!row.file?`<label class="field">补选原文件<input type="file" data-intake-replace="${i}" accept="${intakeFormats}"></label>`:'';
  return `<section class="intake-row"><header>${heading}${!catIntake.manifest&&!catIntake.id?intakeButton('移除','remove',`data-index="${i}"`):''}</header>
    ${row.message?`<p role="status" class="intake-error">${escapeHtml(row.message)}</p>`:''}
    <div class="intake-grid">${intakeControl('资源名称','title',fields.title,i,180)}${split}${intakeFields.map(([key,label,max])=>intakeControl(label,key,fields[key],i,max)).join('')}${family}${topic}${missingFile}</div></section>`;
}
function intakeRender(){
  const draft=catIntake;
  const editable=!draft.id&&!draft.manifest;
  const remaining=draft.rows.filter(r=>!intakeDone(r));
  const defaults=draft.rows.length>1&&remaining.length?`<details class="intake-common"><summary>批量填写共同信息</summary><div class="intake-grid">${intakeFields.map(([key,label,max])=>intakeControl(label,key,draft.defaults[key],-1,max)).join('')}</div>${intakeButton('填充各行空缺字段','fill')}</details>`:'';
  const files=editable?`<label class="field intake-files">选择本地文件<input type="file" multiple data-intake-files accept="${intakeFormats}"><small>每批最多 50 份，单文件最大 8 MiB</small></label>`:'';
  const footer=remaining.length?intakeButton(draft.running?'登记中…':draft.id?'继续登记未完成项':'提交采集清单','submit','',true):draft.id?intakeButton('新建采集','new','',true):'';
  openModal('批量采集',`<div data-intake-work class="stack"><div class="intake-toolbar"><div><strong>${draft.id?'采集回执':'文件清单'}</strong><small>${escapeHtml(draft.id||'')}</small></div><div>${draft.id&&remaining.length?intakeButton('新建采集','new',draft.running?'disabled':''):''}${intakeButton('采集记录','history',draft.running?'disabled':'')}</div></div>
    <fieldset class="intake-fieldset" ${draft.running?'disabled':''}>${files}${defaults}<div class="intake-rows">${draft.rows.map(intakeRowMarkup).join('')}</div>
    <div class="intake-footer"><span role="status">${escapeHtml(draft.error||intakeTally(intakeCounts(draft.rows)))}</span>${footer}</div></fieldset></div>`);
}
function intakeRedraw(draft){
  if(catIntake===draft&&wb('#workspace-dialog')?.open&&wb('[data-intake-work]'))intakeRender();
}
async function intakeHistory(){
  const list=await api(intakeUrl);
  openModal('采集记录',`<div class="stack"><div class="intake-toolbar"><span>共 ${list.length} 批</span>${intakeButton('返回清单','open')}</div>${list.length?`<div class="intake-history">${list.map(item=>`<button type="button" data-intake-action="receipt" data-id="${escapeHtml(item.id)}"><span><strong>${escapeHtml(item.id)}</strong><small>${escapeHtml(item.createdBy)} · ${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN'))}</small></span><span>${intakeTally(item.counts)}</span></button>`).join('')}</div>`:workEmpty('暂无采集记录')}</div>`);
}
function intakeAdd(files){
  const draft=catIntake;
  if(draft.rows.length+files.length>50){draft.error='每批最多 50 份，请减少所选文件数量。';intakeRender();return;}
  draft.error='';
  for(const file of files){
    draft.rows.push({file,filename:file.name,status:'pending',message:'',fields:{
      title:file.name.replace(/\.[^.]+$/,''),split:'train',materialFamily:'',topic:'',...draft.defaults}});
  }
  intakeRender();
}
async function intakeSubmit(){
  const draft=catIntake, owner=catOwner;
  if(!draft||draft.running||!draft.rows.length)return;
  draft.running=true;draft.error='';intakeRender();
  try{
    if(!draft.id){
      draft.manifest??=draft.rows.map(row=>({filename:row.filename,...row.fields}));
      const receipt=await api(intakeUrl,'POST',{requestId:draft.requestId,rows:draft.manifest});
      draft.id=receipt.id;
    }
    for(const [i,row] of draft.rows.entries()){
      if(catOwner!==owner||window.workspaceUser?.username!==owner)break;
      if(intakeDone(row))continue;
      if(!row.file){row.message='请补选清单中同名的原文件。';continue;}
      try{
        const payload={...row.fields,filename:row.filename,fileSize:row.file.size};
        if(row.file.size>0&&row.file.size<=8*1024*1024)Object.assign(payload,await workReadFile(row.file));
        const result=await api(`${intakeUrl}/${draft.id}/rows/${i+1}`,'POST',payload);
        Object.assign(row,result);
        if(intakeDone(row))delete row.file;
      }catch(error){
        row.message=error.message+' 可重新提交核对结果。';
      }
      intakeRedraw(draft);
    }
    if(catOwner===owner&&window.workspaceUser?.username===owner){
      const resources=await api('/api/resources');
      if(catOwner===owner&&window.workspaceUser?.username===owner){
        workCatalog=resources;
        if(window.workspacePage==='resources'&&wb('.cat-desk'))platformMount('resources',catDesk());
      }
    }
  }catch(error){
    if(!draft.id&&error.status>=400&&error.status<500)draft.manifest=null;
    draft.error=error.message;
  }
  finally{draft.running=false;intakeRedraw(draft);}
}
document.addEventListener('input',e=>{
  const key=e.target.dataset.intakeKey;
  if(!key||!catIntake||catIntake.running)return;
  const i=Number(e.target.dataset.intakeRow);
  const fields=i<0?catIntake.defaults:catIntake.rows[i]?.fields;
  if(fields)fields[key]=e.target.value;
});
document.addEventListener('change',e=>{
  if(!catIntake||catIntake.running)return;
  if(e.target.hasAttribute('data-intake-files')&&e.target.files.length)intakeAdd([...e.target.files]);
  if(e.target.hasAttribute('data-intake-replace')&&e.target.files.length){
    const row=catIntake.rows[Number(e.target.dataset.intakeReplace)], file=e.target.files[0];
    if(file.name===row.filename){row.file=file;row.message='';}else{row.message='文件名须与清单中的原文件一致。';}
    intakeRender();
  }
});
document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-intake-action]');
  if(!btn||!catWritable())return;
  const action=btn.dataset.intakeAction;
  try{
    if(action==='open'){catIntake??=intakeDraft();intakeRender();return;}
    if(catIntake?.running)return;
    if(action==='new'){catIntake=intakeDraft();intakeRender();}
    if(action==='history')await intakeHistory();
    if(action==='receipt'){
      const previous=catIntake?.id===btn.dataset.id?catIntake:null;
      const receipt=await api(intakeUrl+'/'+btn.dataset.id);
      for(const [i,row] of receipt.rows.entries()){
        if(!intakeDone(row)&&previous?.rows[i]?.file)row.file=previous.rows[i].file;
      }
      catIntake={...intakeDraft(),...receipt};
      intakeRender();
    }
    if(action==='remove'){catIntake.rows.splice(Number(btn.dataset.index),1);intakeRender();}
    if(action==='fill'){
      for(const row of catIntake.rows.filter(r=>!intakeDone(r))){
        for(const [key] of intakeFields)if(!row.fields[key])row.fields[key]=catIntake.defaults[key];
      }
      intakeRender();
    }
    if(action==='submit')await intakeSubmit();
  }catch(error){openModal('采集提示',`<p>${escapeHtml(error.message)}</p>${intakeButton('返回清单','open')}`);}
});

let catalogEvidence=null;
function evidenceButton(action,label,extra=''){
  return `<button type="button" class="btn small" data-catalog-evidence="${action}" ${extra}>${label}</button>`;
}
function evidenceOpen(){
  const own=window.workspaceUser.username;
  const split=workCan('annotator')?'train':(workFilter.split||'all');
  catalogEvidence={own,query:workFilter.query.trim(),split,versions:'current',result:null,request:0};
  evidenceDialog();
  if(catalogEvidence.query)evidenceFind(0);
}
function evidenceDialog(){
  const current=catalogEvidence;
  const splits=workCan('annotator')?[catUses[0]]:[['all','全部可见用途'],...catUses];
  openModal('按试验记录查找',`<div class="stack" data-evidence-desk><form class="cat-evidence-form">
    <label class="field cat-evidence-query">试样、材料牌号或试验条件<input type="search" required maxlength="100" name="query" value="${escapeHtml(current.query)}" placeholder="如 MT-A2，或 AA5754 23℃"></label>
    <label class="field">资源用途<select name="split">${workSelect(splits,current.split)}</select></label>
    <label class="field">版本范围<select name="versions">${workSelect([['current','当前已核准版本'],['approved','含历史已核准版本']],current.versions)}</select></label>
    <button type="submit" class="btn primary">查找记录</button></form><p class="cat-evidence-hint">多个条件用空格分开，须在同一条原文中命中。</p><div data-evidence-results aria-live="polite"></div></div>`);
  evidenceRows();
  wb('.cat-evidence-form input').focus();
}
function evidenceRows(){
  const box=wb('[data-evidence-results]'), data=catalogEvidence.result;
  if(!box||!data)return;
  if(!data.total){box.innerHTML=workEmpty('未找到匹配的已核准记录','请核对试样拼写、条件单位和版本范围。');return;}
  const body=data.rows.map((row,i)=>`<article class="cat-evidence-hit"><div><strong>${escapeHtml(row.title)}</strong><span>${row.split==='train'?'训练资源':'评测留出'} · v${row.version}${row.current?'':'（历史）'} · ${escapeHtml(row.location)}</span></div>
    <p>${escapeHtml(row.excerpt)}</p>${evidenceButton('source','定位原文',`data-hit="${i}"`)}</article>`).join('');
  const end=data.offset+data.rows.length;
  const pager=data.total>data.pageSize?`<div>${evidenceButton('prev','上一页',data.offset?'':'disabled')}${evidenceButton('next','下一页',end<data.total?'':'disabled')}</div>`:'';
  box.innerHTML=`<header class="cat-evidence-count"><b>命中 ${data.total} 条原文</b><span>第 ${data.offset+1}–${end} 条</span>${pager}</header>${body}`;
}
async function evidenceFind(offset){
  const current=catalogEvidence, form=wb('.cat-evidence-form'), box=wb('[data-evidence-results]');
  if(!form||!box||!current||!form.reportValidity())return;
  const values=new FormData(form);
  const query=String(values.get('query')).trim(),split=values.get('split'),versions=values.get('versions');
  if(query!==current.query||split!==current.split||versions!==current.versions)offset=0;
  const request=++current.request;
  Object.assign(current,{query,split,versions,result:null});
  box.textContent='正在查找已核准原文…';
  try{
    const result=await api('/api/evidence-search','POST',{query,split,versions,offset});
    if(current.request!==request||catalogEvidence!==current||!box.isConnected||current.own!==window.workspaceUser?.username)return;
    if(result.total&&offset>=result.total)return await evidenceFind(Math.floor((result.total-1)/result.pageSize)*result.pageSize);
    current.result=result;evidenceRows();
  }catch(error){
    if(current.request===request&&box.isConnected)box.textContent=error.message;
  }
}
document.addEventListener('submit',e=>{
  if(!e.target.matches('.cat-evidence-form'))return;
  e.preventDefault();evidenceFind(0);
});
document.addEventListener('input',e=>{
  if(!e.target.closest('.cat-evidence-form')||!catalogEvidence)return;
  ++catalogEvidence.request;
  catalogEvidence.result=null;
  wb('[data-evidence-results]').textContent='';
});
document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-catalog-evidence]');
  if(!btn)return;
  try{
    const action=btn.dataset.catalogEvidence;
    if(action==='open'){evidenceOpen();return;}
    const current=catalogEvidence;
    if(!current||current.own!==window.workspaceUser?.username)return;
    if(action==='back'){evidenceDialog();return;}
    const result=current.result;
    if(!result)return;
    if(action==='prev'||action==='next'){
      const step=action==='prev'?-1:1;
      return await evidenceFind(Math.max(0,result.offset+step*result.pageSize));
    }
    if(action==='source'){
      const row=result.rows[Number(btn.dataset.hit)];
      if(!row)return;
      await resourceOpen(row.resourceId,row.versionId);
      const target=[...document.querySelectorAll('.evidence-row')].find(el=>el.querySelector('summary .mono')?.textContent===row.blockId);
      wb('#dialog-body').insertAdjacentHTML('afterbegin',`<div class="cat-evidence-back">${evidenceButton('back','返回查找结果')}</div>`);
      if(target){target.open=true;target.classList.add('cat-evidence-target');target.querySelector('summary')?.focus();target.scrollIntoView({block:'center'});}
    }
  }catch(error){notify(error.message,'error');}
});

let detailCatalogSource=null;
const catalogReceiptButton=(label,action,primary=false)=>`<button type="button" class="btn ${primary?'primary':'small'}" data-catalog-plan="${action}">${label}</button>`;
function catalogMeta(rows){
  return '<dl class="cat-detail-meta">'+rows.map(([label,value])=>'<div><dt>'+escapeHtml(label)+'</dt><dd>'+escapeHtml(value??'—')+'</dd></div>').join('')+'</dl>';
}
function catalogReceiptPanel(part,source,receipt){
  const {resource,version}=source;
  if(part==='clean'){
    const normal=receipt.normalized;
    if(!normal.total)return '<p class="cat-note">该版本尚无规范化记录，请在「原文与证据」中查看解析状态。</p>';
    const summary=catalogMeta([['证据记录',normal.total+' 条'],['原文字段',normal.fields+' 种'],['保有原文位置',normal.located+' 条']]);
    const preview=normal.sample.map(row=>`<details class="evidence-row"><summary><strong>${escapeHtml(row.location)}</strong> ${escapeHtml(row.text.slice(0,65))}</summary><p>${escapeHtml(row.text)}</p></details>`).join('');
    return `<header class="cat-document-head"><div><strong>规范化记录</strong><span>统一换行与首尾空白，保留原有数值、单位和原文位置。</span></div></header>${summary}<div class="evidence-list">${preview}</div><div class="cat-detail-actions"><span class="cat-note">预览前 ${normal.sample.length} 条</span>${receipt.canExport?catalogReceiptButton('导出规范化 JSONL','export'):''}</div>`;
  }
  if(part==='metadata'){
    const owner=window.workspaceUser;
    const ledger=receipt.batches.map(b=>b.id+' · 第 '+b.number+' 行'+(b.status==='reused'?'（原件已归档）':'')).join('、');
    return catalogMeta([['接入方式',receipt.channel],['登记时间',workTime(version.createdAt)],['登记人',version.createdBy],...(ledger?[['关联采集批次',ledger]]:[]),['文件校验值（SHA-256）',version.sha256],['当前岗位',workRoles[workRole(owner.role)]||owner.display],['原文读取',resource.split==='holdout'?'仅数据管理员和评审专家可读':'训练原文可读'],['规范化导出',receipt.canExport?'允许导出本版本':catWritable()?'原文核准后可导出':'当前岗位无导出权限'],['语料交付','由数据管理员登记冻结版本的接收方']]);
  }
  const assets=receipt.releases;
  return '<h4>收录本版本的已发布数据集</h4>'+(assets.length?workTable(['数据集版本','类型','收录条目'],assets.map(item=>[
    workBtn(escapeHtml(item.title)+' · '+escapeHtml(item.version),'svc-release-view',item.id,'small link'),
    item.kind==='training'?'训练集':'评测集',String(item.itemCount)])):'<p class="cat-note">本原文版本尚未收录到已发布数据集。</p>')+'<div class="cat-detail-actions">'+catalogReceiptButton('查看资产发布台账','assets')+'</div>';
}
async function loadCatalogReceipt(detail,part){
  const box=detail.querySelector('[data-catalog-receipt="'+part+'"]');
  const source=detailCatalogSource;
  if(!source?.version||!box||source.owner!==window.workspaceUser?.username)return;
  const {resource,version}=source;
  box.textContent='正在读取版本记录…';
  try{
    source.pending??=api('/api/resources/'+encodeURIComponent(resource.id)+'/versions/'+encodeURIComponent(version.id)+'/catalog-receipt');
    const receipt=await source.pending;
    if(detail.isConnected&&source===detailCatalogSource&&source.owner===window.workspaceUser?.username)box.innerHTML=catalogReceiptPanel(part,source,receipt);
  }catch(error){
    source.pending=null;
    if(box.isConnected)box.textContent=error.message;
  }
}
function catalogApiForm(){
  if(!catWritable())throw new Error('请切换至数据管理员办理采集。');
  const native=![...document.scripts].some(s=>s.src.includes('browser-bridge.js'));
  openModal('接口采集',`<form class="stack" data-catalog-api><div class="document"><h3>结构化数据接入</h3><code>POST /api/catalog-intake</code><p>${native?'外部系统通过已授权的会话逐批提交报文，使用同一请求编号可检查并重试同一批次。':'在本浏览器导入业务系统导出的 JSON 报文。面向外部系统的持续推送需接入服务端部署。'}</p></div><label class="field">导入 JSON 报文<input type="file" accept=".json,application/json" data-catalog-payload></label><label class="field">请求内容<textarea name="payload" rows="9" required placeholder="填入来源、权属、请求编号和试验记录"></textarea></label><p class="form-error" role="alert" data-catalog-error></p><div class="actions">${catalogReceiptButton('载入报文样例','example')}<button type="submit" class="btn primary">提交并查看回执</button></div></form>`);
}
const catalogApiExample=()=>({
  requestId:'thermal-'+Date.now(),title:'导热性能接口样例',materialFamily:'无机非金属材料',category:'氧化物陶瓷',topic:'科学计算',
  split:'train',source:'接口格式样例',license:'样例数据，限流程验证',
  records:[{'试样':'TH-01','检测温度(℃)':25,'导热系数(W/m·K)':24.1},{'试样':'TH-02','检测温度(℃)':25,'导热系数(W/m·K)':23.8}]
});
function catalogChooseVersion(code){
  const labels={'3.1.2':'格式统一与清洗','3.1.3':'元数据与来源记录','3.3.2':'权限与安全控制','3.3.4':'语料溯源与血缘管理'};
  const rows=workCatalog.filter(catAccessible).flatMap(r=>r.versions.map(v=>[r.id+'|'+v.id,`${r.title} · v${v.number} · ${workStatuses[v.status]?.[0]||v.status}`]));
  const valid=code==='3.1.2'?rows.filter(([key])=>{const [rid,vid]=key.split('|');return workCatalog.find(r=>r.id===rid)?.versions.find(v=>v.id===vid)?.blockCount>0;}):rows;
  openModal(labels[code],valid.length?`<form class="stack" data-catalog-choose="${code}"><label class="field">资源及文件版本<select name="selection" required>${workSelect(valid,valid[0][0])}</select></label><div class="actions"><button class="btn primary" type="submit">查看本版本</button></div></form>`:workEmpty('当前无符合条件的文件版本',code==='3.1.2'?'请先登记并解析原文。':'请先在资源目录登记资料。'));
}
async function catalogPlanEntry(code){
  if(code==='3.3.5'){closeModal();return navigate('releases');}
  const owner=window.workspaceUser.username;
  if(window.workspacePage!=='resources')await navigate('resources');
  if(window.workspaceUser.username!==owner||window.workspacePage!=='resources')return;
  if(code==='3.3.1')return;
  if(code==='3.3.3')return evidenceOpen();
  if(code==='3.1.1'){
    if(!catWritable())return openModal('多源数据接入',workEmpty('当前岗位可查阅资源','数据管理员办理资料采集。'));
    return openModal('多源数据接入',`<div class="actions">${workBtn('登记原文','resource-create','','primary')}<button type="button" class="btn" data-intake-action="open">批量采集</button>${catalogReceiptButton('接口采集','api')}</div>`);
  }
  catalogChooseVersion(code);
}
document.addEventListener('change',async event=>{
  const field=event.target.closest('[data-catalog-payload]');if(!field?.files[0])return;
  const form=field.form, error=form.querySelector('[data-catalog-error]');
  try{
    if(field.files[0].size>8*1024*1024)throw new Error('单份接口报文上限为 8 MiB。');
    form.elements.payload.value=await field.files[0].text();error.textContent='';
  }catch(e){error.textContent=e.message;}
});
document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-catalog-api],[data-catalog-choose]');if(!form)return;
  event.preventDefault();
  const owner=window.workspaceUser.username;
  if(form.hasAttribute('data-catalog-choose')){
    const [id,version]=form.elements.selection.value.split('|');
    const code=form.dataset.catalogChoose;
    try{
      if(code==='3.3.4')return await openResourceLineage(id,version);
      await resourceOpen(id,version);
      if(owner===window.workspaceUser?.username)wb('[data-cat-detail-tab="'+(code==='3.1.2'?'clean':'metadata')+'"]')?.click();
    }catch(err){notify(err.message,'error');}
    return;
  }
  const button=form.querySelector('[type="submit"]'),error=form.querySelector('[data-catalog-error]');
  button.disabled=true;error.textContent='';
  try{
    let value;
    try{value=JSON.parse(form.elements.payload.value);}catch{throw new Error('请检查 JSON 括号、引号和逗号。');}
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请求内容须为含 records 数组的对象。');
    const result=await api('/api/catalog-intake','POST',value);
    if(!form.isConnected||owner!==window.workspaceUser?.username)return;
    await refresh();
    if(owner!==window.workspaceUser?.username)return;
    openModal('接口采集回执',catalogMeta([['采集批次',result.receiptId],['原文版本',result.versionId],['接入记录',result.recordCount+' 条'],['处理结果',result.status==='reused'?'已关联相同来源的原文件':'登记成功'],['SHA-256',result.sha256]])+'<div class="actions">'+workBtn('打开入库原文','resource-open',result.resourceId,'primary')+'</div>');
  }catch(err){if(form.isConnected)error.textContent=err.message;}finally{button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-catalog-plan]');if(!button)return;
  try{
    const action=button.dataset.catalogPlan;
    if(action==='api')return catalogApiForm();
    if(action==='assets')return await catalogPlanEntry('3.3.5');
    if(action==='example'){const form=button.closest('form');form.elements.payload.value=JSON.stringify(catalogApiExample(),null,2);return;}
    if(action==='export'&&detailCatalogSource?.version){
      button.disabled=true;
      const source=detailCatalogSource;
      const result=await api('/api/resources/'+encodeURIComponent(source.resource.id)+'/versions/'+encodeURIComponent(source.version.id)+'/normalized-export','POST',{});
      if(source===detailCatalogSource&&source.owner===window.workspaceUser.username&&button.isConnected)workDownload(result.filename,new Blob([result.content],{type:'application/x-ndjson;charset=utf-8'}));
    }
  }catch(err){notify(err.message,'error');}finally{button.disabled=false;}
});
