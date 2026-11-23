'use strict';

const workPages = {
  home:['工作台','home'], workflow:['全流程办理','steps'], research:['双相钢退火','book'], crystal:['碳化硅晶体生长','book'],
  resources:['训练资源目录','folder'], extraction:['知识抽取与核查','sheets'], generation:['数据生成与蒸馏','rows'],
  batches:['语料批次','rows'], 'batch-record':['批次详情','rows'],
  'pipeline-work':['语料制备管线','steps'], 'quality-work':['质量与一致性','shield'], 'benchmark-work':['基准设计与制备','target'],
  annotations:['领域 CoT 标注','steps'], benchmarks:['HITL 评测基准','target'],
  releases:['数据服务与发布','box'], runs:['训练支撑与增益','chart'], jobs:['加工任务','clock'],
  audit:['审计日志','shield'], accounts:['账号管理','user']
};
const workRoles = {admin:'管理员',operator:'数据管理员',annotator:'标注员',expert:'评审专家',lead:'评测负责人'};
const workStatuses = {
  registered:['已登记','neutral'],parsing:['解析中','blue'],parsed:['待核查','amber'],approved:['已核准','green'],
  queued:['已排队','neutral'],running:['运行中','blue'],completed:['已完成','green'],failed:['失败','red'],
  generated:['待质检','amber'],reviewed:['已质检','green'],candidate:['待处理','amber'],passed:['已通过','green'],rejected:['已剔除','red'],
  draft:['草稿','neutral'],submitted:['待复核','amber'],returned:['已退回','red'],reviewing:['专家评审中','blue'],
  published:['已发布','green'],open:['待受理','amber'],in_progress:['处理中','blue'],resolved:['已闭环','green'],
  pending:['待评审','amber'],conflict:['待仲裁','red'],accepted:['已审定','green']
};
const workIconPaths = {
  sheets:'<rect x="5" y="3" width="13" height="16" rx="1"/><path d="M9 7h5M9 11h5M2 7v15h13"/>',
  rows:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M10 10v10"/>',
  mark:'<path d="M12 2 3 7v10l9 5 9-5V7L12 2Z"/><path d="m3 7 9 5 9-5m-9 5v10M7.5 4.5l9 5v5"/>',
  home:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 11h18"/>',
  spark:'<path d="m10 3-2 5-5 2 5 2 2 5 2-5 5-2-5-2-2-5Zm8 10-1 3-3 1 3 1 1 3 1-3 3-1-3-1-1-3Z"/>',
  steps:'<rect x="8" y="3" width="8" height="5" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/><rect x="14" y="16" width="7" height="5" rx="1"/><path d="M12 8v4m-6 4v-4h12v4"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  box:'<path d="M4 7h16v14H4zM3 3h18v4H3zM9 12h6"/>',
  chart:'<path d="M3 3v18h18M7 17v-4m5 4V9m5 8V5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield:'<path d="m12 3-7 3v5c0 4 2.5 7.5 7 10 4.5-2.5 7-6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  user:'<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  file:'<path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', chevron:'<path d="m9 18 6-6-6-6"/>',
  refresh:'<path d="M19 9a7 7 0 1 0 .3 5M19 4v5h-5"/>', menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const wb = selector => document.querySelector(selector);
let workView = 0;
let workToast;
let workFilter = {query:'',split:'',status:''};
let workGenerationBatch = '';
window.workspaceUser = null;
window.workspacePage = platformRoute(location.hash.slice(1));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
function workIcon(name) {return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${workIconPaths[name] || workIconPaths.file}</svg>`;}
function statusBadge(status) {
  const [text,tone] = workStatuses[status] || [status,'neutral'];
  return `<span class="badge ${tone}">${escapeHtml(text || '未设置')}</span>`;
}
function sectionHead(kicker,title,desc,actions='') {
  return `<div class="section-head"><div>${kicker?`<div class="kicker">${escapeHtml(kicker)}</div>`:''}<h1>${escapeHtml(title)}</h1>${desc?`<p>${escapeHtml(desc)}</p>`:''}</div>${actions?`<div class="section-actions">${actions}</div>`:''}</div>`;
}
function workBtn(label,action,id='',tone='',glyph='') {
  return `<button class="btn ${tone}" type="button" data-action="${action}"${id?` data-id="${escapeHtml(id)}"`:''}>${glyph?workIcon(glyph):''}${escapeHtml(label)}</button>`;
}
function workSelect(values, selected='') {
  return values.map(([value,label])=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label)}</option>`).join('');
}
function workCan(...roles){return roles.includes(window.workspaceUser?.role);}
function workTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? escapeHtml(value) : new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short',hour12:false}).format(date);
}
function notify(text,tone='') {
  const toast = wb('#toast'); toast.textContent=text; toast.dataset.tone=tone; toast.hidden=false;
  clearTimeout(workToast); workToast=setTimeout(()=>{toast.hidden=true;},4800);
}
function openModal(title,html) {
  wb('#dialog-title').textContent=title; wb('#dialog-body').innerHTML=html;
  const dialog = wb('#workspace-dialog');
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop=0;
}
function closeModal() { const dialog=wb('#workspace-dialog'); if (dialog.open) dialog.close(); }
function downloadJson(name, data) {
  const raw = typeof data==='string' ? data : JSON.stringify(data,null,2);
  workDownload(name,new Blob([raw],{type:'application/json;charset=utf-8'}));
}
function workDownload(name,blob) {
  const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=name; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}
