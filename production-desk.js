'use strict';

const productionStages = [['prepare','语料制备'],['quality','质检与选样'],['delivery','发布与训练']];
const productionDesk = {stage:'prepare', opening:'', query:'', family:'', topic:'', status:'', page:0, batches:[]};

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
const productionLedgerSize = 10;
let productionLedger = null;
let productionView = null;

function productionLedgerFilterRows() {
  const {query, state, kind} = productionView;
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return productionLedger.records.filter(row =>
    (!state || row.state === state) && (!kind || row.kind === kind) &&
    terms.every(term => row.searchText.includes(term)));
}

function productionLedgerResults() {
  const ledger=productionLedger, view=productionView;
  const rows=productionLedgerFilterRows();
  const pages=Math.max(1,Math.ceil(rows.length/productionLedgerSize));
  view.page=Math.max(0,Math.min(view.page,pages-1));
  const start=view.page*productionLedgerSize, end=Math.min(start+productionLedgerSize,rows.length);
  const body=rows.slice(start,end).map(row=>[
    productionName(row.title,row.attrs)+(row.source&&row.source!==row.title?'<span class="pd-origin">'+escapeHtml(row.source)+'</span>':''),
    escapeHtml(row.kind),row.result,workTime(row.at)
  ]);
  const filtered=Boolean(view.query||view.state||view.kind);
  const records=productionList(ledger.headers,body,filtered?'没有符合筛选条件的记录':ledger.empty);
  const reset=filtered&&!rows.length?'<div class="pd-reset">'+productionControl(productionAction('queue-clear'),'清除筛选')+'</div>':'';
  return records+reset+'<div class="pd-pager pd-ledger-pages"><span aria-live="polite">'+(rows.length?'显示 '+(start+1)+'–'+end+' 条，共 '+rows.length+' 条':'0 条记录')+'</span><div>'+
    '<button type="button" data-pd="queue-page" data-id="-1" '+(!view.page?'disabled':'')+'>上一页</button><span>'+ (view.page+1)+' / '+pages+'</span>'+
    '<button type="button" data-pd="queue-page" data-id="1" '+(view.page+1>=pages?'disabled':'')+'>下一页</button></div></div>';
}

function productionQueueFilters() {
  const states=productionLedger.states || [];
  if(!states.length) return '';
  return '<div class="pd-queue-filters" role="group" aria-label="按制备进度筛选">'+states.map(([id,label])=>{
    const count=id?productionLedger.records.filter(row=>row.state===id).length:productionLedger.records.length;
    return '<button type="button" '+productionAction('queue-filter',id)+' aria-pressed="'+(productionView.state===id)+'">'+escapeHtml(label)+' <b>'+count+'</b></button>';
  }).join('')+'</div>';
}

