'use strict';

const productionStages = [['prepare','语料制备'],['quality','质检与选样'],['delivery','发布与训练']];
const productionDesk = {stage:'prepare', prepareFilter:'', prepareRuns:[], opening:'', query:'', family:'', topic:'', status:'', page:0, batches:[]};

function productionControl(attrs, label, extra='') {
  return '<button type="button" class="pd-link '+extra+'" '+attrs+'>'+escapeHtml(label)+'</button>';
}
function productionRoute(route) {return 'data-action="nav" data-id="'+escapeHtml(route)+'"';}
function productionAction(name, id='') {return 'data-pd="'+escapeHtml(name)+'" data-id="'+escapeHtml(id)+'"';}
function productionTool(icon,title,scope,attrs) {
  return '<button type="button" class="pd-tool" '+attrs+'><span class="pd-symbol">'+workIcon(icon)+'</span><span class="pd-tool-copy"><strong>'+escapeHtml(title)+'</strong><small>'+escapeHtml(scope)+'</small></span></button>';
}
function productionName(text,attrs) {return productionControl(attrs,text,'pd-record-name');}
function productionPanel(title, side, body) {
  return '<section class="pd-panel"><div class="pd-panel-head"><h2>'+escapeHtml(title)+'</h2>'+side+'</div>'+body+'</section>';
}
function productionList(headers, rows, empty) {
  return rows.length ? workTable(headers,rows) : workEmpty(empty);
}
function productionUpdated(row) { return row.updatedAt || row.publishedAt || row.createdAt || row.at || ''; }
function productionRecent(records) {
  return workScopeRows(records,'production').slice().sort((a,b)=>workCaseRank(a)-workCaseRank(b) || productionUpdated(b).localeCompare(productionUpdated(a))).slice(0,5);
}
function productionQueue(runs) {
  const visible=workScopeRows(runs,'production');
  const stage=productionDesk.prepareFilter;
  const options=[['','全部'],['review','待核查'],['generation','可合成'],['quality','待质检']];
  const filters=options.map(([value,label])=>{
    const count=value?visible.filter(run=>run.state===value).length:visible.length;
    return '<button type="button" data-pd="queue-filter" data-id="'+value+'" aria-pressed="'+(stage===value)+'">'+label+' <b>'+count+'</b></button>';
  }).join('');
  const matches=visible.filter(row=>!stage||row.state===stage).sort((a,b)=>productionUpdated(b).localeCompare(productionUpdated(a)));
  const records=productionList(['任务名称','制备方式','当前状态','更新时间'],matches.slice(0,5).map(productionPipeRow),stage?'当前范围没有此状态的任务':'暂无制备任务');
  return productionPanel('最近制备任务',productionControl(productionAction('queue-all'),'全部任务'),
    '<div class="pd-queue-filters" role="group" aria-label="按制备进度筛选">'+filters+'</div>'+records);
}
function productionPipeRow(r) {
  return [productionName(r.title,productionAction('pipe',r.id)),escapeHtml(pipeRecipes[r.recipe] || r.recipe),pipeBadge(r.state),workTime(productionUpdated(r))];
}
function productionStageNav() {
  return '<nav class="pd-stages" aria-label="加工环节">'+productionStages.map(([key,label])=>
    '<button type="button" data-pd="stage" data-id="'+key+'" aria-pressed="'+(productionDesk.stage===key)+'">'+label+'</button>').join('')+'</nav>';
}
async function renderProductionDesk() {
  const restored=history.state?.productionStage;
  if(productionStages.some(([key])=>key===restored))productionDesk.stage=restored;
  const stage=productionDesk.stage, actor=window.workspaceUser.username;
  let tools,more='',desk;
  let actions=workBtn('全流程办理','nav','workflow');
  if (stage==='prepare') {
    const [data,resources,batches]=await Promise.all([api(pipeBase),api('/api/resources'),api('/api/batches')]);
    const sources=new Map(resources.map(r=>[r.id,r]));
    const sourceOfBatch=new Map(batches.map(r=>[r.id,r.resourceId]));
    const runs=data.runs.map(r=>({...r,researchCase:sources.get(r.resourceId || sourceOfBatch.get(r.id))?.researchCase}));
    if(pipeWriter()) actions+='<button type="button" class="btn primary" data-pd="new-pipe">'+workIcon('plus')+'新建制备任务</button>';
    tools=productionTool('steps','制备管线','从原文核查到问答合成',productionAction('pipes'))
      +productionTool('sheets','知识抽取与核查','提取材料、性能与工艺字段',productionAction('extract'))
      +productionTool('rows','语料批次','导入教师候选，审查训练问答',productionRoute('batches'));
    more='<details class="pd-more"><summary>辅助工具</summary><div>'
      +(lsWrite()?workBtn('模板管理','ls-config'):'')
      +productionControl('data-guide="pairs"','图文语料配对')+'</div></details>';
    if(window.workspacePage!=='generation'||window.workspaceUser?.username!==actor)return '';
    productionDesk.prepareRuns=runs;
    desk='<div id="pd-prepare-queue">'+productionQueue(runs)+'</div>';
  } else if (stage==='quality') {
    const [sets,quality,batches,resources]=await Promise.all(['/api/distillations','/api/quality-work','/api/batches','/api/resources'].map(path=>api(path)));
    tools=productionTool('shield','样本质量评价','逐条核对规则分和原文证据',productionAction('quality','samples'))
      +productionTool('sheets','跨源一致性','比对试样、单位和试验条件',productionAction('quality','cross'))
      +productionTool('rows','蒸馏选集','按质量门槛与材料覆盖选样','data-distill="library"');
    const entries=[
      ...quality.runs.map(r=>({title:r.title,kind:'跨源核查',at:r.at,amount:Object.values(r.counts||{}).reduce((sum,n)=>sum+n,0)+' 个对照项',attrs:productionAction('quality-run',r.id)})),
      ...sets.map(r=>({title:r.title,kind:'蒸馏选集',at:r.createdAt,amount:r.count+' 条入选',attrs:'data-distill="open" data-id="'+escapeHtml(r.id)+'"'})),
      ...batches.filter(r=>r.status==='reviewed').map(r=>({catalogTier:r.catalogTier,researchCase:resources.find(src=>src.id===r.resourceId)?.researchCase,title:r.title,kind:'样本质检',at:productionUpdated(r),amount:(r.counts?.passed||0)+' 条通过',attrs:'data-action="batch-quality-details" data-id="'+escapeHtml(r.id)+'"'}))
    ];
    desk=productionPanel('最近核查与选样记录','',productionList(['记录名称','类型','记录数量','建立时间'],
      productionRecent(entries).map(r=>[productionName(r.title,r.attrs),r.kind,escapeHtml(r.amount),workTime(r.at)]),'暂无样本质检、跨源核查或选样记录'));
  } else {
    const [versions,runs,feedback]=await Promise.all(['/api/releases','/api/runs','/api/feedback'].map(path=>api(path)));
    tools=productionTool('box','数据发布','冻结版本，登记交付与下载',productionRoute('releases'))
      +productionTool('chart','训练实验','登记训练配置，对比实测指标',productionRoute('runs'))
      +productionTool('target','评测问题回流','受理错题反馈，追踪补充任务',productionAction('feedback'));
    const entries=[
      ...versions.map(r=>({...r,kind:svcKind[r.kind],open:'home-release'})),
      ...runs.map(r=>({...r,kind:'训练实验',open:'home-run'})),
      ...feedback.map(r=>({...r,kind:'补充任务',open:'home-feedback'}))
    ];
    desk=productionPanel('最近交付与实验记录','',productionList(['记录名称','类型','状态','更新时间'],productionRecent(entries).map(r=>[
      productionName(r.title,'data-action="'+r.open+'" data-id="'+escapeHtml(r.id)+'"'),escapeHtml(r.kind),statusBadge(r.status),workTime(productionUpdated(r))
    ]),'暂无交付、训练实验或补充任务'));
    if (!entries.length) {
      const batches=await api('/api/batches');
      const ready=batches.filter(r=>r.status==='reviewed' && r.counts?.passed>0 && !r.counts?.candidate);
      desk=productionPanel('可编入训练集的批次',productionControl(productionRoute('batches'),'全部批次'),
        productionList(['批次名称','通过样本','生成方式','更新时间'],productionRecent(ready).map(r=>[
          productionName(r.title,productionAction('batch',r.id)),String(r.counts.passed)+' 条',escapeHtml(productionBatchMode(r)),workTime(productionUpdated(r))
        ]),'暂无完成质检并通过审核的批次'));
    }
  }
  return sectionHead('','数据生成与蒸馏','',actions)+'<div class="pd-desk"><section class="pd-panel"><div class="pd-stage-head">'+productionStageNav()+'<div class="research-queue-link">'+workScopeMenu('production')+more+'</div>'+'</div><div class="pd-tools">'+tools+'</div></section>'+desk+'</div>';
}