async function api(path,method='GET',data) {
  const options={method,credentials:'same-origin',cache:'no-store'};
  if (method!=='GET') {options.headers={'Content-Type':'application/json'};options.body=JSON.stringify(data??{});}
  let response;
  try {response=await fetch(path,options);} catch {throw new Error('工作台服务暂时无法连接。');}
  const result=await response.json();
  if (!response.ok) {
    const error=new Error(result.error || `请求失败（${response.status}）`);error.status=response.status;throw error;
  }
  return result;
}
function workPanel(title,body,action='',desc='') {
  return `<section class="panel"><div class="panel-head"><div><h2>${escapeHtml(title)}</h2>${desc?`<p>${escapeHtml(desc)}</p>`:''}</div>${action}</div>${body}</section>`;
}
function workEmpty(title,desc='') {return `<div class="empty"><strong>${escapeHtml(title)}</strong>${desc?`<p>${escapeHtml(desc)}</p>`:''}</div>`;}
function workTable(headers,rows) {return `<div class="table-wrap"><table><thead><tr>${headers.map(text=>`<th>${escapeHtml(text)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(cell=>`<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function workModalForm(name,body,submitLabel='保存') {return `<form class="stack" data-form="${name}">${body}<div class="actions">${workBtn('取消','dialog-close')}<button class="btn primary" type="submit">${escapeHtml(submitLabel)}</button></div></form>`;}
function workField(label,name,opts={}) {
  const {required=true,type='text',value='',placeholder='',max=160}=opts;
  return `<label class="field">${escapeHtml(label)}<input name="${name}" type="${type}" maxlength="${max}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"${required?' required':''}></label>`;
}
function workShell() { wb('#app').innerHTML=platformShell(); }
function workLogin(message='') {
  window.workspaceUser=null;
  wb('#app').innerHTML=`<main class="login-layout"><div class="login-hero"><div><h1>材料语料<br>全生命周期管理平台</h1></div></div><div class="login-form-wrap"><div class="login-form"><span class="brand-logo">${workIcon('mark')}</span><h2>登录业务工作台</h2>${message?`<p class="form-error">${escapeHtml(message)}</p>`:''}
  <form data-form="login" class="stack"><label class="field">账号<input name="username" autocomplete="username" required maxlength="32" placeholder="输入账号"></label><label class="field">密码<input name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="输入密码"></label><button type="submit" class="btn primary">登录</button></form><p class="login-hint">首次使用时，请在服务启动目录的运行数据中查看「初始账号.txt」。</p></div></div></main>`;
}
async function refresh() {
  if (!window.workspaceUser) return;
  const revision=++workView;
  const route=window.workspacePage;
  const views={home:renderWorkspaceHome,workflow:renderCaseTrail,research:renderResearchCase,crystal:renderResearchCase,resources:renderWorkResources, extraction:renderLuoshu, generation:renderProductionDesk, batches:renderProductionBatches, 'batch-record':renderProductionBatchRecord, annotations:renderAnnotations,
    'quality-work':renderQualityWork, 'pipeline-work':renderPipelineWork, 'benchmark-work':renderBenchmarkWork,
    benchmarks:renderBenchmarks, releases:renderServiceReleases,runs:renderServiceRuns,jobs:renderWorkJobs,audit:renderWorkAudit,accounts:renderWorkAccounts};
  try {
    const html=await views[route]();
    if (revision===workView && wb('#content')) platformMount(route,html);
  } catch(error) {
    if (revision!==workView) return;
    if (error.status===401) {
      closeModal();
      if (window.workspaceUser.meeting) workConnectionError('会议会话已结束，请重新打开工作台。');
      else workLogin('会话已过期，请重新登录。');
      return;
    }
    wb('#content').innerHTML=sectionHead('',workPages[route][0],error.message,workBtn('重试','refresh'));
  }
}
async function navigate(route) {
  route=platformRoute(route);
  if (!Object.hasOwn(workPages,route) || !window.workspaceUser) return;
  if ((route==='audit' && !workCan('lead','admin')) || (route==='accounts' && !workCan('admin'))) route='resources';
  window.workspacePage=route;
  if (location.hash!==`#${route}`) {
    const alias=['#luoshu',''].includes(location.hash);
    history[alias?'replaceState':'pushState'](null,'',`#${route}`);
  }
  closeModal(); workShell();
  window.scrollTo(0,0);
  await refresh();
  wb('#content')?.focus({preventScroll:true});
}
function collectWorkItems(data) {
  const allRecords=data;
  data=Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,Array.isArray(rows)?workScopeRows(rows,'inbox'):rows]));
  const ranks=new Map();
  const resources=new Map(allRecords.resources.map(r=>[r.id,r]));
  for(const records of Object.values(allRecords)) if(Array.isArray(records)) for(const r of records) {
    const source=resources.get(r.resourceId || r.handoff?.resourceId) || r;
    ranks.set(r.id,workCaseRank(source));
  }
  const entries = [];
  const operator = workCan('operator','lead','admin');
  const supervisor = workCan('lead','admin');
  const annotator = operator || workCan('annotator');
  const username = window.workspaceUser.username;
  const annotated = new Set(allRecords.annotations.map(record => record.sampleId));
  const add = (stage, name, id, date, label, action, target = id) => entries.push({stage,name,id,date,label,action,target});
  if (operator) {
    for (const resource of data.resources) {
      const labels = {registered:'发起解析',failed:'查看失败原因',parsed:'核查原文'};
      if (labels[resource.status]) add('资源核查',resource.title,resource.id,resource.updatedAt,labels[resource.status],'resource-open');
    }
    for (const batch of data.batches) {
      if (batch.status === 'generated') add('样本质检',batch.title,batch.id,batch.createdAt,'处理批次','home-batch');
    }
  }
  if (operator || workCan('expert')) {
    for (const task of data.extractions) {
      if (task.counts.pending) add('知识核查',task.title,task.id,task.updatedAt,'核查抽取结果','home-extraction');
      else if (operator && task.split==='train' && task.counts.approved && !task.batchId)
        add('语料生成',task.title,task.id,task.updatedAt,'生成知识问答','home-extraction');
    }
  }
  for (const sample of data.samples) {
    if (sample.status === 'passed' && !annotated.has(sample.id) && annotator) {
      add('思维链标注',sample.question,sample.id,sample.createdAt,'去标注','home-new-annotation');
    } else if (sample.status === 'candidate' && sample.quality?.eligible && sample.quality.requiresExpert && workCan('expert','lead','admin')) {
      add('样本质检',sample.question,sample.id,sample.createdAt,'复核样本','sample-open');
    }
  }
  for (const record of data.annotations) {
    if (annotator && record.author === username && ['draft','returned'].includes(record.status)) {
      add('思维链标注',record.question,record.id,record.updatedAt || record.createdAt,record.status==='returned'?'修订标注':'继续标注','home-annotation');
    } else if (record.status === 'submitted' && workCan('expert','lead','admin') && record.author !== username) {
      add('标注复核',record.question,record.id,record.updatedAt || record.createdAt,'复核标注','home-annotation');
    }
  }
  for (const record of data.benchmarks) {
    const items = record.items || [];
    let label = '';
    if (record.status === 'draft' && operator && (supervisor || record.owner === username)) label = '编制评测题';
    if (record.status === 'reviewing') {
      if (workCan('expert') && record.owner !== username && items.some(item => item.reviewState === 'pending' && !item.hasReviewed)) label = '独立评分';
      if (supervisor && record.owner !== username && items.some(item => item.reviewState === 'conflict')) label = '处理仲裁';
      if (supervisor && items.length && items.every(item => item.reviewState === 'accepted')) label = '发布基准';
    }
    if (label) add('基准评审',record.title,record.id,record.updatedAt || record.createdAt,label,'home-benchmark');
  }
  if (supervisor) {
    for (const release of data.releases.filter(item => item.status === 'draft')) {
      const ready = release.kind==='training'
        ? release.batchIds.every(id=>data.batches.some(b=>b.id===id && b.status==='reviewed' && b.counts.passed>0 && !b.counts.candidate))
        : data.benchmarks.some(b=>b.id===release.benchmarkId && b.status==='published');
      add('版本审批',release.title,release.id,release.createdAt,ready?'审批版本':'查看发布条件','home-release');
    }
  }
  if (operator) {
    for (const ticket of data.feedback) {
      if (ticket.status !== 'resolved' && (!ticket.assignee || ticket.assignee === username || supervisor)) {
        add('语料补充',ticket.title,ticket.id,ticket.updatedAt || ticket.createdAt,ticket.status==='open'?'受理工单':'登记处理结果','home-feedback');
      }
    }
  }
  return entries.sort((a,b) => (ranks.get(a.id)??2)-(ranks.get(b.id)??2) || (b.date||'').localeCompare(a.date||''));
}
let workCatalog=[];
let workSampleStatus='';
const workTemplateNames={'luoshu-knowledge':'已核准知识条目',auto:'自动识别',materials:'材料字段',text:'文本证据',compare:'定量比较与差值',facts:'字段与事实提取','teacher-import':'外部教师导入'};
function workResourceRows() { return catTable(); }
async function renderWorkResources() {
  workCatalog=workScopeRows(await api('/api/resources'),'catalog').slice().sort((a,b)=>workCaseRank(a)-workCaseRank(b));
  return catDesk();
}
function resourceCreateForm(){
  openModal('登记资源',workModalForm('resource-create',`<div class="gc-source-download"><button type="button" class="btn small" data-guide="practice-files">下载成套训练样例</button></div>${workField('资源标题','title')}
    <div class="grid-2">${workField('材料子类','category',{placeholder:'如 合金钢、氧化物陶瓷'})}${workField('资料来源','source',{placeholder:'如 供数单位、标准库'})}</div>
    ${guideClassificationFields()}<div class="grid-2"><label class="field">数据分区<select name="split"><option value="train">训练</option><option value="holdout">评测留出</option></select></label>${workField('权属或使用许可','license',{required:false,placeholder:'如 项目内科研使用'})}</div>
    <label class="field">接入方式<select id="work-input-mode" name="inputMode"><option value="file">上传原文件</option><option value="text">录入原文</option></select></label>
    <label class="field" id="work-file-field">原始文件<input name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv,.tsv,.jsonl,.png,.jpg,.jpeg" required><small>PDF、DOCX、文本、表格、PNG、JPEG · 最大 8 MiB</small></label>
    <label class="field" id="work-text-field" hidden>原文<textarea name="rawText" rows="6" maxlength="200000" disabled></textarea></label><label class="field">备注<textarea name="notes" rows="2" maxlength="1000"></textarea></label>`,'保存原文件'));
}
function resourceVersionForm(id){
  openModal('登记新文件版本',workModalForm('resource-version',`<input type="hidden" name="id" value="${escapeHtml(id)}"><label class="field">新版本文件<input name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv,.tsv,.jsonl,.png,.jpg,.jpeg" required><small>最大 8 MiB</small></label>`,'保存为新版本'));
}
async function resourceOpen(id,versionId='') {
  const resource=await api(`/api/resources/${id}`);
  const version=resource.versions.find(item=>item.id===(versionId||resource.activeVersion)) || (!versionId && resource.versions[0]);
  if(versionId&&!version)throw new Error('所选原文版本不存在，请重新选择。');
  if(version?.status==='parsing'&&version.jobId)workWatchJob(version.jobId);
  return catRenderResourceDetail(resource,version);
}
function resourceParseForm(value){
  const [id,versionId='']=value.split('|');
  openModal('发起文档解析',workModalForm('resource-parse',`<input type="hidden" name="id" value="${escapeHtml(id)}"><input type="hidden" name="versionId" value="${escapeHtml(versionId)}"><label class="field">解析模板<select name="template"><option value="auto">按文件格式自动选择</option><option value="materials">材料字段抽取</option><option value="text">文本证据提取</option></select></label>`,'提交解析任务'));
}
function resourceApproveForm(value){
  const [id,versionId]=value.split('|');
  openModal('确认原文核查',workModalForm('resource-approve',`<input type="hidden" name="id" value="${escapeHtml(id)}"><input type="hidden" name="versionId" value="${escapeHtml(versionId)}"><div class="kv"><span>待核准版本</span><strong class="mono">${escapeHtml(versionId)}</strong></div>${workField('核查意见','note',{required:false,max:500})}`,'核准选中版本'));
}

