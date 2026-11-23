'use strict';

const guideFamilies=['金属材料','无机非金属材料','高分子材料','复合材料'];
const guideTopics=['基础概念理解','标准技术规则识别','科学计算'];
const guideOrigins={public:'公开参考数据',synthetic:'合成样本',other:'其他来源'};
let guideTopic='', guideOrigin='';
const guideFamily=r=>r.materialFamily||r.category?.split('/')[0].trim()||'待归类';
const guideResourceTopic=r=>r.topic||'待归类';
const guideProvenance=r=>r.provenance||(['合成材料记录','合成试验数据'].includes(r.source)?'synthetic':'other');
const guideOptions=values=>values.map(name=>[name,name]);
const guideWritable=()=>workCan('operator','annotator');

function guideClassificationFields(r={}) {
  const field=(label,name,items,selected)=>`<label class="field">${label}<select name="${name}" required>${workSelect([['','请选择'],...guideOptions(items)],selected)}</select></label>`;
  return `<div class="grid-2">${field('材料门类','materialFamily',guideFamilies,guideFamily(r))}${field('语料专题','topic',guideTopics,r.topic)}</div>`;
}
function guideFilterMenus(){
  return `<select aria-label="语料专题筛选" data-guide-filter="topic">${workSelect([['','全部专题'],...guideOptions([...guideTopics,'待归类'])],guideTopic)}</select><select aria-label="来源类型" data-guide-filter="origin">${workSelect([['','全部来源'],...Object.entries(guideOrigins)],guideOrigin)}</select>`;
}
function guideSources(r) {
  const links=(r.sourceLinks||[]).filter(row=>/^https:\/\/(physics\.nist\.gov|cje\.ustb\.edu\.cn|snm\.usst\.edu\.cn|pubs\.acs\.org|www\.sciencedirect\.com)\//.test(row.url));
  return (r.notes?`<div class="gc-source-note"><strong>来源说明</strong><span>${escapeHtml(r.notes)}</span></div>`:'')+
    (links.length?`<div class="gc-sources">${links.map(x=>`<a href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.name||x.label||'文献')}${r.researchCase?'':' · 来源原表'} ↗</a>`).join('')}</div>`:'');
}
function guideCoverage() {
  const table=guideFamilies.map((f,i)=>`<tr><th scope="row">${f}</th>${guideTopics.map((t,j)=>{
    const rs=workCatalog.filter(r=>guideFamily(r)===f && guideResourceTopic(r)===t);
    const train=rs.filter(r=>r.split==='train').length;
    return `<td><button class="gc-cell" type="button" data-guide="focus" data-value="${i},${j}" aria-label="${f}，${t}，训练 ${train} 份，留出 ${rs.length-train} 份"><b>${train}</b> 训练 <span>· ${rs.length-train} 留出</span></button></td>`;
  }).join('')}</tr>`).join('');
  const pending=workCatalog.filter(r=>!r.topic).length;
  openModal('专题覆盖',`<div class="gc-coverage"><div class="gc-coverage-head"><h3>材料门类 × 语料专题</h3><span>按登记资源计数</span></div><div class="gc-scroll"><table><thead><tr><th>材料门类</th>${guideTopics.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table></div>${pending?`<button class="btn" data-guide="unclassified">查看待归类资源（${pending}）</button>`:''}</div>`);
}
async function guideClassify(id) {
  const r=await api('/api/resources/'+id);
  openModal('编辑分类',`<form class="stack" data-guide-form="classification" data-id="${escapeHtml(id)}" data-revision="${r.classificationRevision||0}"><h3>${escapeHtml(r.title)}</h3>${guideClassificationFields(r)}<div class="actions"><button class="btn primary">保存分类</button></div></form>`);
}
const guideKey=(r,v)=>r.id+'|'+v.id;
function guidePairOptions(rows){
  return rows.flatMap(r=>r.versions.map(v=>({r,v,key:guideKey(r,v)}))).filter(x=>x.r.split==='train');
}
async function guidePairLibrary(){
  const pairs=workScopeRows(await api('/api/multimodal-pairs'),'catalog');
  openModal('图文语料配对',`<div class="stack"><div class="gc-coverage-head"><h3>已配对样本 · ${pairs.length}</h3><div class="gc-catalog-actions"><button class="btn" data-guide="contrast">图文对比训练</button>${guideWritable()?'<button class="btn primary" data-guide="new-pair">新建配对</button>':''}</div></div>${pairs.length?`<form class="stack" data-guide-form="export"><div class="gc-pair-list">${pairs.map(p=>`<div class="gc-pair-row"><label><input type="checkbox" name="pair" value="${escapeHtml(p.id)}"><span><strong>${escapeHtml(p.caption)}</strong><small>${escapeHtml(p.image.title)} × ${escapeHtml(p.text.title)} · ${escapeHtml(p.evidence.location)}</small></span></label><button class="btn small" type="button" data-guide="view-pair" data-value="${escapeHtml(p.id)}">查看证据</button></div>`).join('')}</div><div class="actions"><button class="btn">导出所选图文包</button></div></form>`:workEmpty('尚未登记图文配对','选择训练分区的图像和原文证据，核对后可导出图像及配对清单。')}</div>`);
}
async function guideInspectPair(id){
  const pair=await api('/api/multimodal-pairs/'+id);
  const file=await api('/api/resources/'+pair.image.resourceId+'/versions/'+pair.image.versionId+'/file');
  const mime=/\.png$/i.test(file.filename)?'image/png':'image/jpeg';
  openModal('图文配对证据',`<div class="stack"><h3>${escapeHtml(pair.caption)}</h3><div class="gc-pair-grid"><section><strong>${escapeHtml(pair.image.title)}</strong><div class="gc-image"><img alt="${escapeHtml(file.filename)}" src="data:${mime};base64,${escapeHtml(file.contentBase64)}"></div></section><section><strong>${escapeHtml(pair.text.title)}</strong><span>${escapeHtml(pair.evidence.location)}</span><blockquote>${escapeHtml(pair.evidence.text)}</blockquote>${workBtn('查看原文版本','guide-open-version',pair.text.resourceId+'|'+pair.text.versionId)}</section></div><div class="actions"><button class="btn" data-guide="pairs">返回配对库</button></div></div>`);
}
function pairedDefault(img,docs,pairs){
  const prior=pairs.find(p=>p.image.versionId===img?.v.id);
  if(prior){
    const exact=docs.find(x=>x.v.id===prior.text.versionId);
    if(exact)return exact;
  }
  const match={'laminate-section-image':'laminate-concept','ceramic-pore-image':'ceramic-concept'};
  return docs.find(x=>Boolean(match[img?.r.seedKey])&&x.r.seedKey===match[img?.r.seedKey]);
}
async function guideNewPair(){
  const [resources,pairs]=await Promise.all([api('/api/resources'),api('/api/multimodal-pairs')]);
  const all=guidePairOptions(workSourceChoices(resources,'catalog'));
  const images=all.filter(x=>/\.(png|jpe?g)$/i.test(x.v.filename));
  const docs=all.filter(x=>x.v.status==='approved'&&!/\.(png|jpe?g)$/i.test(x.v.filename));
  if(!images.length||!docs.length){openModal('新建图文配对',workEmpty('缺少训练分区材料','需要一份图像原件，以及至少一份已核准的文本或表格。'));return;}
  const image=images.find(x=>x.r.seedKey==='laminate-section-image')||images[0];
  const opt=rows=>rows.map(x=>[x.key,x.r.title+' · v'+x.v.number]);
  openModal('新建图文配对',`<form class="stack" data-guide-form="pair"><div class="gc-pair-grid"><section><h3>图像原件</h3><label class="field">图像版本<select name="img">${workSelect(opt(images),image.key)}</select></label><div class="gc-image" data-guide-image></div></section><section><h3>文本或表格证据</h3><label class="field">文本版本<select name="doc" required>${workSelect([['','选择文本或表格版本'],...opt(docs)],pairedDefault(image,docs,pairs)?.key||'')}</select></label><label class="field">证据位置<select name="anchor" required></select></label><blockquote data-guide-quote></blockquote></section></div><label class="field">图文对应说明<textarea name="caption" required maxlength="1400" rows="3" placeholder="填写图中可见的标记或结构，以及原文记录的对应关系"></textarea></label><label class="gc-check"><input type="checkbox" required name="confirmed">已核对图像与引用证据</label><div class="actions"><button type="button" class="btn" data-guide="pairs">返回配对库</button><button class="btn primary">保存配对</button></div></form>`);
  const form=wb('[data-guide-form="pair"]');
  form.pairChoices={images,docs,pairs};
  await Promise.all([guideImage(form),guideEvidence(form)]);
}
async function guideImage(form){
  const value=form.elements.img.value, [id,version]=value.split('|'), box=form.querySelector('[data-guide-image]');
  form.elements.confirmed.checked=false;
  box.textContent='正在读取图像…';
  const file=await api('/api/resources/'+id+'/versions/'+version+'/file');
  if(!form.isConnected||form.elements.img.value!==value)return;
  const img=document.createElement('img');
  const mime=/\.png$/i.test(file.filename)?'image/png':'image/jpeg';
  img.alt=file.filename;img.src='data:'+mime+';base64,'+file.contentBase64;box.replaceChildren(img);
}
async function guideEvidence(form){
  const value=form.elements.doc.value, [id,version]=value.split('|');
  form.elements.confirmed.checked=false;
  form.elements.anchor.replaceChildren();form.quoteBlocks=[];
  if(!id){form.querySelector('[data-guide-quote]').textContent='请选择与图像对应的资料版本。';return;}
  form.querySelector('[data-guide-quote]').textContent='正在读取证据…';
  const doc=await api('/api/resources/'+id);
  if(!form.isConnected||form.elements.doc.value!==value)return;
  const blocks=doc.versions.find(v=>v.id===version)?.blocks||[];
  form.quoteBlocks=blocks;
  const imageVersion=form.elements.img.value.split('|')[1];
  const anchor=form.pairChoices.pairs.find(p=>p.image.versionId===imageVersion && p.text.versionId===version)?.evidence.blockId;
  const supported=anchor||((doc.seedKey==='laminate-concept')?blocks.find(b=>b.text.includes('单层厚度'))?.id:'');
  form.elements.anchor.innerHTML=workSelect(blocks.map(b=>[b.id,b.location+' · '+b.text.slice(0,26)]),supported);
  guideQuote(form);
}
function guideQuote(form){
  const block=(form.quoteBlocks||[]).find(b=>b.id===form.elements.anchor.value);
  form.querySelector('[data-guide-quote]').textContent=block?.text||'该版本没有可引用的证据。';
  form.elements.confirmed.checked=false;
}
document.addEventListener('change',async e=>{
  if(e.target.dataset.guideFilter){if(e.target.dataset.guideFilter==='topic')guideTopic=e.target.value;else guideOrigin=e.target.value;catUpdate();return;}
  const form=e.target.closest('[data-guide-form="pair"]');if(!form)return;
  try{
    if(e.target.name==='img'){
      const {images,docs,pairs}=form.pairChoices;
      const selected=images.find(x=>x.key===e.target.value);
      form.elements.doc.value=pairedDefault(selected,docs,pairs)?.key||'';
      await Promise.all([guideImage(form),guideEvidence(form)]);
    }
    if(e.target.name==='doc')await guideEvidence(form);
    if(e.target.name==='anchor')guideQuote(form);
  }catch(err){notify(err.message,'error');}
});
document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-guide]');if(!btn||btn.disabled)return;
  const action=btn.dataset.guide;
  try{
    if(action==='practice-files'){
      const file=await api('/api/training-practice-files');
      workDownload(file.filename,new Blob([Uint8Array.from(atob(file.contentBase64),c=>c.charCodeAt(0))],{type:'application/zip'}));
    }
    if(action==='coverage')guideCoverage();
    if(action==='classify')await guideClassify(btn.dataset.value);
    if(action==='pairs')await guidePairLibrary();
    if(action==='new-pair')await guideNewPair();
    if(action==='contrast')await guideContrastOpen(Array.from(document.querySelectorAll('[name="pair"]:checked'),el=>el.value));
    if(action==='view-pair')await guideInspectPair(btn.dataset.value);
    if(action==='focus'||action==='unclassified'){
      const [i,j]=(btn.dataset.value||'').split(',');
      catCategory=guideFamilies[i]||'';guideTopic=action==='focus'?guideTopics[j]:'待归类';guideOrigin='';
      workFilter.query='';workFilter.status='';workFilter.split='';
      closeModal();await refresh();wb('.cat-head h2')?.scrollIntoView({block:'nearest'});
    }
  }catch(err){notify(err.message,'error');}
});
document.addEventListener('submit',async e=>{
  const form=e.target,kind=form.dataset.guideForm;
  if(!kind)return;e.preventDefault();const btn=e.submitter;if(btn)btn.disabled=true;
  try{
    const fields=new FormData(form);
    if(kind==='classification'){
      const id=form.dataset.id;
      await api('/api/resources/'+id+'/classification','POST',{...Object.fromEntries(fields),revision:Number(form.dataset.revision)});
      await refresh();await resourceOpen(id);notify('分类已保存');
    }else if(kind==='pair'){
      const [imageResourceId,imageVersionId]=fields.get('img').split('|'),[textResourceId,textVersionId]=fields.get('doc').split('|');
      await api('/api/multimodal-pairs','POST',{imageResourceId,imageVersionId,textResourceId,textVersionId,blockId:fields.get('anchor'),caption:fields.get('caption'),confirmed:fields.has('confirmed')});
      await guidePairLibrary();notify('图文配对已保存');
    }else if(kind==='export'){
      if(!fields.getAll('pair').length)throw new Error('请至少选择一项图文配对');
      const result=await api('/api/multimodal-pairs/export','POST',{pairIds:fields.getAll('pair')});
      workDownload(result.filename,new Blob([Uint8Array.from(atob(result.contentBase64),x=>x.charCodeAt(0))],{type:'application/zip'}));
    }
  }catch(err){notify(err.message,'error');}finally{if(btn)btn.disabled=false;}
});