function productionBatchMode(row) {
  return row.extractionId?'核准知识问答':row.mode==='teacher'?'教师候选':'规则生成';
}
function productionPageFooter(total,page,size) {
  const pages=Math.max(1,Math.ceil(total/size));
  return '<div class="pd-pager"><span>'+total+' 个批次</span><div><button type="button" data-pd="page" data-id="-1" '+(page===0?'disabled':'')+'>上一页</button><span>'+(page+1)+' / '+pages+'</span><button type="button" data-pd="page" data-id="1" '+(page+1>=pages?'disabled':'')+'>下一页</button></div></div>';
}
function productionBatchRows() {
  const s=productionDesk, q=s.query.trim().toLocaleLowerCase();
  const rows=workScopeRows(s.batches,'production').filter(r=>(!s.family || r.family===s.family) && (!s.topic || r.topic===s.topic) && (!s.status || r.status===s.status)
    && (!q || [r.title,r.id,r.sourceTitle,r.family,r.modeLabel].some(x=>x.toLocaleLowerCase().includes(q))));
  const size=8;
  s.page=Math.max(0, Math.min(s.page,Math.ceil(rows.length/size)-1));
  const body=rows.slice(s.page*size,(s.page+1)*size).map(r=>[
    productionName(r.title,productionAction('batch',r.id)),escapeHtml(r.family),escapeHtml(r.modeLabel),String(r.counts?.passed || 0)+' / '+String(r.sampleIds?.length ?? Object.values(r.counts||{}).reduce((sum,n)=>sum+n,0)),statusBadge(r.status)
  ]);
  return productionList(['批次名称','材料门类','生成方式','通过 / 样本','状态'],body,'没有符合条件的批次')+productionPageFooter(rows.length,s.page,size);
}
function productionFilter(label,key,items) {
  return '<label><span>'+label+'</span><select data-pd-filter="'+key+'">'+workSelect([['','全部'],...items],productionDesk[key])+'</select></label>';
}
async function renderProductionBatches() {
  const [batches,resources]=await Promise.all([api('/api/batches'),api('/api/resources')]);
  const material=new Map(resources.map(r=>[r.id,r]));
  productionDesk.batches=batches.map(r=>{
    const src=material.get(r.resourceId)||{};
    return {...r,researchCase:src.researchCase, sourceTitle:src.title||'', family:guideFamily(src), topic:guideResourceTopic(src), modeLabel:productionBatchMode(r)};
  }).sort((a,b)=>workCaseRank(a)-workCaseRank(b) || productionUpdated(b).localeCompare(productionUpdated(a)));
  const actions=workCan(...workflowWriters) ? workBtn('导入教师候选','teacher-import')+workBtn('新建规则批次','batch-create','','primary','plus') : '';
  const families=[...new Set(productionDesk.batches.map(r=>r.family))];
  const topics=[...new Set(productionDesk.batches.map(r=>r.topic))];
  const states=[...new Set(batches.map(r=>r.status))].map(k=>[k,workStatuses[k]?.[0] || k]);
  const filters='<div class="pd-filters"><label class="pd-search"><span>查找批次</span><input type="search" data-pd-query aria-label="查找批次" placeholder="批次名称、原文或编号" value="'+escapeHtml(productionDesk.query)+'"></label>'
    +productionFilter('材料门类','family',families.map(x=>[x,x]))+productionFilter('语料专题','topic',topics.map(x=>[x,x]))+productionFilter('批次状态','status',states)+'</div>';
  return sectionHead('','语料批次','',actions)+'<div class="pd-desk">'+productionPanel('批次台账',workScopeMenu('production'),filters+'<div id="pd-batch-results">'+productionBatchRows()+'</div>')+'</div>';
}
async function openProductionBatch(id) {
  productionDesk.opening=id;workSampleStatus='';
  try { await navigate('batch-record'); }
  finally { if(productionDesk.opening===id)productionDesk.opening=''; }
}
function productionAnnotationAction(sample,annotation) {
  if(sample.status!=='passed') return sample.status==='rejected'?'已剔除':'待质检通过';
  if(!annotation) return workCan('operator','annotator','lead','admin')
    ? workBtn('开始标注','home-new-annotation',sample.id,'small') : '待建立标注工单';
  const owner=annotation.author===window.workspaceUser.username;
  let label='查看标注工单';
  if(owner && annotation.status==='draft') label='继续标注';
  if(owner && annotation.status==='returned') label='修订标注';
  if(!owner && annotation.status==='submitted' && workCan('expert','lead','admin')) label='复核标注';
  if(annotation.status==='approved') label='查看复核结果';
  return workBtn(label,'home-annotation',annotation.id,'small');
}
async function renderProductionBatchRecord() {
  const id=productionDesk.opening || history.state?.batchId;
  const back=workBtn('返回批次台账','nav','batches');
  if (!id) return sectionHead('','批次详情','',back)+workEmpty('请选择语料批次');
  if (history.state?.batchId!==id) history.replaceState({...history.state,batchId:id},'',location.href);
  workGenerationBatch=id;
  let batch;
  try {batch=await api('/api/batches/'+encodeURIComponent(id));}
  catch(error){if(error.status===404)return sectionHead('','批次详情','',back)+workEmpty('未找到该批次');throw error;}
  const [samples,r,annotations]=await Promise.all([api('/api/samples'),api('/api/resources/'+encodeURIComponent(batch.resourceId)),api('/api/annotations')]);
  const bySample=new Map(annotations.map(annotation=>[annotation.sampleId,annotation]));
  const v=r.versions.find(v=>v.id===batch.versionId);
  const rows=samples.filter(s=>s.batchId===id), passed=batch.counts?.passed||0;
  const canCheck=workCan(...workflowWriters) && ['generated','reviewed'].includes(batch.status) && !rows.some(s=>s.quality);
  const extra=(batch.extractionId?workBtn('查看知识核查记录','home-extraction',batch.extractionId,'small'):'')
    +(batch.jobId?workBtn('查看后台任务','nav','jobs','small'):'');
  const actions=(canCheck?workBtn('执行规则质检','batch-quality',id,'primary'):'')+(batch.status==='reviewed'?workBtn('查看质量评价','batch-quality-details',id):'')
    +(passed && workCan('operator','annotator','lead','admin')?workBtn('导出通过样本','batch-export',id):'');
  const source=productionName((r?.title||batch.resourceId)+(v?' · V'+v.number:''),'data-action="resource-open" data-id="'+escapeHtml(batch.resourceId+'|'+batch.versionId)+'"');
  const meta='<div class="pd-record-meta"><span>来源原文　'+source+'</span><span>'+escapeHtml(productionBatchMode(batch))+'</span>'+statusBadge(batch.status)+'</div>';
  const visible=rows.filter(s=>!workSampleStatus || s.status===workSampleStatus);
  const select='<label class="pd-inline-filter">样本状态<select id="work-sample-status">'+workSelect([['','全部'],['candidate','待处理'],['passed','已通过'],['rejected','已剔除']],workSampleStatus)+'</select></label>';
  const samplesTable=productionList(['问答样本','原文位置','规则分','状态','标注'],visible.map(s=>[
    productionName(s.question,'data-action="sample-open" data-id="'+escapeHtml(s.id)+'"'),escapeHtml(s.evidence[0]?.location||'—'),s.quality?.score??'—',statusBadge(s.status),productionAnnotationAction(s,bySample.get(s.id))
  ]),'当前范围暂无问答样本');
  const info='<details class="pd-disclosure"><summary>批次信息</summary><div class="pd-record-meta"><span>批次编号　'+escapeHtml(id)+'</span><span>原文版本　'+escapeHtml(batch.versionId)+'</span><span>生成模板　'+escapeHtml(workTemplateNames[batch.template]||batch.template)+'</span>'+extra+'</div></details>';
  return sectionHead('','批次详情','',back)+'<div class="pd-desk">'+productionPanel(batch.title,'',meta
    +(batch.error?'<p class="form-error">'+escapeHtml(batch.error)+'</p>':'')+'<div class="pd-actions">'+actions+'</div>'+info)
    +productionPanel('候选问答 · '+rows.length+' 条',select,samplesTable)+'</div>';
}
async function productionFeedback() {
  const records=await api('/api/feedback');
  openModal('评测问题回流',productionList(['补充任务','负责人','状态'],records.map(r=>[
    productionName(r.title,'data-action="home-feedback" data-id="'+escapeHtml(r.id)+'"'),escapeHtml(r.assignee||'未指派'),statusBadge(r.status)
  ]),'暂无语料补充任务'));
}
async function productionCommand(name,id) {
  switch (name) {
    case 'stage': productionDesk.stage=id;history.replaceState({...history.state,productionStage:id},'',location.href);return refresh();
    case 'queue-filter': {
      const panel=document.getElementById('pd-prepare-queue');
      if(!panel)return;
      productionDesk.prepareFilter=id;
      panel.innerHTML=productionQueue(productionDesk.prepareRuns);
      panel.querySelector('[aria-pressed="true"]')?.focus({preventScroll:true});
      return;
    }
    case 'queue-all': pipeUi.openTarget='';pipeUi.tab='';pipeUi.state=productionDesk.prepareFilter;return navigate('pipeline-work');
    case 'new-pipe':
      if(!pipeWriter()) return;
      await productionCommand('pipes');
      if(window.workspacePage==='pipeline-work' && wb('#content [data-pipe="create"]')) pipePreviewForm();
      return;
    case 'pipes': pipeUi.openTarget='';pipeUi.tab='';pipeUi.state='';return navigate('pipeline-work');
    case 'pipe': pipeUi.openTarget=id;pipeUi.tab='';pipeUi.state='';return navigate('pipeline-work');
    case 'extract': lsState.tab='tasks'; return navigate('extraction');
    case 'quality': window.qualityWorkTab=id;return navigate('quality-work');
    case 'quality-run': window.qualityWorkRunId=id;return navigate('quality-work');
    case 'feedback': return productionFeedback();
    case 'batch': return openProductionBatch(id);
    case 'page': productionDesk.page+=Number(id); document.getElementById('pd-batch-results').innerHTML=productionBatchRows();return;
  }
}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-pd]');
  if(!button || button.disabled)return;
  button.disabled=true;
  try {await productionCommand(button.dataset.pd,button.dataset.id || '');}
  catch(error){notify(error.message,'error');}
  finally{button.disabled=false;}
});
document.addEventListener('change',e=>{
  const key=e.target.dataset.pdFilter;
  if (!['family','topic','status'].includes(key))return;
  productionDesk[key]=e.target.value;productionDesk.page=0;
  document.getElementById('pd-batch-results').innerHTML=productionBatchRows();
});
document.addEventListener('input',e=>{
  if(!e.target.matches('[data-pd-query]'))return;
  productionDesk.query=e.target.value;productionDesk.page=0;
  document.getElementById('pd-batch-results').innerHTML=productionBatchRows();
});