const qualityLabels={accuracy:'准确性',completeness:'完整性',consistency:'一致性',diversity:'多样性',format:'规范性',traceability:'可追溯性'};
const workflowWriters=['operator','lead','admin'];
async function batchForm(mode, selection='') {
  const [resourceId,versionId]=selection.split('|');
  const resources=await api('/api/resources');
  const eligible=workSourceChoices(resources,'production',selection.split('|')[0]).filter(resource=>resource.split==='train').flatMap(resource=>resource.versions.filter(version=>version.status==='approved').map(version=>[`${resource.id}|${version.id}`,`${resource.title} · v${version.number??version.id}`]));
  if (!eligible.length) { notify('请先在资源目录核准训练版本。','error'); return; }
  if(selection && !eligible.some(([key])=>key===selection))throw new Error('所选版本无法用于训练样本生成。');
  const isTeacher=mode==='teacher';
  openModal(isTeacher?'导入教师模型产物':'新建规则批次',workModalForm(isTeacher?'teacher-import':'batch-create',`${workField('批次名称','title',{max:120})}<label class="field">训练资源版本<select name="resource">${workSelect(eligible,`${resourceId}|${versionId}`)}</select></label>
    ${isTeacher?'<label class="field">外部教师 JSONL<input type="file" name="file" accept=".jsonl" required><small>必填字段：question、answer、blockIds。blockIds 须属于所选版本。</small></label>':'<label class="field">生成模板<select name="template"><option value="compare">定量比较与差值</option><option value="facts">字段与事实提取</option></select></label>'}
    <label class="field">候选上限<input name="maxCandidates" type="number" min="1" max="200" value="20" required></label><section class="distill-preview" aria-live="polite"></section>`,isTeacher?'导入候选样本':'提交生成任务'));
  attachBatchPreview(wb('#dialog-body form'),isTeacher);
}
function checkTeacherCandidates(text, blocks, limit) {
  const known=new Set(blocks.map(block=>block.id));
  const candidates=[];
  for (const [index,line] of text.split(/\r\n|\r|\n/).entries()) {
    if (!line.trim()) continue;
    const invalid=reason=>{throw new Error(`第 ${index+1} 行 · ${reason}`);};
    if (candidates.length>=limit) invalid('候选数超过批次上限');
    let item;
    try {item=JSON.parse(line);} catch {invalid('JSON 格式错误');}
    if (!item || Array.isArray(item) || typeof item!=='object' || Object.keys(item).length>80) invalid('需要含 1–80 个字段的对象');
    for (const [key,max] of [['question',400],['answer',2000]]) {
      if (typeof item[key]!=='string' || !item[key].trim() || Array.from(item[key].trim()).length>max) invalid(`${key} 须为 1–${max} 字的文本`);
    }
    const ids=item.blockIds;
    if (!Array.isArray(ids) || !ids.length || ids.length>12 || new Set(ids).size!==ids.length || ids.some(id=>!known.has(id))) invalid('blockIds 须包含当前版本内 1–12 个不同的证据块编号');
    if ('teacher' in item && (typeof item.teacher!=='string' || Array.from(item.teacher.trim()).length>160)) invalid('teacher 须为 160 字以内的文本');
    candidates.push(item);
  }
  if (!candidates.length) throw new Error('文件中没有候选记录');
  return candidates;
}