// Record scope applies to list views. Stable links still open the original record.
const workRecordScopes = new Map();
function workScopeKey(desk) { return (window.workspaceUser?.username || '') + '/' + desk; }
function workScopeValue(desk) { return workRecordScopes.get(workScopeKey(desk)) || 'active'; }
function workScopeRows(rows,desk) {
  const mode=workScopeValue(desk);
  if(mode==='all') return rows;
  return rows.filter(row=>(row.catalogTier==='archived-practice')===(mode==='practice'));
}
function workSourceChoices(rows,desk,selectedId) {
  const visible=workScopeRows(rows,desk);
  const kept=selectedId && rows.find(r=>r.id===selectedId);
  const choices=kept && !visible.includes(kept) ? [...visible,kept] : [...visible];
  return choices.sort((a,b)=>workCaseRank(a)-workCaseRank(b));
}
function workScopeMenu(desk) {
  return '<label class="work-record-scope"><span>记录范围</span><select aria-label="记录范围" data-work-record-scope="'+escapeHtml(desk)+'">'+workSelect([['active','当前业务'],['practice','历史练习'],['all','全部记录']],workScopeValue(desk))+'</select></label>';
}
function workCaseRank(resource) {
  const key=resource?.researchCase;
  const rank=key==='sic-solvent-growth-v1' ? 0 : key==='dual-phase-annealing-v1' ? 1 : 2;
  return rank+(key && resource.split==='holdout' ? 0.1 : 0);
}
function workSourceLabel(resource) {
  if(resource?.catalogTier==='archived-practice') return '历史练习';
  if(resource?.researchCase) return '科研文献';
  if(resource?.provenance==='public') return '公开参考';
  if(resource && guideProvenance(resource)==='synthetic') return '合成样本';
  return '';
}
document.addEventListener('change',async event=>{
  const select=event.target.closest('[data-work-record-scope]');
  if(!select)return;
  const desk=select.dataset.workRecordScope;
  workRecordScopes.set(workScopeKey(desk),select.value);
  if(select.closest('dialog')&&desk==='inbox') return platformUtility('inbox');
  await refresh();
  document.querySelector('[data-work-record-scope="'+desk+'"]')?.focus({preventScroll:true});
});
