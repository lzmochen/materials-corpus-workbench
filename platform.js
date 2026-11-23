'use strict';

const workRoles = {operator:'数据管理员',annotator:'语料标注员',expert:'评审专家'};
const meetingExperts = {'expert-a':'专家甲','expert-b':'专家乙',lead:'专家丙','expert-d':'专家丁'};
let lastMeetingExpert = 'expert-a';


const platformModules = [
  {key:'resources', title:'训练资源目录构建与统一管理', label:'训练资源目录', icon:'archive', routes:['resources','jobs']},
  {key:'generation', title:'高质量训练数据生成与语料蒸馏', label:'数据生成与蒸馏', icon:'layers', routes:['generation','batches','batch-record','extraction','pipeline-work','quality-work','releases','runs','materials-tools']},
  {key:'annotations', title:'领域专业思维链（CoT）精细化标注', label:'CoT 精细标注', icon:'nodes', routes:['annotations']},
  {key:'benchmarks', title:'专家在环（HITL）大模型评测基准构建系统', label:'HITL 评测基准', icon:'score', routes:['benchmarks','benchmark-work','evaluation-desk']}
];
const platformIcons = {
  calendar:'<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7 3v5m10-5v5M4 11h16"/>',
  dashboard:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="14" y="3" width="7" height="8" rx="2"/><rect x="3" y="14" width="8" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  archive:'<path d="M3.5 7.5h17v12.7h-17zM2.5 4h19v3.5h-19zM9.2 11.2h5.6"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-8.8 9 8.8 5 8.8-5m-17.6 4.4 8.8 5 8.8-5"/>',
  nodes:'<rect x="8.5" y="2.5" width="7" height="5.5" rx="1"/><rect x="2" y="16" width="7" height="5.5" rx="1"/><rect x="15" y="16" width="7" height="5.5" rx="1"/><path d="M12 8v4H5.5v4M12 12h6.5v4"/>',
  score:'<path d="M5 3.5h14v17H5zM8.5 8h7M8.5 12h3m.7 4 2 1.8 3-4"/>',
  search:'<circle cx="10.4" cy="10.6" r="6.7"/><path d="m15.4 15.5 5.1 5"/>',
  inbox:'<path d="m5 4.5-3 11v4h20v-4l-3-11H5Zm-2 10h5l1.4 2h5.3l1.3-2h5"/>',
  tools:'<path d="M4 6h7m4 0h5M4 12h3m4 0h9M4 18h10m4 0h2"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  book:'<path d="M4 3.5h12a3 3 0 0 1 3 3v14H6.5a2.5 2.5 0 0 1-2.5-2.5V3.5Zm0 13h15M8 7h7M8 10h5"/>',
  person:'<circle cx="12" cy="8" r="3.4"/><path d="M5 20v-1a7 7 0 0 1 14 0v1"/>',
  pending:'<circle cx="12" cy="12" r="8.4"/><path d="M12 6.5V12l3.6 2"/>',
  clean:'<path d="m5 16 9-11a2 2 0 0 1 3-.2l3 3a2 2 0 0 1 .1 2.7L12 20H9l-4-4Zm4.5-5.5 6 5.5M13 20h8"/>',
  annotate:'<path d="M11 4H4v15h4m-1-11h4m-4 4h2m9-6 3 3m-10 9 2.8-.8L21 9.8a1.5 1.5 0 0 0 0-2.1L19.3 6a1.5 1.5 0 0 0-2.1 0L10 13.6 9 19z"/>',
  imageRegion:'<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4"/><rect x="6" y="6" width="12" height="12" rx="1.3"/><path d="m6.5 15 3.5-3 2 2 2.5-3 3 4"/><circle cx="9.4" cy="9.4" r=".8"/>',
  qa:'<path d="M3 4h12v8H9l-4 3v-3H3z"/><path d="M18 8h3v9h-3v3l-4-3h-4v-2"/>',
  versions:'<circle cx="7" cy="5" r="2.4"/><circle cx="7" cy="19" r="2.4"/><circle cx="18" cy="7" r="2.4"/><path d="M7 7.5v9m.5-2c3-5 10-1.2 10.5-5"/>',
  lineage:'<rect x="2.5" y="9" width="5" height="6" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/><path d="M7.5 12H12V5.5h4m-4 6.5v6.5h4"/>',
  publish:'<path d="M4 14v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
  trend:'<path d="M3 4v16h18M6 15l4.5-4.5 3.3 2.7L21 6m-5.8 0H21v5.8"/>',
  api:'<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
  monitor:'<rect x="2.5" y="4" width="19" height="13.5" rx="1.7"/><path d="M5 11h3l1.5-3 3.2 6.2 1.8-4.2H19M9 21h6m-3-3.5V21"/>',
  plug:'<path d="M8 3v5m7-5v5M5 8h13v3a6.5 6.5 0 0 1-13 0V8Zm6.5 9.5V21"/>',
  clipboard:'<rect x="5" y="5" width="14" height="16" rx="1.5"/><rect x="9" y="2.5" width="6" height="5" rx="1" fill="white"/><path d="M8 12h8m-8 4h5"/>',
  chip:'<rect x="5.5" y="5.5" width="13" height="13" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 3v2.5M15 3v2.5M9 18.5V21m6-2.5V21M3 9h2.5M3 15h2.5m13-6H21m-2.5 6H21"/>',
  crystal:'<path d="m4 9 4-5h8l4 5-8 12-8-12Zm0 0h16M8 4l2 5 2 12 2-12 2-5"/>',
  anneal:'<path d="M3 16h18v4H3zM7 13c-4-3 3-5 0-9m5 9c-4-3 3-5 0-10m5 10c-4-3 3-5 0-9"/>'
};
function platIcon(name, glyphs=platformIcons) {
  return `<svg class="p-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${glyphs[name] || platformIcons.book}</svg>`;
}
function featureIcon(name) {
  if (Object.hasOwn(platformIcons,name)) return platIcon(name);
  if (Object.hasOwn(materialToolGlyphs,name)) return platIcon(name,materialToolGlyphs);
  return platIcon(name,workIconPaths);
}
function platMark(){
  return '<img class="p-mark" src="/materials-corpus-workbench/workspace-mark.svg" alt="" width="40" height="40">';
}
function platformRoute(key) {
  if(!key) return 'home';
  if(key==='luoshu') return 'extraction';
  return Object.hasOwn(workPages,key) ? key : 'resources';
}
function platformModule(route){return platformModules.find(m=>m.routes.includes(route));}
function platformShell() {
  const user=window.workspaceUser, route=window.workspacePage;
  const chosen=platformModule(route);
  if (Object.hasOwn(meetingExperts,user.username)) lastMeetingExpert=user.username;
  const role=user.meeting?`<label class="p-role">${platIcon('person')}<select id="work-meeting-role" aria-label="当前岗位">${workSelect(Object.entries(workRoles),workRole(user.role))}</select></label>`:`<span class="p-user">${platIcon('person')}${escapeHtml(user.display)}</span>`;
  const routes=[{key:'home',label:'工作台',title:'工作台',icon:'dashboard'},...platformModules];
  return `<div class="app platform"><a href="#content" class="p-skip">跳至内容</a><header class="p-top"><div class="p-top-inner">
    <button type="button" class="p-brand" data-action="nav" data-id="home">${platMark()}<span>材料语料平台</span></button><span class="p-org">北京科技大学</span>
    <div class="p-utils"><button class="p-tool p-find" type="button" data-action="platform-search" aria-label="全站检索">${platIcon('search')}<span>全站检索</span><kbd>⌘ K</kbd></button>

    <button class="p-tool p-help" type="button" data-workspace-help aria-label="使用帮助">${platIcon('book')}<span>使用帮助</span></button><button class="p-tool" type="button" data-action="platform-inbox" aria-label="岗位待办">${platIcon('inbox')}<span>待办</span></button>
    <button class="p-tool p-settings" type="button" data-action="platform-tools" aria-label="业务工具" title="业务工具">${platIcon('tools')}</button>${role}</div></div></header>
    <nav class="p-nav" aria-label="业务导航"><div class="p-nav-inner">${routes.map(m=>{const active=chosen?.key===m.key || route===m.key || (['workflow','research','crystal','function-index'].includes(route) && m.key==='home');return `<button type="button" class="p-tab ${active?'active':''}" data-action="nav" data-id="${m.key}" title="${m.title}" ${active?'aria-current="page"':''}>${platIcon(m.icon)}<span>${m.label}</span></button>`;}).join('')}</div></nav>
    <main id="content" class="content p-content" tabindex="-1"><div class="initial-load" role="status">正在读取业务记录…</div></main></div>`;
}
const resourceStatePalette = [
  ['approved', '#005b94'], ['parsed', '#d99c44'], ['registered', '#8aa0b3'],
  ['parsing', '#8170af'], ['failed', '#bc5f53']
];

