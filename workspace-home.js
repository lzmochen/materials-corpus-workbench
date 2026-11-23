'use strict';

const homeFamilyColors = ['#005b94','#4b8db4','#77aac8','#a8c2d3','#61778a','#d5dfe6'];
let homeData = null;
let homeFilter = {user:'', tab:'pending', stage:''};

function homeAssetLinks(data) {
  const counts = [data.resources,data.samples,data.annotations,data.benchmarks].map(rows=>rows.filter(r=>r.catalogTier!=='archived-practice').length);
  const units = ['份资源','条问答','份工单','套基准'];
  const links = ['打开目录','进入制备','查看工单','查看基准'];
  return platformModules.map((module, index) => `
    <button class="home-asset home-asset-${index}" type="button" data-action="nav" data-id="${module.key}" aria-label="${module.title}，${counts[index]}${units[index]}">
      <span class="asset-top"><span class="asset-icon">${platIcon(module.icon)}</span><strong>${module.label}</strong></span>
      <span class="asset-bottom"><span><b>${counts[index]}</b> ${units[index]}</span><span class="asset-go">${links[index]}</span></span>
    </button>`).join('');
}

function homeDistribution(resources) {
  const groups = new Map();
  for (const row of resources) {
    const family = guideFamily(row) || '待归类';
    groups.set(family, (groups.get(family) || 0) + 1);
  }
  const sorted = [...groups].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0],'zh'));
  let start = 0;
  const stops = sorted.map(([,count],i) => {
    const end = start + count / resources.length * 360;
    const color = homeFamilyColors[i % homeFamilyColors.length];
    const segment = sorted.length === 1 ? color+' 0deg 360deg' : color+' '+(start+.6)+'deg '+(end-.6)+'deg, white '+(end-.6)+'deg '+(end+.6)+'deg';
    start = end;
    return segment;
  });
  const arc = stops.length ? 'conic-gradient('+stops.join(',')+')' : '#e6edf3';
  const rows = sorted.map(([name,count],i) => `<li><button type="button" data-home-family="${escapeHtml(name)}" aria-label="查看${escapeHtml(name)}，${count}份资源"><i style="--family:${homeFamilyColors[i%homeFamilyColors.length]}"></i><span>${escapeHtml(name)}</span><b>${count}</b><small>${Math.round(count / resources.length * 100)}%</small></button></li>`).join('');
  return `<section class="home-panel home-distribution"><header class="home-panel-head"><h2>资源分布</h2><span>按材料门类</span></header>
    <div class="home-ring" style="background:${arc}" aria-label="共${resources.length}份资源"><div><b>${resources.length}</b><span>资源总数</span></div></div>
    ${rows ? '<ul class="home-family-list">'+rows+'</ul>' : '<p class="home-empty">暂无登记资源</p>'}</section>`;
}

function homeQueueContent(data) {
  if (homeFilter.tab === 'recent') {
    const recent = workScopeRows(data.resources,'home').filter(catAccessible).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||'')).slice(0,6);
    const rows = recent.map(row => `<tr><td class="home-entry"><button type="button" title="${escapeHtml(row.title)}" data-action="resource-open" data-id="${escapeHtml(row.id)}">${escapeHtml(row.title)}</button></td><td>${escapeHtml(guideFamily(row))}</td><td>${statusBadge(row.status)}</td></tr>`).join('');
    return rows ? '<div class="home-table-scroll"><table class="home-table"><thead><tr><th>资源名称</th><th>材料门类</th><th>当前状态</th></tr></thead><tbody>'+rows+'</tbody></table></div>' : '<p class="home-empty">暂无可查看的资源</p>';
  }
  const items=collectWorkItems(data,'home');
  const stages=[...new Set(items.map(item=>item.stage))];
  if (!stages.includes(homeFilter.stage)) homeFilter.stage='';
  const filtered=items.filter(item=>!homeFilter.stage || item.stage===homeFilter.stage);
  const rows=filtered.slice(0,6).map(item=>`<tr><td class="home-entry"><button type="button" title="${escapeHtml(item.name)}" data-action="${item.action}" data-id="${escapeHtml(item.target)}">${escapeHtml(item.name)}</button></td><td>${escapeHtml(item.stage)}</td><td><button class="home-row-action" type="button" data-action="${item.action}" data-id="${escapeHtml(item.target)}">${escapeHtml(item.label)}</button></td></tr>`).join('');
  return `<div class="home-queue-tools"><span>待办 <b>${filtered.length}</b> 项</span><select aria-label="按业务环节筛选待办" id="home-stage">${workSelect([['','全部环节'],...stages.map(s=>[s,s])],homeFilter.stage)}</select></div>`+
    (rows?'<div class="home-table-scroll"><table class="home-table"><thead><tr><th>事项名称</th><th>业务环节</th><th>办理</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="home-empty">当前岗位暂无待办事项</p>');
}

function homeListPanel(data) {
  return `<section class="home-panel home-queue"><header class="home-panel-head"><div class="home-switch" aria-label="工作记录">
    <button type="button" data-home-tab="pending" aria-pressed="${homeFilter.tab==='pending'}">我的待办</button>
    <button type="button" data-home-tab="recent" aria-pressed="${homeFilter.tab==='recent'}">最近更新</button></div>
    <button type="button" class="home-more" data-action="${homeFilter.tab==='recent'?'nav':'platform-inbox'}" data-id="resources">查看全部</button></header>
    <div id="home-list-body">${homeQueueContent(data)}</div></section>`;
}

async function renderWorkspaceHome() {
  const user = window.workspaceUser.username;
  const data = await fetchPlatformRecords();
  if (window.workspacePage !== 'home' || window.workspaceUser.username !== user) return '';
  if (homeFilter.user !== user) homeFilter = {user,tab:'pending',stage:''};
  homeData=data;
  const date=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Shanghai'}).format(new Date());
  return `<header class="home-title"><h1>工作台</h1><time>${platIcon('calendar')}${escapeHtml(date)}</time></header>
    <section class="home-panel home-business"><header class="home-panel-head"><h2>业务办理</h2></header><div class="home-assets">${homeAssetLinks(data)}</div></section>
    <div class="home-lower">${homeListPanel(data)}${homeDistribution(data.resources.filter(r=>r.catalogTier!=='archived-practice'))}</div>`;
}

document.addEventListener('click',event=>{
  const tab=event.target.closest('[data-home-tab]');
  if (tab && homeData) {
    homeFilter.tab=tab.dataset.homeTab;
    tab.closest('.home-queue').outerHTML=homeListPanel(homeData);
    document.querySelector('[data-home-tab][aria-pressed="true"]')?.focus({preventScroll:true});
    return;
  }
  const family=event.target.closest('[data-home-family]');
  if (family) catalogOpenFamily(family.dataset.homeFamily).catch(error=>notify(error.message,'error'));
});
document.addEventListener('change',event=>{
  if(event.target.id==='home-stage' && homeData) {
    homeFilter.stage=event.target.value;
    document.querySelector('#home-list-body').innerHTML=homeQueueContent(homeData);
    document.querySelector('#home-stage')?.focus({preventScroll:true});
  }
});
