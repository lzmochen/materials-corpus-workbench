'use strict';
const lineageKinds={version:['资源版本','file'],extraction:['知识抽取','sheets'],batch:['训练批次','box'],sample:['训练样本','rows'],annotation:['思维链标注','steps'],question:['评测题项','target'],benchmark:['评审基准','shield']};
let lineageData=null,lineageFocus='',lineageQuery='',lineageRequest=0;
function lineageStatus(n){
  if(n.kind==='extraction')return ({pending:'待核查',reviewed:'已核查',generated:'已生成批次'})[n.status]||n.status;
  return workStatuses[n.status]?.[0]||n.status||'未登记';
}
async function openResourceLineage(resourceId,versionId){
  const token=++lineageRequest;
  if(!versionId){const r=await api('/api/resources/'+encodeURIComponent(resourceId));versionId=r.activeVersion;}
  const data=await api('/api/resources/'+encodeURIComponent(resourceId)+'/lineage/'+encodeURIComponent(versionId));
  if(token!==lineageRequest)return;
  lineageData=data;lineageFocus=versionId;lineageQuery='';
  openModal('关联记录',`<div class="lin-desk"><div class="lin-tools"><label>源文件版本<select id="lin-version">${workSelect(data.versions.map(v=>[v.id,'v'+v.number+' · '+v.filename]),versionId)}</select></label><label>查找节点<input type="search" id="lin-query" placeholder="名称、类型或编号"></label></div><div class="lin-grid"><div class="lin-scroll"><div id="lin-graph"></div></div><aside id="lin-info" aria-live="polite"></aside></div></div>`);
  lineageDraw();
}
function lineageDraw(){
  const graph=wb('#lin-graph');if(!graph||!lineageData)return;
  const {nodes,edges,versionId}=lineageData;
  const query=lineageQuery.trim().toLowerCase();
  const hits=new Set(nodes.filter(n=>[n.title,n.id,lineageKinds[n.kind][0]].join(' ').toLowerCase().includes(query)).map(n=>n.id));
  const shown=new Set(hits);
  for(let i=0;i<6;i++)for(const edge of edges)if(shown.has(edge.to))shown.add(edge.from);
  const visible=nodes.filter(n=>shown.has(n.id));
  if(!shown.has(lineageFocus))lineageFocus=visible.find(n=>hits.has(n.id))?.id||'';
  const lines=edges.filter(e=>shown.has(e.from)&&shown.has(e.to));
  const depths=new Map([[versionId,0]]);
  for(let i=0;i<6;i++)for(const edge of lines)depths.set(edge.to,Math.max(depths.get(edge.to)||0,(depths.get(edge.from)||0)+1));
  const cols=[];
  for(const node of visible){const d=depths.get(node.id)||0;(cols[d]??=[]).push(node);}
  const height=Math.max(1,...cols.map(col=>col.length))*84+12;
  const width=Math.max(1,cols.length)*184-20;
  const positions=new Map();
  cols.forEach((col,c)=>col.forEach((n,i)=>positions.set(n.id,[c*184+8,Math.floor((height-84*col.length)/2)+i*84+10])));
  const paths=lines.map(e=>{
    const [ax,ay]=positions.get(e.from),[bx,by]=positions.get(e.to),from=ax+145,to=bx,mid=(from+to)/2;
    return `<path d="M ${from} ${ay+28} C ${mid} ${ay+28}, ${mid} ${by+28}, ${to-4} ${by+28}" marker-end="url(#lin-arrow)" class="${[e.from,e.to].includes(lineageFocus)?'lin-on':''}"/>`;
  }).join('');
  graph.innerHTML=visible.length?`<div class="lin-map" style="width:${width}px;height:${height}px"><svg aria-hidden="true" width="${width}" height="${height}"><defs><marker id="lin-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6z" fill="#879fbd"/></marker></defs>${paths}</svg>${visible.map(n=>{
    const [x,y]=positions.get(n.id);
    return `<button type="button" class="lin-node lin-${n.kind}" style="left:${x}px;top:${y}px" data-lin-node="${escapeHtml(n.id)}" aria-pressed="${lineageFocus===n.id}" title="${escapeHtml(n.title)}"><small>${workIcon(lineageKinds[n.kind][1])}${lineageKinds[n.kind][0]}</small><strong>${escapeHtml(n.title)}</strong></button>`;
  }).join('')}</div>`:'<p class="lin-empty">未找到匹配节点</p>';
  const n=visible.find(n=>n.id===lineageFocus);
  wb('#lin-info').innerHTML=n?`<small>记录详情</small><h3>${escapeHtml(n.title)}</h3><dl>${[['记录类型',lineageKinds[n.kind][0]],['业务编号',n.id],['状态',lineageStatus(n)],['来源 / 说明',n.meta]].filter(p=>p[1]).map(([l,t])=>`<dt>${l}</dt><dd>${escapeHtml(t)}</dd>`).join('')}</dl><button class="btn primary small" type="button" data-lin-open="${escapeHtml(n.id)}">打开业务记录</button>`:'';
}
document.addEventListener('input',e=>{if(e.target.id==='lin-query'){lineageQuery=e.target.value;lineageDraw();}});
document.addEventListener('change',async e=>{if(e.target.id==='lin-version'){try{await openResourceLineage(lineageData.resourceId,e.target.value);}catch(err){openModal('关联记录',escapeHtml(err.message));}}});
document.addEventListener('click',async e=>{
  const button=e.target.closest('[data-cat-lineage],[data-lin-node],[data-lin-open]');if(!button)return;
  try{
    if(button.dataset.catLineage){await openResourceLineage(button.dataset.catLineage,button.dataset.version);return;}
    if(button.dataset.linNode){lineageFocus=button.dataset.linNode;lineageDraw();wb('#lin-graph').querySelector('button[aria-pressed="true"]')?.focus({preventScroll:true});return;}
    const n=lineageData.nodes.find(node=>node.id===button.dataset.linOpen);if(!n)return;
    closeModal();
    if(n.kind==='version')return await resourceOpen(n.ownerId,n.id);
    if(n.kind==='question'){exItemViews.set(n.ownerId,n.id);return await openBenchmarkRecord(n.ownerId);}
    const actions={extraction:'home-extraction',batch:'home-batch',sample:'sample-open',annotation:'home-annotation',benchmark:'home-benchmark'};
    await handleWorkAction(actions[n.kind],{dataset:{id:n.id}});
  }catch(err){openModal('关联记录',escapeHtml(err.message));}
});