function platformResourceHead() {
  const total = workCatalog.length;
  const versions = workCatalog.reduce((n, resource) => n + (resource.versions?.length || 0), 0);
  const counts = new Map();
  for (const resource of workCatalog) counts.set(resource.status, (counts.get(resource.status) || 0) + 1);
  const groups = resourceStatePalette.map(([key, color]) => ({key, color, label:workStatuses[key][0], count:counts.get(key) || 0}));
  const other = total - groups.reduce((n, group) => n + group.count, 0);
  if (other) groups.push({key:'', label:'其他状态', color:'#768592', count:other});

  // Add hairline separators only between populated sectors. A single state forms a continuous ring.
  const sectors = groups.filter(group => group.count);
  let start = 0;
  const stops = sectors.flatMap(group => {
    const width = group.count / total * 360;
    const end = start + width;
    const gap = sectors.length > 1 ? Math.min(1.4, width / 7) : 0;
    const sector = group.color + ' ' + (start + gap / 2) + 'deg ' + (end - gap / 2) + 'deg';
    const colors = gap ? ['white ' + start + 'deg ' + (start + gap / 2) + 'deg', sector, 'white ' + (end - gap / 2) + 'deg ' + end + 'deg'] : [sector];
    start = end;
    return colors;
  });
  const background = stops.length ? 'conic-gradient(' + stops.join(',') + ')' : '#e0e6ea';
  const legend = groups.filter(group => group.count || (group.key && workFilter.status===group.key)).map(({key, color, label, count}) => {
    const pct = total ? Math.round(count / total * 1000) / 10 : 0;
    const content = `<span class="p-status-key"><i aria-hidden="true" style="--key:${color}"></i>${escapeHtml(label)}</span><b>${count}</b><span class="p-status-share">${pct}%</span>`;
    if (!key) return `<li class="p-status-entry">${content}</li>`;
    return `<li><button type="button" class="p-status-entry" data-resource-state="${key}" aria-pressed="${workFilter.status===key}" aria-label="筛选${escapeHtml(label)}，${count}份，占${pct}%" title="筛选${escapeHtml(label)}，再次点击恢复全部状态">${content}</button></li>`;
  }).join('');
  return `<header class="p-cover"><div class="p-cover-identity"><div class="p-page-title"><span class="p-page-symbol">${platIcon("archive")}</span><h1>${platformModules[0].label}</h1></div><span class="p-version-total">原文版本 <strong>${versions}</strong> 个</span></div>
    <section class="p-status-summary" aria-label="资源状态"><div class="p-status-ring" aria-label="资源总数 ${total} 份" style="--sectors:${background}"><div class="p-ring-center"><strong>${total}</strong></div></div>
    <div class="p-status-breakdown"><h2>资源状态</h2><ul class="p-status-legend">${legend}</ul></div></section></header>`;
}