function attachBatchPreview(form,isTeacher) {
  const panel=form.querySelector('.distill-preview');
  const submit=form.querySelector('[type=submit]');
  const cache=new Map();
  let revision=0;
  async function update() {
    const current=++revision;
    submit.disabled=true;
    panel.textContent='正在读取源证据…';
    try {
      const [source,versionId]=form.elements.resource.value.split('|');
      if (!cache.has(source)) cache.set(source,api('/api/resources/'+encodeURIComponent(source)));
      const resource=await cache.get(source);
      if (current!==revision) return;
      const version=resource.versions.find(v=>v.id===versionId);
      const blocks=version?.blocks||[];
      if (!blocks.length) throw new Error('该版本没有可用的原文证据');
      let selected=blocks[0],candidate='',valid=true;
      if (isTeacher) {
        const file=form.elements.file.files[0];
        valid=Boolean(file);
        if (file) {
          if (!/\.jsonl$/i.test(file.name) || file.size>8*1024*1024) throw new Error('请选择 8 MiB 以内的 JSONL 文件');
          const raw=await file.arrayBuffer();
          if (current!==revision) return;
          const rows=checkTeacherCandidates(new TextDecoder('utf-8',{fatal:true}).decode(raw),blocks,Number(form.elements.maxCandidates.value));
          const first=rows[0];
          selected=blocks.find(block=>block.id===first.blockIds[0]);
          candidate=`<h4>候选预览 · 共 ${rows.length} 条</h4><p><strong>${escapeHtml(first.question)}</strong></p><p>${escapeHtml(first.answer)}</p><small>教师来源 · ${escapeHtml(first.teacher?.trim()||'外部教师输出')}</small>`;
        }
      } else {
        const rule=form.elements.template.value==='compare'?'比较两处记录中的同一测量指标，核对单位并计算绝对差值。':'从记录字段提取事实问答。无结构化字段时，使用原文段落生成摘录问答。';
        candidate=`<h4>候选生成规则</h4><p>${rule}</p>`;
      }
      panel.innerHTML=`<h4>源证据 · ${blocks.length} 个证据块</h4><small>${escapeHtml(selected.location)} · ${escapeHtml(selected.id)}</small><blockquote>${escapeHtml(selected.text)}</blockquote>${candidate}`;
      submit.disabled=!valid;
    } catch (error) {
      if (current===revision) panel.textContent=error.message;
    }
  }
  form.addEventListener('change',update);
  form.addEventListener('submit',event=>{if(submit.disabled){event.preventDefault();event.stopPropagation();}});
  update();
}