function productionLegend() {
  const counts=new Map();
  for(const row of productionLedger.records)counts.set(row.kind,(counts.get(row.kind)||0)+1);
  if(!counts.size)return '';
  const rows=[...counts.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh'));
  return '<section class="pd-panel pd-mix"><div class="pd-side-title"><h2>'+escapeHtml(productionLedger.distribution)+'</h2>'+
    (productionView.kind?productionControl(productionAction('queue-kind'),'清除筛选'):'')+'</div>'+
    '<div class="pd-mix-list">'+rows.map(([kind,total])=>{
      const pct=total*100/productionLedger.records.length;
      return '<button type="button" '+productionAction('queue-kind',kind)+' aria-pressed="'+(productionView.kind===kind)+'">'+
        '<span>'+escapeHtml(kind)+'</span><b>'+total+' <small>条</small></b><i><em style="width:'+pct.toFixed(2)+'%"></em></i></button>';
    }).join('')+'</div></section>';
}

function productionSyncLedger() {
  const root=document.querySelector('[data-pd-ledger]');
  if(!root||!productionLedger||!productionView)return;
  root.querySelector('[data-pd-rows]').innerHTML=productionLedgerResults();
  root.querySelector('[data-pd-states]').innerHTML=productionQueueFilters();
  root.querySelector('[data-pd-mix]').innerHTML=productionLegend();
  const query=root.querySelector('[data-pd-search]');
  if(query.value!==productionView.query)query.value=productionView.query;
  history.replaceState({...history.state,productionView},'');
}

function productionLedgerLayout(spec, tools, more) {
  const stage=productionDesk.stage,actor=window.workspaceUser.username,scope=workScopeValue('production');
  const saved=history.state?.productionView;
  productionView=saved?.actor===actor && saved.stage===stage && saved.scope===scope ? {...saved} :
    {stage,actor,scope,query:'',state:'',kind:'',page:0};
  const records=workScopeRows(spec.records,'production').sort((a,b)=>b.at.localeCompare(a.at));
  productionLedger={...spec,records:records.map(row=>({...row,
    searchText:[row.title,row.source,row.id,row.kind].filter(Boolean).join(' ').toLocaleLowerCase()
  }))};
  if(!records.some(row=>row.kind===productionView.kind))productionView.kind='';
  const query='<label class="pd-ledger-search">'+platIcon('search')+'<input type="search" data-pd-search aria-label="搜索记录名称、来源或编号" placeholder="搜索名称、来源或编号" value="'+escapeHtml(productionView.query)+'"></label>';
  const ledger='<section class="pd-panel pd-ledger"><header class="pd-panel-head"><h2 tabindex="-1">'+escapeHtml(spec.title)+'</h2>'+query+'</header>'+
    '<div data-pd-states>'+productionQueueFilters()+'</div><div data-pd-rows>'+productionLedgerResults()+'</div></section>';
  const side='<aside class="pd-sidebar"><section class="pd-panel pd-services"><div class="pd-side-title"><h2>'+escapeHtml(spec.toolsTitle)+'</h2>'+more+'</div><div class="pd-tools">'+tools+'</div></section>'+
    '<div data-pd-mix>'+productionLegend()+'</div></aside>';
  return '<div class="pd-desk pd-workspace" data-pd-ledger><section class="pd-stage-head">'+productionStageNav()+workScopeMenu('production')+
    '</section><div class="pd-stage-body">'+ledger+side+'</div></div>';
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
  let tools, more='', spec;
  let actions=workBtn('全流程办理','nav','workflow');
  if (stage==='prepare') {
    const data=await api(pipeBase);
    actions+=workBtn('文献与分子工具','nav','materials-tools');
    if(pipeWriter()) actions+='<button type="button" class="btn primary" data-pd="new-pipe">'+workIcon('plus')+'新建制备任务</button>';
    tools=productionTool('steps','制备管线','核查原文、合成问答',productionAction('pipes'))
      +productionTool('sheets','知识抽取与核查','提取材料、性能与工艺字段',productionAction('extract'))
      +productionTool('rows','语料批次','审核问答、移交标注',productionRoute('batches'))
      +productionTool('steps','加工工作流编排','按原文类型选择加工路径',planProcessingAttr('workflow'));
    more='<details class="pd-more"><summary>辅助工具</summary><div>'
      +(lsWrite()?workBtn('模板管理','ls-config'):'')
      +productionControl('data-guide="pairs"','图文语料配对')+productionControl(planProcessingAttr('image'),'多模态证据标注')+'</div></details>';
    spec={title:'制备任务',toolsTitle:'制备工具',distribution:'制备方式分布',empty:'当前范围暂无制备任务',
      headers:['任务与来源','制备方式','当前状态','更新时间'],
      states:[['','全部'],['review','待核查'],['generation','可合成'],['quality','待质检'],['finished','已质检']],
      records:data.runs.map(r=>({...r,at:productionUpdated(r),source:r.sourceTitle,kind:pipeRecipes[r.recipe]||r.recipe,
        result:pipeBadge(r.state),attrs:productionAction('pipe',r.id)}))};
  } else if (stage==='quality') {
    const [sets,quality,batches]=await Promise.all(['/api/distillations','/api/quality-work','/api/batches'].map(path=>api(path)));
    tools=productionTool('shield','样本质量评价','逐条核对规则分和原文证据',productionAction('quality','samples'))
      +productionTool('sheets','跨源一致性','比对试样、单位和试验条件',productionAction('quality','cross'))
      +productionTool('rows','蒸馏选集','查看已保存的训练选样','data-distill="library"')
      +productionTool('filter','去重与粗筛','设置规则分、去重与数量上限',planProcessingAttr('filter'))
      +productionTool('box','专题语料组织','按材料、任务和模态组合样本',planProcessingAttr('topics'));
    const records=[
      ...quality.runs.map(r=>({...r,kind:'跨源核查',at:productionUpdated(r),result:Object.values(r.counts||{}).reduce((sum,n)=>sum+n,0)+' 个对照项',attrs:productionAction('quality-run',r.id)})),
      ...sets.map(r=>({...r,kind:'蒸馏选集',at:productionUpdated(r),result:r.count+' 条入选',attrs:'data-distill="open" data-id="'+escapeHtml(r.id)+'"'})),
      ...batches.filter(r=>r.status==='reviewed').map(r=>({...r,kind:'样本质检',at:productionUpdated(r),result:(r.counts?.passed||0)+' 条通过',attrs:'data-action="batch-quality-details" data-id="'+escapeHtml(r.id)+'"'}))
    ];
    spec={title:'核查与选样记录',toolsTitle:'质检与选样工具',distribution:'核查与选样分布',empty:'暂无样本质检、跨源核查或选样记录',headers:['记录名称','业务类型','核查与选样结果','更新时间'],records};
  } else {
    const [versions,runs,feedback]=await Promise.all(['/api/releases','/api/runs','/api/feedback'].map(path=>api(path)));
    tools=productionTool('box','数据发布','冻结版本，登记交付与下载',productionRoute('releases'))
      +productionTool('chart','训练实验','登记训练配置，对比实测指标',productionRoute('runs'))
      +productionTool('target','评测问题回流','受理错题反馈，追踪补充任务',productionAction('feedback'));
    if(svcWriter())more='<details class="pd-more"><summary>课题二对接</summary><div>'+workBtn('数据集编排与读取','svc-supply-views')+workBtn('模型服务联调','svc-supply-models')+workBtn('服务监控与审计','svc-supply-monitor')+'</div></details>';
    const records=[
      ...versions.map(r=>({...r,kind:svcKind[r.kind]||r.kind,open:'home-release'})),
      ...runs.map(r=>({...r,kind:'训练实验',open:'home-run'})),
      ...feedback.map(r=>({...r,kind:'补充任务',open:'home-feedback'}))
    ].map(r=>({...r,at:productionUpdated(r),result:statusBadge(r.status),attrs:'data-action="'+r.open+'" data-id="'+escapeHtml(r.id)+'"'}));
    spec={title:'交付与实验记录',toolsTitle:'交付与训练工具',distribution:'交付与实验分布',empty:'暂无交付、训练实验或补充任务',headers:['记录名称','业务类型','当前状态','更新时间'],records};
    if (!workScopeRows(records,'production').length) {
      const batches=await api('/api/batches');
      const ready=batches.filter(r=>r.status==='reviewed' && r.counts?.passed>0 && !r.counts?.candidate);
      spec={...spec,title:'可编入训练集的批次',distribution:'批次生成方式',empty:'暂无已完成质检并可交付的批次',headers:['批次名称','生成方式','通过样本','更新时间'],
        records:ready.map(r=>({...r,kind:productionBatchMode(r),at:productionUpdated(r),result:String(r.counts.passed)+' 条',attrs:productionAction('batch',r.id)}))};
    }
  }
  if(window.workspacePage!=='generation'||window.workspaceUser?.username!==actor||productionDesk.stage!==stage)return '';
  return sectionHead('','数据生成与蒸馏','',actions)+productionLedgerLayout(spec,tools,more);
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
    case 'queue-filter':
    case 'queue-kind':
    case 'queue-page':
    case 'queue-clear': {
      if(!productionView||!document.querySelector('[data-pd-ledger]'))return;
      if(name==='queue-page')productionView.page+=Number(id);
      else {
        productionView.page=0;
        if(name==='queue-filter')productionView.state=id;
        if(name==='queue-kind')productionView.kind=productionView.kind===id?'':id;
        if(name==='queue-clear')Object.assign(productionView,{query:'',kind:'',state:''});
      }
      productionSyncLedger();
      if(name==='queue-page'){
        const heading=document.querySelector('.pd-ledger h2');
        heading.focus({preventScroll:true});
        heading.scrollIntoView({block:'start'});
        return;
      }
      const next=Array.from(document.querySelectorAll('button[data-pd]')).find(b=>
        b.dataset.pd===name&&b.dataset.id===id&&!b.disabled);
      (next||document.querySelector('[data-pd-search]'))?.focus({preventScroll:true});
      return;
    }
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
  if(e.target.matches('[data-pd-search]')&&productionView){
    productionView.query=e.target.value;
    productionView.page=0;
    productionSyncLedger();
    return;
  }
  if(!e.target.matches('[data-pd-query]'))return;
  productionDesk.query=e.target.value;productionDesk.page=0;
  document.getElementById('pd-batch-results').innerHTML=productionBatchRows();
});