document.addEventListener('click', event => {
  if(event.target.closest('.p-skip')) {
    event.preventDefault();
    document.getElementById('content')?.focus();
    return;
  }
  const row = event.target.closest('button[data-resource-state]');
  const menu = row && document.getElementById('work-resource-status');
  if (!menu) return;
  const state = row.dataset.resourceState;
  menu.value = menu.value === state ? '' : state;
  menu.dispatchEvent(new Event('change', {bubbles:true}));
});
document.addEventListener('change', event => {
  if (event.target.id !== 'work-resource-status') return;
  for (const row of document.querySelectorAll('button[data-resource-state]')) {
    row.setAttribute('aria-pressed', String(row.dataset.resourceState === event.target.value));
  }
});

function platformMount(route,html) {
  const root=wb('#content'), temp=document.createElement('template');temp.innerHTML=html;
  const old=temp.content.querySelector('.section-head');
  const user=window.workspaceUser;
  const expertDesk=workCan('expert') && ['annotations','benchmark-work','benchmarks','evaluation-desk','releases','quality-work','batch-record'].includes(route);
  const person=expertDesk && user.meeting ? '<label class="work-record-scope">经办专家<select id="work-meeting-expert" aria-label="当前经办专家">'+workSelect(Object.entries(meetingExperts),user.username)+'</select></label>' : '';
  const actions=person+(old?.querySelector('.section-actions')?.innerHTML||'');
  const mod=platformModule(route);
  let title=route==='accounts' && user.meeting ? '岗位成员' : workPages[route][0], secondary='';
  if(mod && route===mod.key) title=mod.label;
  const sections = mod?.key === 'benchmarks' ? [['benchmark-work','基准设计与制备'],['benchmarks','基准评审与发布'],['evaluation-desk','评测指标与增益']] : [];
  if(sections.length) {
    secondary=`<nav class="p-subnav" aria-label="${escapeHtml(mod.label)}业务导航">${sections.map(([id,label])=>`<button type="button" class="${id===route?'active':''}" data-action="nav" data-id="${id}" ${id===route?'aria-current="page"':''}>${label}</button>`).join('')}</nav>`;
  }
  old?.remove();
  const parent=mod?.key==='generation' && route!==mod.key ? `<button class="p-parent" type="button" data-action="nav" data-id="generation">${escapeHtml(mod.label)}</button><span class="p-slash">/</span>` : '';
  const icons={workflow:'nodes',research:'book',crystal:'book',audit:'score',accounts:'person',jobs:'inbox'};
  const symbol=platIcon(mod?.icon || icons[route] || 'book');
  const header=route==='home' ? '' : route==='resources' ? platformResourceHead() : `<header class="p-page-head"><div class="p-page-name">${parent}<div class="p-page-title"><span class="p-page-symbol">${symbol}</span><h1>${escapeHtml(title)}</h1></div></div><div class="section-actions">${actions}</div></header>`;
  root.dataset.route=route;
  const caseBack=caseChoice.resourceId && !['workflow','research','crystal','home','generation','jobs','accounts','audit'].includes(route)
    ? `<button class="ct-return" type="button" data-action="nav" data-id="workflow">${workIcon('chevron')}返回办理进度</button>` : '';
  root.innerHTML=caseBack+header+secondary;
  root.append(temp.content);
}
async function fetchPlatformRecords(){
  const routes={resources:'resources',extractions:'luoshu/extractions',batches:'batches',samples:'samples',annotations:'annotations',benchmarks:'benchmarks',releases:'releases',runs:'runs',feedback:'feedback'};
  const pairs=await Promise.all(Object.entries(routes).map(async([key,path])=>[key,await api('/api/'+path)]));
  return Object.fromEntries(pairs);
}
let utilityView=null,utilityVersion=0;
function utilityButton(action,id,title,meta,icon='book'){
  return `<button type="button" class="p-record" data-action="${action}" data-id="${escapeHtml(id)}"><span class="p-record-icon">${platIcon(icon)}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span>${platIcon('arrow')}</button>`;
}
function homeModuleActions(moduleKey,data,tasks=collectWorkItems(data,'home')) {
  const manager=workCan('operator');
  const button=(label,attrs)=>'<button type="button" '+attrs+'>'+escapeHtml(label)+'</button>';
  const firstTask=(stage,action)=>tasks.find(item=>item.stage===stage && (!action || item.action===action));
  const taskLink=(item,label)=>workBtn(label||item.label,item.action,item.target,'small');
  if(moduleKey==='resources'){
    if(manager)return workBtn('登记原文','resource-create','','small')+button('批量采集','data-intake-action="open"');
    return button('检索原文证据','data-catalog-evidence="open"')+workBtn('查看专题覆盖','home-coverage','','small');
  }
  if(moduleKey==='generation'){
    if(manager)return workBtn('抽取原文字段','work-extraction-create','','small')+button('新建制备任务','data-pd="new-pipe"');
    const check=firstTask('知识核查');
    return (check?taskLink(check,'核查抽取条目'):workBtn('查看抽取记录','nav','extraction','small'))+
      button('查看样本质量','data-pd="quality" data-id="samples"');
  }
  if(moduleKey==='annotations'){
    const ongoing=firstTask('标注复核')||firstTask('思维链标注','home-annotation');
    const start=firstTask('思维链标注','home-new-annotation');
    const records=workScopeRows(data.annotations,'home');
    const latest=records.filter(record=>!ongoing||record.id!==ongoing.target)
      .sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||''))[0];
    const links=[];
    if(ongoing)links.push(taskLink(ongoing));
    if(start)links.push(taskLink(start,'标注已通过样本'));
    if(links.length<2 && latest)links.push(workBtn('查看最近工单','home-annotation',latest.id,'small'));
    if(!links.length)links.push(button('查看样本质量','data-pd="quality" data-id="samples"'));
    return links.join('');
  }
  const links=[];
  // The review desk can open the specific question that still needs a score.
  const item=firstTask('基准评审');
  if(item){
    const record=data.benchmarks.find(b=>b.id===item.target);
    const question=record?.items?.find(q=>item.label==='处理仲裁'?q.canArbitrate:item.label==='独立评分'&&q.canReview);
    links.push(button(item.label,'data-action="home-benchmark" data-id="'+escapeHtml(item.target)+'"'+(question?' data-question-id="'+escapeHtml(question.id)+'"':'')));
  }
  links.push(button(workCan('expert')?'设计评测蓝图':'查看制备模板','data-bprep="open" data-id="template"'));
  if(!item && workCan('expert'))links.push(button('新建评测基准','data-action="ex-benchmark-new"'));
  if(!item && !workCan('expert')){
    const published=workScopeRows(data.benchmarks,'home').find(b=>b.status==='published');
    if(published)links.push(workBtn('查看冻结基准','home-benchmark',published.id,'small'));
  }
  return links.join('');
}
function platformSearchRows(q) {
  const query=q.toLocaleLowerCase().trim(), data=utilityView;
  const result=[];
  const keys=[['resources','资源','resource-open'],['extractions','抽取任务','home-extraction'],['batches','加工批次','home-batch'],['samples','问答样本','sample-open'],['annotations','标注工单','home-annotation'],['benchmarks','评测基准','home-benchmark'],['releases','数据版本','home-release'],['runs','训练实验','home-run']];
  for(const [key,category,action] of keys){
    for(const row of (query?data[key]:data[key].filter(r=>r.catalogTier!=='archived-practice'))){
      if(key==='resources' && row.split==='holdout' && workCan('annotator')) continue;
      const title=row.title||row.question||row.id;
      if(![title,row.id,category,row.category,row.source].some(v=>String(v||'').toLocaleLowerCase().includes(query))) continue;
      result.push(utilityButton(action,row.id,title,category+(row.catalogTier==='archived-practice'?' · 历史练习':'')+' · '+row.id));
    }
  }
  return result.length?`<div class="p-result-count">匹配 ${result.length} 条${result.length>35?' · 显示前 35 条':''}</div>`+result.slice(0,35).join(''):workEmpty('未找到匹配记录');
}
function platformFollowUp(stage,items) {
  if(stage || workScopeValue('inbox')==='practice') return '';
  const sources=new Map(utilityView.resources.map(row=>[row.id,row]));
  const pendingIds=new Set(items.map(row=>row.id));
  const records=utilityView.annotations.filter(a=>sources.get(a.resourceId)?.researchCase && a.status!=='approved' && !pendingIds.has(a.id));
  if(!records.length) return '';
  const labels={draft:'待标注人提交',returned:'待标注人修订',submitted:'待专家复核'};
  return '<details class="p-followup"><summary>科研协作进度（'+records.length+'）</summary>'+records.map(a=>
    utilityButton('home-annotation',a.id,sources.get(a.resourceId).title,labels[a.status]||a.status,'nodes')).join('')+'</details>';
}
function platformTaskRows(stage){
  const items=collectWorkItems(utilityView).filter(t=>!stage || t.stage===stage);
  const rows=items.map(t=>utilityButton(t.action,t.target,t.name,t.stage+' · '+t.label+' · '+t.id,'pending')).join('');
  return (rows||workEmpty('当前岗位暂无待办'))+platformFollowUp(stage,items);
}
async function platformUtility(type){
  const rev=++utilityVersion;
  if(type==='tools'){
    const items=[['jobs','加工队列'],...(workCan('operator')?[['audit','审计日志'],['accounts',window.workspaceUser.meeting?'岗位成员':'账号管理']]:[])];
    const sections=[
      ['业务办理', [['workflow','全流程办理']]],
      ['科研案例', [['crystal','碳化硅晶体生长'],['research','双相钢科研案例']]],
      ['运行管理', items]
    ];
    const groups=sections.map(([title,links])=>
      '<section><h3>'+title+'</h3><div class="row">'+links.map(([key,label])=>workBtn(label,'nav',key)).join('')+'</div></section>');
    if(!window.workspaceUser.meeting) groups.push('<section><h3>当前账号</h3><div class="row">'+workBtn('修改密码','password')+workBtn('退出账号','logout')+'</div></section>');
    openModal('业务工具','<div class="p-tool-groups">'+groups.join('')+'</div>');
    return;
  }
  openModal(type==='search'?'全站检索':'岗位待办','<div class="initial-load">正在读取记录…</div>');
  const data=await fetchPlatformRecords();
  if(rev!==utilityVersion || !wb('#workspace-dialog').open || !wb('#dialog-body .initial-load')) return;
  utilityView=data;
  if(type==='search'){
    openModal('全站检索',`<div class="p-search-box">${platIcon('search')}<input type="search" id="platform-search-input" placeholder="搜索名称、编号或材料门类" aria-label="检索业务记录"></div><div class="p-record-list" id="platform-results">${platformSearchRows('')}</div>`);
    wb('#platform-search-input').focus();
  }else{
    const stages=[...new Set(collectWorkItems(data).map(t=>t.stage))];
    openModal('岗位待办',`<div class="p-inbox-filter"><strong>${escapeHtml(window.workspaceUser.display)}</strong>${workScopeMenu('inbox')}<select id="platform-stage" aria-label="待办环节">${workSelect([['','全部环节'],...stages.map(s=>[s,s])])}</select></div><div class="p-record-list" id="platform-results">${platformTaskRows('')}</div>`);
  }
}
document.addEventListener('input',e=>{if(e.target.id==='platform-search-input') wb('#platform-results').innerHTML=platformSearchRows(e.target.value);});
document.addEventListener('change',e=>{if(e.target.id==='platform-stage') wb('#platform-results').innerHTML=platformTaskRows(e.target.value);});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&window.workspaceUser&&!wb('#workspace-dialog').open){e.preventDefault();platformUtility('search').catch(err=>notify(err.message,'error'));}});

document.addEventListener('click',event=>{
  if(!event.target.closest('[data-workspace-help]')) return;
  openModal('使用帮助',`<div class="stack public-help"><p>岗位可在右上角切换，操作记录保存在当前浏览器。</p>
    <div class="actions"><a class="btn primary" href="/materials-corpus-workbench/quickstart.pdf" target="_blank" rel="noopener">简明使用说明（PDF）</a><a class="btn" href="/materials-corpus-workbench/manual.pdf" target="_blank" rel="noopener">详细使用说明（PDF）</a><a class="btn" href="/materials-corpus-workbench/roles.pdf" target="_blank" rel="noopener">岗位权限清单（PDF）</a></div>
    <div class="actions"><a href="/materials-corpus-workbench/practice-files.zip" download="科研语料操作材料.zip">下载科研语料操作材料</a></div>
    <h3>操作视频</h3><div class="actions"><a class="btn primary" href="/materials-corpus-workbench/crystal-tutorial.html" target="_blank" rel="noopener">碳化硅晶体生长</a><a class="btn" href="/materials-corpus-workbench/research-tutorial.html" target="_blank" rel="noopener">双相钢文献科研案例</a></div></div>`);
});