async function sampleOpen(id) {
  const sample=await api(`/api/samples/${id}`);
  const quality=sample.quality;
  const reviewerRoles=sample.mode==='teacher'?['expert','lead','admin']:workflowWriters;
  const canReview=Boolean(quality)&&!sample.review&&workCan(...reviewerRoles);
  let decisions=[];
  if (canReview) {
    if (quality.eligible) decisions.push(['pass', '通过复核']);
    const annotated=sample.status==='passed' && (await api('/api/annotations')).some(item=>item.sampleId===id);
    if (!annotated) decisions.push(['reject', '剔除']);
  }
  const issues=quality?.issues||[];
  openModal('样本与原文核查',`<div class="stack"><div class="split"><span class="mono muted">${escapeHtml(sample.id)}</span>${statusBadge(sample.status)}</div><div class="distill-review"><div class="document"><h3>问题</h3><p>${escapeHtml(sample.question)}</p><h3>答案</h3><p>${escapeHtml(sample.answer)}</p>${sample.teacher?`<p class="muted">教师信息 · ${escapeHtml(sample.teacher)}</p>`:''}${sample.review?`<p>人工复核 · ${sample.review.decision==='pass'?'通过':'剔除'} · ${escapeHtml(sample.review.by)} · ${workTime(sample.review.at)}</p><p>${escapeHtml(sample.review.note)}</p>`:''}</div>
    <section class="stack"><h3>原文证据</h3>${sample.evidence.map(block=>`<div class="document"><strong>${escapeHtml(block.location)}</strong><span class="mono muted"> ${escapeHtml(block.blockId)}</span><p>${escapeHtml(block.text)}</p></div>`).join('')}</section></div>
    ${quality?`<section class="panel"><div class="panel-head"><h3>规则质检</h3><strong>${quality.score} / 100</strong></div><div class="panel-body"><div class="quality-grid">${Object.entries(qualityLabels).map(([key,label])=>`<div><label>${label}<strong>${quality.dimensions[key]??(sample.review?'人工复核':'待专家复核')}</strong></label>${quality.dimensions[key]!=null?`<progress max="100" value="${quality.dimensions[key]}"></progress>`:''}</div>`).join('')}</div>${issues.length?`<ul class="distill-issues">${issues.map(issue=>`<li>${escapeHtml(issue)}</li>`).join('')}</ul>`:''}</div></section>`:''}
    ${sample.status==='passed'?'<div class="actions">'+workBtn('打开本样本标注','home-new-annotation',id,'primary','steps')+'</div>':''}
    ${decisions.length?workModalForm('sample-review',`<input type="hidden" name="id" value="${escapeHtml(id)}"><label class="field">审核决定<select name="decision">${workSelect(decisions)}</select></label>${workField('审核理由','note',{max:500})}`,'提交复核'):`<div class="actions">${workBtn('关闭','dialog-close')}</div>`}</div>`);
}
async function renderWorkJobs() {
  const jobs=await api('/api/jobs');
  return `${sectionHead('','加工任务','',workBtn('刷新任务','refresh','','primary','refresh'))}
  ${workPanel('任务记录',jobs.length?workTable(['任务','创建账号','执行次数','状态','时间','结果'],jobs.map(job=>[
    `<strong>${job.kind==='parse'?'解析与抽取':'候选语料生成'}</strong><small class="muted cell-note mono">${escapeHtml(job.id)}</small>`,escapeHtml(job.createdBy),job.attempts,statusBadge(job.status),workTime(job.finishedAt??job.startedAt??job.createdAt),escapeHtml(job.error??(job.status==='completed'?'已保存结果':'—'))
  ])):workEmpty('暂无加工任务'))}`;
}
async function renderWorkAudit() {
  const audit=await api('/api/audit');
  const translations={'job.completed':'任务完成','job.failed':'任务失败','release.created':'登记发布草稿','release.published':'冻结数据版本','release.delivered':'数据交付','training.registered':'登记外部训练','training.reported':'回填训练结果','account.created':'创建账号','account.login':'登录','account.password_changed':'修改密码'};
  return `${sectionHead('','审计日志','',workBtn('刷新日志','refresh'))}${workPanel('最近 100 条记录',audit.length?workTable(['时间','操作','业务对象','操作者','详情'],audit.map(item=>[workTime(item.at),escapeHtml(translations[item.action]??item.action),`<span class="mono">${escapeHtml(item.target)}</span>`,escapeHtml(item.actor),escapeHtml(item.detail)])):workEmpty('暂无记录'))}`;
}
async function renderWorkAccounts() {
  const accounts=await api('/api/users');
  return `${sectionHead('','账号管理','',workBtn('创建账号','account-create','','primary','plus'))}${workPanel('当前账号',workTable(['账号','显示名称','角色'],accounts.map(item=>[escapeHtml(item.username),escapeHtml(item.display),escapeHtml(workRoles[item.role])])) )}`;
}
async function workReadFile(file) {
  if (!file?.size) throw new Error('请选择非空文件。');
  if (file.size>8*1024*1024) throw new Error('单文件不能超过 8 MiB。');
  const contentBase64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(new Error('读取本地文件失败。'));reader.readAsDataURL(file);});
  return {filename:file.name,contentBase64};
}
const workWatchingJobs=new Set();
function workWatchJob(jobId) {
  if (!jobId || workWatchingJobs.has(jobId)) return;
  workWatchingJobs.add(jobId);
  const start=Date.now();
  const poll=async ()=>{
    if (!window.workspaceUser || Date.now()-start>90_000) {workWatchingJobs.delete(jobId);return;}
    try {
      const job=await api(`/api/jobs/${jobId}`);
      if (['queued','running'].includes(job.status)) {setTimeout(poll,700);return;}
      const detail=wb('#workspace-dialog[open] .cat-detail');
      if(detail?.dataset.parseJob===jobId){
        const {resourceId,versionId}=detail.dataset;
        const resource=await api('/api/resources/'+encodeURIComponent(resourceId));
        const version=resource.versions.find(v=>v.id===versionId);
        if(version&&detail.isConnected&&wb('#workspace-dialog').open) catRenderResourceDetail(resource,version);
      }
      if (!wb('#workspace-dialog').open && ['home','workflow','resources','generation','batches','batch-record','jobs'].includes(window.workspacePage)) await refresh();
      workWatchingJobs.delete(jobId);
      notify(job.error||'后台任务已完成。',job.error?'error':'');
    } catch {setTimeout(poll,1500);}
  };
  setTimeout(poll,500);
}
async function handleWorkAction(action,el) {
  const id=el.dataset.id;
  switch(action) {
    case 'home-batch': return openProductionBatch(id);
    case 'home-extraction': return openLuoshuTask(id);
    case 'home-feedback': return openFeedbackRecord(id);
    case 'work-extraction-create': return createLuoshuTask(id||'');
    case 'drawing-preview': return showDrawing(id);
    case 'drawing-line': return showDrawingLine(id);
    case 'home-annotation': return openAnnotationRecord(id);
    case 'home-new-annotation': {
      const sample=await api('/api/samples/'+encodeURIComponent(id));
      if(sample.status!=='passed')throw new Error('该样本尚未通过质检。');
      rememberCaseTrail(sample.resourceId,sample.versionId,id);
      return openNewSampleAnnotation(id);
    }
    case 'resource-case-trail': return openCaseTrail(...id.split('|'));
    case 'home-benchmark': return openBenchmarkRecord(id);
    case 'home-release': return openReleaseRecord(id);
    case 'home-run': return openRunRecord(id);
    case 'platform-search': return platformUtility('search');
    case 'platform-inbox': return platformUtility('inbox');
    case 'platform-tools': return platformUtility('tools');
    case 'work-connect': return connectWorkbench();
    case 'nav': return navigate(id);
    case 'refresh': return refresh();
    case 'dialog-close': return closeModal();
    case 'logout': await api('/api/logout','POST'); closeModal(); workLogin(); return;
    case 'password': return openModal('修改密码',workModalForm('password',`${workField('当前密码','current',{type:'password',max:128})}<label class="field">新密码<input type="password" name="password" autocomplete="new-password" minLength="12" maxLength="128" required><small>至少 12 个字符。</small></label>`,'保存新密码'));
    case 'account-create': return openModal('创建账号',workModalForm('account-create',`${workField('账号','username',{max:32})}${workField('显示名称','display',{max:60})}<label class="field">角色<select name="role">${workSelect(Object.entries(workRoles),'annotator')}</select></label>`,'生成初始密码'));
    case 'guide-open-version': return resourceOpen(...id.split('|'));
    case 'resource-create': return resourceCreateForm();
    case 'resource-open': return resourceOpen(...id.split('|'));
    case 'resource-version': return resourceVersionForm(id);
    case 'resource-parse': return resourceParseForm(id);
    case 'resource-pipeline': return openPipelineFromResource(...id.split('|'));
    case 'resource-approve': return resourceApproveForm(id);
    case 'resource-file': {
      const [resource,version]=id.split('|');
      const file=await api(`/api/resources/${resource}/versions/${version}/file`);
      const bytes=Uint8Array.from(atob(file.contentBase64),value=>value.charCodeAt(0));
      return workDownload(file.filename,new Blob([bytes]));
    }
    case 'batch-create': return batchForm('local',id);
    case 'teacher-import': return batchForm('teacher',id);
    case 'sample-open': return sampleOpen(id);
    case 'quality-inspect-finding': {
      [window.qualityWorkRunId, window.qualityWorkRowKey] = id.split('|');
      return navigate('quality-work');
    }
    case 'batch-quality-details': window.qualityWorkBatchId=id; return navigate('quality-work');
    case 'batch-quality': await api(`/api/batches/${id}/quality`,'POST'); notify('批次质检已完成。'); return refresh();
    case 'batch-export': {const file=await api(`/api/batches/${id}/export`);return downloadJson(file.filename,file.content);}
    default:
      if (action?.startsWith('ex-')) return expertUiAction(action,el);
      if (action==='ls-config' || action?.startsWith('tpl-')) return templateAction(action,el);
      if (action?.startsWith('ls-')) return handleLuoshuAction(action,el);
      if (action?.startsWith('svc-')) return serviceUiAction(action,el);
  }
}
async function handleWorkSubmit(form,submitter) {
  const name=form.dataset.form;
  const fields=new FormData(form);
  const payload=Object.fromEntries(fields);
  if (name==='login') {window.workspaceUser=await api('/api/login','POST',payload);return navigate(window.workspacePage);}
  if (name==='password') {await api('/api/password','POST',payload); closeModal(); return notify('密码已更新。');}
  if (name==='account-create') {
    const account=await api('/api/users','POST',payload);
    await refresh();
    return openModal('复制初始密码',`<div class="stack"><p>${escapeHtml(account.display)} · ${escapeHtml(account.username)}</p><pre>${escapeHtml(account.initialPassword)}</pre><p class="muted">此处仅显示一次。请将初始密码交给对应账号持有人。</p><div class="actions">${workBtn('完成','dialog-close','','primary')}</div></div>`);
  }
  if (['resource-create','resource-version'].includes(name)) {
    let upload;
    if (name==='resource-create' && payload.inputMode==='text') {
      if (!payload.rawText.trim()) throw Error('请录入原文。');
      const filename=payload.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_ -]/g,'').slice(0,70).trim() || '原文';
      upload=await workReadFile(new File([payload.rawText],filename+'.txt',{type:'text/plain;charset=utf-8'}));
    } else upload=await workReadFile(fields.get('file'));
    delete payload.file;delete payload.id;delete payload.inputMode;delete payload.rawText;
    const record=await api(name==='resource-create'?'/api/resources':`/api/resources/${fields.get('id')}/versions`,'POST',{...payload,...upload});
    if(record.split==='train')rememberCaseTrail(record.id,record.activeVersion);
    await navigate('resources');notify('原文件与版本已保存。');return resourceOpen(record.id,record.activeVersion);
  }
  if (name==='resource-parse') {
    const reply=await api(`/api/resources/${payload.id}/parse`,'POST',{template:payload.template,versionId:payload.versionId||undefined});
    const versionId=payload.versionId||reply.resource.activeVersion;
    await refresh();await resourceOpen(payload.id,versionId);notify('解析任务已进入队列。');
    return workWatchJob(reply.jobId);
  }
  if (name==='resource-approve') {
    await api(`/api/resources/${payload.id}/approve`,'POST',{note:payload.note,versionId:payload.versionId});
    closeModal();await refresh();notify('所选源版本已核准。');return resourceOpen(payload.id,payload.versionId);
  }
  if (['batch-create','teacher-import'].includes(name)) {
    const [resourceId,versionId]=payload.resource.split('|');
    const body={title:payload.title,resourceId,versionId,maxCandidates:Number(payload.maxCandidates)};
    if (name==='teacher-import') Object.assign(body,await workReadFile(fields.get('file')));else body.template=payload.template;
    const reply=await api(`/api/batches${name==='teacher-import'?'/teacher-import':''}`,'POST',body);
    await openProductionBatch(reply.batch.id);notify(reply.jobId?'生成任务已进入队列。':'教师产物已入待质检批次。');return workWatchJob(reply.jobId);
  }
  if (name==='sample-review') {
    await api(`/api/samples/${payload.id}/review`,'POST',{decision:payload.decision,note:payload.note});
    await refresh();await sampleOpen(payload.id);return notify('人工复核已保存。');
  }
  if (name.startsWith('ex-')) return expertUiSubmit(form,submitter);
  if (name.startsWith('tpl-')) return templateSubmit(form);
  if (name.startsWith('ls-')) return handleLuoshuSubmit(form,submitter);
  if (name.startsWith('svc-')) return serviceUiSubmit(form,submitter);
}

