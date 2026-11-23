'use strict';

const metricProfilesPath = '/api/evaluation-profiles';

function profileButton(label, action, key='', primary=false, revision='') {
  return '<button type="button" class="btn '+(primary?'primary':'')+'" data-metric-action="'+action+'" data-id="'+escapeHtml(key)+'" data-revision="'+escapeHtml(revision)+'">'+label+'</button>';
}
function profileName(p) { return p.title+' · V'+p.version; }
function metricWeights(p, domains) {
  return '<dl class="met-weights">'+domains.map(d=>'<div><dt>'+escapeHtml(d)+'</dt><dd>'+p.weights[d]+'%</dd></div>').join('')+'</dl>';
}
async function renderEvaluationDesk() {
  const [library,runs] = await Promise.all([api(metricProfilesPath),api('/api/runs')]);
  const profiles=library.profiles;
  const rows=profiles.map(p=>[escapeHtml(profileName(p)),escapeHtml(p.status==='published'?'已发布':'待审批'),
    escapeHtml(p.reason),escapeHtml(reviewOwner(p.createdBy)),profileButton('查看口径','open',p.id)]);
  const paired=workScopeRows(runs,'runs').filter(r=>r.baselineId);
  const gain=paired.map(r=>[escapeHtml(r.title),escapeHtml(r.model),escapeHtml(r.externalId),
    Object.keys(r.deltas||{}).length ? Object.entries(r.deltas).map(([k,v])=>escapeHtml(k)+' '+svcMetricText(v,true)).join('，'):'待回传可比指标',
    workBtn('核对基线','svc-run-view',r.id,'small')]);
  const create=svcWriter()?profileButton('新建指标方案','new','PROFILE-MATERIALS-V1',true):'';
  return sectionHead('','评测指标与训练增益','') +
    workPanel('评测指标版本',workTable(['指标方案','状态','适用范围及修订说明','编制人','操作'],rows),create)+
    '<div id="met-training-gain">'+workPanel('训练增量分析',gain.length?workTable(['对照实验','底座模型','外部任务号','指标增量','操作'],gain):
      workEmpty('暂无当前业务的对照实验','在训练任务中选择已完成的基线，保持底座、参数及评测版本一致。两个任务回传同名指标后显示差值。'),workBtn('训练任务台账','nav','runs'))+'</div>'+
    '<div class="met-related">'+workBtn('查看语料六维质量','nav','quality-work')+workBtn('查看基准评测任务','nav','benchmarks')+'</div>';
}

async function metricProfileView(key, editing=false) {
  const data=await api(metricProfilesPath);
  const p=data.profiles.find(p=>p.id===key);
  if(!p) throw new Error('当前岗位无法查看该指标版本');
  if(editing) {
    if(!svcWriter()) throw new Error('当前岗位无权编制指标版本');
    const editingDraft=p.status==='draft';
    const weights=data.domains.map((d,i)=>'<label class="field">'+escapeHtml(d)+'（%）<input required type="number" name="w'+i+'" min="0" max="100" step="1" value="'+p.weights[d]+'"></label>').join('');
    openModal(editingDraft?'修订指标草案':'编制指标版本','<form class="stack" data-metric-form data-parent="'+escapeHtml(key)+'" data-edit="'+(editingDraft?'1':'')+'" data-revision="'+escapeHtml(p.revision||'')+'">'+workField('方案名称','title',{max:80,value:p.title})+
      '<div class="met-fields">'+weights+'<label class="field">综合通过线（分）<input required type="number" name="threshold" min="0" max="100" step="1" value="'+p.threshold+'"></label></div>'+
      '<div role="status" data-weight-sum>权重合计 100%</div>'+
      '<label class="field">适用范围及修订说明<textarea required name="reason" maxlength="400" rows="2">'+(editingDraft?escapeHtml(p.reason):'')+'</textarea></label>'+
      '<div class="actions">'+workBtn('取消','dialog-close')+'<button type="submit" class="btn primary">保存待审批版本</button></div></form>');
    return;
  }
  const mayEdit=p.status==='draft' && p.createdBy===window.workspaceUser.username;
  const mayPublish=p.status==='draft' && workCan('lead','admin') && p.createdBy!==window.workspaceUser.username;
  const next=svcWriter() && p.status==='published' && !data.profiles.some(other=>other.familyId===p.familyId && other.version>p.version);
  openModal('评测指标口径','<div class="stack"><h3>'+escapeHtml(profileName(p))+'</h3>'+
    '<p>'+escapeHtml(p.reason)+'</p>'+metricWeights(p,data.domains)+
    '<p>每题按规则计 0–100 分，先取各能力域题目的平均分，再按权重汇总。全部有权重的能力域均有题目时给出综合分。通过线为 '+p.threshold+' 分。</p>'+
    svcSummary([['编制人',reviewOwner(p.createdBy)],['审批人',p.publishedBy?reviewOwner(p.publishedBy):'待审批'],['发布时间',p.publishedAt?workTime(p.publishedAt):p.id==='PROFILE-MATERIALS-V1'?'内置版本':'待发布']])+
    '<div class="actions">'+(next?profileButton(p.id==='PROFILE-MATERIALS-V1'?'以此新建指标方案':'以此编制新版本','new',p.id):'')+(mayEdit?profileButton('修订草案','new',p.id):'')+
    (mayPublish?profileButton('审批并发布','publish',p.id,true,p.revision):'')+'</div></div>');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-metric-action]'); if(!b) return;
  b.disabled=true;
  try {
    if(b.dataset.metricAction==='publish') {
      await api(metricProfilesPath+'/'+encodeURIComponent(b.dataset.id)+'/publish','POST',{revision:b.dataset.revision});
      closeModal();await refresh();notify('指标版本已发布');return;
    }
    await metricProfileView(b.dataset.id,b.dataset.metricAction==='new');
  } catch(err) {notify(err.message,'error');} finally {b.disabled=false;}
});
document.addEventListener('input',e=>{
  const f=e.target.closest('[data-metric-form]');
  if(!f||!/^w\d+$/.test(e.target.name))return;
  const sum=Array.from(f.elements).filter(el=>/^w\d+$/.test(el.name)).reduce((n,el)=>n+Number(el.value),0);
  f.querySelector('[data-weight-sum]').textContent='权重合计 '+sum+'%'+(sum===100?'':'，须调整至 100%');
});
document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-metric-form]');if(!f)return;e.preventDefault();
  const button=f.querySelector('[type=submit]');button.disabled=true;
  try {
    const {domains}=await api(metricProfilesPath);
    const weights=Object.fromEntries(domains.map((d,i)=>[d,Number(f.elements['w'+i].value)]));
    if(Object.values(weights).reduce((sum,v)=>sum+v,0)!==100)throw Error('请将五项能力的权重合计调整至 100%');
    const url=f.dataset.edit==='1'?metricProfilesPath+'/'+encodeURIComponent(f.dataset.parent)+'/revise':metricProfilesPath;
    await api(url,'POST',{parentId:f.dataset.parent,title:f.elements.title.value,weights,threshold:Number(f.elements.threshold.value),reason:f.elements.reason.value,revision:f.dataset.revision});
    closeModal();await refresh();notify('指标版本已保存，待另一位负责人审批');
  } catch(err) {notify(err.message,'error');} finally {button.disabled=false;}
});