document.addEventListener('click',async event=>{
  const el=event.target.closest('button[data-action]');if (!el||el.disabled) return;
  try {el.disabled=true; await handleWorkAction(el.dataset.action,el);} catch(error){notify(error.message,'error');} finally{el.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if (!form.dataset.form) return;event.preventDefault();
  const submitter=event.submitter;
  try {if (submitter) submitter.disabled=true; await handleWorkSubmit(form,submitter);}
  catch(error) {if(form.dataset.form==='login') workLogin(error.message); else notify(error.message,'error');}
  finally {if(submitter) submitter.disabled=false;}
});
document.addEventListener('input',event=>{
  if (event.target.id==='work-resource-query') {workFilter.query=event.target.value;wb('#work-resource-rows').innerHTML=workResourceRows();}
});
document.addEventListener('change',async event=>{
  const el=event.target;
  try {
    if (el.id==='work-input-mode') {
      const textMode=el.value==='text', file=el.form.elements.file, raw=el.form.elements.rawText;
      wb('#work-file-field').hidden=textMode; wb('#work-text-field').hidden=!textMode;
      file.disabled=textMode; file.required=!textMode; raw.disabled=!textMode; raw.required=textMode;
      return;
    }
    if (el.id==='work-sample-status') {workSampleStatus=el.value; await refresh(); return;}
    if (el.id==='work-meeting-role' && window.workspaceUser?.meeting) {
      el.disabled=true;
      try {
        window.workspaceUser=await api('/api/meeting/role','POST',{username:el.value});
        await navigate(window.workspacePage);
      } finally {
        el.value=window.workspaceUser.username;
        el.disabled=false;
      }
      return;
    }
    if (el.id==='work-resource-split'||el.id==='work-resource-status') {workFilter[el.id==='work-resource-split'?'split':'status']=el.value;wb('#work-resource-rows').innerHTML=workResourceRows();}
    if (el.id==='work-resource-version-picker') await resourceOpen(el.dataset.resource,el.value);
  } catch(error) {notify(error.message,'error');}
});
window.addEventListener('hashchange',()=>navigate(platformRoute(location.hash.slice(1))));
function workConnectionError(message) {
  wb('#app').innerHTML=`<main class="content">${sectionHead('','工作台暂时无法连接',message,workBtn('重新连接','work-connect','','primary'))}</main>`;
}
async function connectWorkbench() {
  try {
    window.workspaceUser=await api('/api/session');
    await navigate(window.workspacePage);
  } catch(error) {
    if (error.status===401 && !window.workspaceUser?.meeting) workLogin();
    else workConnectionError(error.message);
  }
}
connectWorkbench();
