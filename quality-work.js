'use strict';

(() => {
  const base = '/api/quality-work';
  const names = {consistent:'容差内',conflict:'读数超差',context:'条件有别',missing:'单侧缺项',ambiguous:'同号多条',insufficient:'依据不足'};
  const dims = {
    accuracy:['准确性','规则答案与原文摘录或重算结果相同。教师答案另由人工判断。'],
    completeness:['完整性','问题、答案和引用证据均已填写。'],
    consistency:['一致性','可定位证据，且规则答案与重算值相同。教师候选此项仅核证据位置。'],
    diversity:['问答去重','规范化后的问题和答案未与已纳入记录重复。'],
    format:['格式规范','题干 1–400 字，答案 1–2000 字。'],
    traceability:['可追溯性','证据块编号、位置和文本与所引核准版本相符。']
  };
  const decisionTypes = ['采用原始记录','采用对照记录','保留差异待复测','待补证','经复核允许双方采用'];
  const h = value => escapeHtml(value);
  const canRun = () => workCan('operator');
  const canReview = () => workCan('operator','expert');
  let tab = 'samples', batchId = '', runId = '', runFilter = '', sampleFilter = '';
  let currentIndex = null, activeRun = null;
  function btn(label, action, id='', tone='') {
    return `<button type="button" class="btn ${tone}" data-quality="${action}" data-id="${h(id)}">${h(label)}</button>`;
  }
  function sel(label, name, options, selected, id='') {
    return `<label class="field">${h(label)}<select name="${h(name)}"${id?' id="'+id+'"':''}>${workSelect(options,selected)}</select></label>`;
  }
  function label(key) {
    const tone={consistent:'green',conflict:'red',context:'amber',missing:'amber',ambiguous:'amber',insufficient:'neutral'}[key];
    return `<span class="badge ${tone}">${h(names[key])}</span>`;
  }
  function sourceButton(source, text='查看源版本') {
    return workBtn(text,'resource-open',source.resourceId+'|'+source.versionId,'small link');
  }
  function sampleView(report) {
    const indicators = Object.entries(dims).map(([key,[name,rule]])=>{
      const n=report.dimensions[key];
      return `<div class="qw-indicator" title="${h(rule)}"><span>${h(name)}</span><strong>${n.passed}<small> / ${n.applicable}</small></strong></div>`;
    }).join('');
    const rows = report.samples.filter(s=>!sampleFilter || (sampleFilter==='issues' ? s.status!=='passed' : s.mode==='teacher')).map(s=>{
      const quality=s.quality;
      const problem=quality?.issues?.filter(t=>!s.review || !t.includes('待专家确认')).join('；');
      const determination=s.review ? (s.review.decision==='pass'?'人工已通过':'人工已剔除') : s.mode==='teacher' && s.status==='candidate'?'待人工复核':'';
      return [`<b>${h(s.question)}</b>`,h(quality?.score ?? '未检'),statusBadge(s.status),
        h(determination || problem || (quality?'规则通过':'尚未质检')),btn('核对判据','sample',s.id,'small link')];
    });
    const filter = sel('样本范围','sampleFilter',[['','全部样本'],['issues','待处理或已剔除'],['teacher','教师候选']],sampleFilter,'qw-sample-filter');
    return `<div class="qw-toolbar">${sel('语料批次','batch',currentIndex.batches.map(b=>[b.id,b.title+'（'+b.count+'条）']),report.id,'qw-batch')}${filter}</div>
      <details class="pd-quality-detail"><summary>六项质量指标 · 已核查 ${report.checked} / ${report.total} 条</summary><div class="qw-indicators">${indicators}</div></details>
      <div class="qw-heading"><h3>样本判定</h3><div>${sourceButton(report.source)} ${workBtn('打开语料批次','home-batch',report.id,'small link')}</div></div>
      ${rows.length?workTable(['问答样本','规则分','样本状态','判定依据','操作'],rows):workEmpty('当前范围暂无样本')}`;
  }
  async function showSample(id) {
    const {sample:s,source,evidence,expected}=await api(base+'/samples/'+encodeURIComponent(id));
    const q=s.quality || {};
    const rows=Object.entries(dims).map(([key,[name,rule]])=>{
      const score=q.dimensions?.[key];
      return [h(name),h(score==null?(!s.quality?'未执行':'不计入'):(score===100?'通过':'未通过')),h(rule)];
    });
    const refs=evidence.length?evidence.map(b=>`<div class="qw-evidence"><b>${h(b.location)}</b><p>${h(b.text)}</p></div>`).join(''):workEmpty('未匹配到完整的当前版本证据');
    openModal('样本判据与证据',`<div class="stack qw"><h3>${h(s.question)}</h3><p>${h(s.answer)}</p>
      <div>${statusBadge(s.status)}　${h(s.mode==='teacher'?'教师候选':'规则生成')}　${h(q.score==null?'未执行质检':'规则分 '+q.score)}</div>
      ${expected!=null?`<div class="qw-evidence"><b>原文复算答案</b><p>${h(expected)}</p></div>`:''}
      ${workTable(['维度','规则结果','实际判据'],rows)}
      ${q.duplicateOf?`<p>重复样本　${h(q.duplicateOf)}</p>`:''}
      ${s.review?`<p>人工结论　${h(s.review.decision==='pass'?'通过':'剔除')} · ${h(s.review.by)} · ${h(s.review.note)}</p>`:''}
      <div class="qw-heading"><h3>引用原文 · ${h(source.title)} v${source.number}</h3>${sourceButton(source)}</div>${refs}
      ${workBtn('进入样本对照核查','sample-open',s.id,'small')}</div>`);
  }
  function reading(r,unit) {
    if(!r.length) return '—';
    return r.map(x=>`<b>${h(x.raw)}${x.unit && !String(x.raw).trim().endsWith(x.unit)?' '+h(x.unit):''}</b>${x.standard!==null && x.unit!==unit?`<small class="cell-note">= ${h(x.standard)} ${h(unit)}</small>`:''}`).join('<br>');
  }
  function freezeImpact(row) {
    const sides=row.disposition.blockedSides;
    if(row.state!=='conflict')return '—';
    if(!sides.length)return '本单无阻断';
    if(sides.length===2)return '阻断两份版本';
    return sides[0]==='left'?'阻断原始版本':'阻断对照版本';
  }
  function compareView(run) {
    const options=[['','全部结果'],['unresolved','待处置差异'],['blocking','影响训练冻结'],...Object.entries(names)];
    const comparable=run.counts.consistent+run.counts.conflict;
    const pending=run.rows.filter(row=>row.disposition.needsAction).length;
    const rows=run.rows.filter(row=>{
      if(runFilter==='unresolved')return row.disposition.needsAction;
      if(runFilter==='blocking')return row.disposition.blockedSides.length>0;
      return !runFilter || row.state===runFilter;
    }).map(row=>{
      const last=run.decisions[row.key]?.at(-1);
      return [`<b>${h(row.sample)}</b>`,reading(row.left,run.unit),reading(row.right,run.unit),row.delta===null?'—':h(row.delta)+' '+h(run.unit),
        label(row.state),h(last?.decision || '未登记'),freezeImpact(row),btn('对照原文','row',row.key,'small link')];});
    return `<div class="qw-toolbar">${sel('核查单','run',currentIndex.runs.map(r=>[r.id,r.title]),run.id,'qw-run')}${sel('条目范围','filter',options,runFilter,'qw-run-filter')}</div>
      <div class="qw-source-line"><span>原始记录　${h(run.left.filename)} · v${run.left.number}</span><span>对照记录　${h(run.right.filename)} · v${run.right.number}</span></div>
      <div class="qw-caption"><strong>${h(run.metric)}</strong><span>绝对容差 ≤ ${h(run.tolerance)} ${h(run.unit)}　·　${h(workTime(run.at))}</span></div>
      <div class="qw-indicators wide">${[['对照条目',run.rows.length],['可比较',comparable],['读数超差',run.counts.conflict],['条件或证据待核',run.rows.length-comparable]].map(([k,n])=>`<div class="qw-indicator"><span>${k}</span><strong>${n}</strong></div>`).join('')}</div>
      <div class="qw-heading"><h3>按试样核对</h3><span>待处置差异 ${pending} 条</span></div>
      ${rows.length?workTable(['试样','原始读数','对照读数','绝对差','规则结果','人工处置','本单冻结影响','操作'],rows):workEmpty('此范围内暂无核对条目')}`;
  }
  function sourceEvidence(title,list,source,unit) {
    return `<section class="qw-evidence"><div class="qw-heading"><h3>${title}</h3>${sourceButton(source)}</div><p>${h(source.filename)} · v${h(source.number)}</p>
      ${!list.length?'<p>本版原文无对应读数</p>':list.map(e=>`<div><b>${h(e.location)} · ${h(e.blockId)}</b><p>${h(e.text)}</p>
      <p>核查值　${e.standard===null?'待核对单位与数值':h(e.standard)+' '+h(unit)}</p></div>`).join('')}</section>`;
  }
  function showRow(key) {
    const run=activeRun, row=run.rows.find(r=>r.key===key);
    const history=run.decisions[key] || [];
    const eligibleToRelease=row.state==='conflict' && workCan('expert');
    const choices=decisionTypes.filter(t=>(t!=='经复核允许双方采用' || eligibleToRelease) && !(t==='采用原始记录' && !row.left.length) && !(t==='采用对照记录' && !row.right.length));
    const form=canReview()?`<form class="stack" data-qw-form="decision" data-key="${h(key)}" data-revision="${history.length}" data-run="${h(run.id)}">
      <div class="qw-heading"><h3>登记处置</h3></div>${sel('处置意见','decision',choices.map(v=>[v,v]),'待补证')}
      <label class="field">处置依据<textarea required name="note" rows="2" maxlength="1200" placeholder="记录核证依据、采用哪一侧或需要补充的材料"></textarea></label>
      ${eligibleToRelease?'<label class="qw-confirm"><input type="checkbox" name="confirmRelease">已核对原文，同意按采信结论放行相应资料版本</label>':''}<div class="actions"><button type="submit" class="btn primary">保存处置意见</button></div></form>`:'';
    openModal(row.sample+' · '+run.metric,`<div class="stack qw"><div>${label(row.state)}　${h(row.reason)}</div>
      <div class="qw-evidence-grid">${sourceEvidence('原始记录',row.left,run.left,run.unit)}${sourceEvidence('对照记录',row.right,run.right,run.unit)}</div>
      <p>容差 ≤ ${h(run.tolerance)} ${h(run.unit)}${row.delta===null?'　·　未计入可比较条目':'　·　绝对差 '+h(row.delta)+' '+h(run.unit)}</p>
      ${row.state==='conflict'?`<p><b>本单冻结影响　${freezeImpact(row)}</b> · ${h(row.disposition.reason)}</p>`:''}
      ${history.length?`<section><h3>处置记录</h3>${history.map(e=>`<p><b>${h(e.decision)}</b>${e.releaseConfirmed?'（确认放行）':''} · ${h(e.by)} · ${workTime(e.at)}<br>${h(e.note)}</p>`).join('')}</section>`:''}${form}</div>`);
  }
  function newRun() {
    const versions=currentIndex.versions;
    if(versions.length<2) {openModal('新建一致性核查',workEmpty('需要两份已核准的训练资料，均含可比较指标')+btn('导入合成核查资料','example'));return;}
    const options=versions.map(v=>[v.versionId,v.title+' · v'+v.number]);
    openModal('新建一致性核查',`<form class="stack qw" data-qw-form="run">
      ${sel('原始资料版本','left',options,options[0][0])}${sel('对照资料版本','right',options,options[1][0])}
      <div class="qw-form-grid"><label class="field">比较指标<select name="metric" required></select></label>
      <label class="field">绝对容差 <span data-qw-unit></span><input type="number" name="tolerance" step="any" min="0" max="999999999" value="0" required></label></div>
      <p data-qw-match></p><div class="actions">${workBtn('取消','dialog-close')}<button type="submit" class="btn primary">运行核查并保存</button></div></form>`);
    updateMetrics(wb('form[data-qw-form="run"]'));
  }
  function updateMetrics(form) {
    const versions=currentIndex.versions, e=form.elements;
    const a=versions.find(v=>v.versionId===e.left.value), b=versions.find(v=>v.versionId===e.right.value);
    const metrics=a.metrics.filter(m=>b.metrics.includes(m));
    const old=e.metric.value;
    e.metric.innerHTML=workSelect(metrics.map(m=>[m,m]),old);
    const same=a.resourceId===b.resourceId || a.sha256===b.sha256;
    form.querySelector('button[type="submit"]').disabled=same || !metrics.length;
    form.querySelector('[data-qw-match]').textContent=same?'请选两份不同的资料。':!metrics.length?'所选版本没有共同的受支持指标。':'按试样编号与指标对齐，核对材料及试验条件后统一单位。';
    form.querySelector('[data-qw-unit]').textContent=currentIndex.units[e.metric.value] || '';
  }
  async function exampleForm() {
    const refs=await api(base+'/example');
    openModal('导入合成核查资料',`<form class="stack qw" data-qw-form="example"><p>两份练习表将登记为训练资料。请核对原表，确认后按 1 MPa 绝对容差生成核查单。</p>
      ${refs.map(r=>`<section class="qw-evidence"><h3>${h(r.title)}</h3><pre>${h(r.text)}</pre></section>`).join('')}
      <label class="qw-confirm"><input type="checkbox" name="confirmed" required>已核对原表，同意核准这两份合成资料</label>
      <div class="actions">${workBtn('取消','dialog-close')}<button class="btn primary" type="submit">登记并运行核查</button></div></form>`);
  }
  window.renderQualityWork=async function() {
    if (['samples','cross'].includes(window.qualityWorkTab)) {tab=window.qualityWorkTab; delete window.qualityWorkTab;}
    const selectedBatch=window.qualityWorkBatchId;
    if(selectedBatch){batchId=selectedBatch;tab='samples';sampleFilter='';delete window.qualityWorkBatchId;}
    const targetRun=window.qualityWorkRunId, targetRow=window.qualityWorkRowKey;
    if(targetRun){runId=targetRun;tab='cross';runFilter='';delete window.qualityWorkRunId;delete window.qualityWorkRowKey;}
    const [index,batches,resources]=await Promise.all([api(base),api('/api/batches'),api('/api/resources')]);
    const byId=new Map(batches.map(row=>[row.id,row]));
    const sources=new Map(resources.map(row=>[row.id,row]));
    const choices=index.batches.map(row=>({...row,catalogTier:byId.get(row.id)?.catalogTier,researchCase:sources.get(byId.get(row.id)?.resourceId)?.researchCase}));
    if(selectedBatch && choices.some(row=>row.id===selectedBatch && row.catalogTier==='archived-practice'))
      workRecordScopes.set(workScopeKey('production'),'practice');
    currentIndex={...index,versions:workSourceChoices(index.versions||[],'production'),batches:workScopeRows(choices,'production').sort((a,b)=>workCaseRank(a)-workCaseRank(b))};
    let content='';
    if(tab==='samples') {
      if(!currentIndex.batches.some(b=>b.id===batchId)) batchId=(currentIndex.batches.find(b=>b.status==='reviewed') || currentIndex.batches[0])?.id || '';
      content=batchId?sampleView(await api(base+'/batches/'+encodeURIComponent(batchId))):workEmpty('暂无训练批次');
    } else {
      if(!currentIndex.runs.some(r=>r.id===runId)) runId=currentIndex.runs[0]?.id || '';
      activeRun=runId?await api(base+'/runs/'+encodeURIComponent(runId)):null;
      if(targetRow && activeRun?.id===targetRun && activeRun.rows.some(r=>r.key===targetRow)){
        setTimeout(()=>{if(window.workspacePage==='quality-work' && activeRun?.id===targetRun)showRow(targetRow);},0);
      }
      content=activeRun?compareView(activeRun):workEmpty('暂无跨源核查单','选择两份已核准的训练资料，按同一试样核对指标、单位与试验条件。');
    }
    const actions=tab==='cross' && canRun()?btn('导入合成核查资料','example')+btn('新建一致性核查','new','','primary'):'';
    return sectionHead('','质量与一致性','',workScopeMenu('production')+actions)+`<section class="panel qw">
      <nav class="qw-tabs" aria-label="质量工作">${[['samples','样本质量评价'],['cross','跨源一致性']].map(([k,n])=>`<button type="button" data-quality="tab" data-id="${k}" aria-pressed="${k===tab}">${n}</button>`).join('')}</nav><div class="qw-body">${content}</div></section>`;
  };
  document.addEventListener('click',async event=>{
    const button=event.target.closest('button[data-quality]');
    if(!button || button.disabled) return;
    const {quality:action,id}=button.dataset;
    button.disabled=true;
    try{
      if(action==='tab'){tab=id;await refresh();}
      if(action==='sample') await showSample(id);
      if(action==='row') showRow(id);
      if(action==='new') newRun();
      if(action==='example') await exampleForm();
    } catch(error){notify(error.message,'error');} finally{button.disabled=false;}
  });
  document.addEventListener('change',async event=>{
    const el=event.target;
    try{
      if(el.id==='qw-batch'){batchId=el.value;sampleFilter='';await refresh();}
      if(el.id==='qw-sample-filter'){sampleFilter=el.value;await refresh();}
      if(el.id==='qw-run'){runId=el.value;runFilter='';await refresh();}
      if(el.id==='qw-run-filter'){runFilter=el.value;await refresh();}
      if(el.form?.dataset.qwForm==='run' && ['left','right','metric'].includes(el.name)) updateMetrics(el.form);
    } catch(error){notify(error.message,'error');}
  });
  document.addEventListener('submit',async event=>{
    const form=event.target,action=form.dataset.qwForm;
    if(!action)return;
    event.preventDefault();
    const button=event.submitter;
    if(button?.disabled)return;
    if(button)button.disabled=true;
    try{
      const fields=Object.fromEntries(new FormData(form));
      let result;
      if(action==='decision'){
        result=await api(base+'/runs/'+form.dataset.run+'/decisions','POST',{rowKey:form.dataset.key,decision:fields.decision,note:fields.note,revision:Number(form.dataset.revision),confirmRelease:fields.confirmRelease==='on'});
      } else if(action==='example') {
        result=await api(base+'/example','POST',{confirmed:fields.confirmed==='on'});
      } else if(action==='run'){
        const vs=currentIndex.versions, a=vs.find(v=>v.versionId===fields.left), b=vs.find(v=>v.versionId===fields.right);
        result=await api(base+'/runs','POST',{leftId:a.resourceId,leftVersion:a.versionId,rightId:b.resourceId,rightVersion:b.versionId,metric:fields.metric,tolerance:fields.tolerance});
      }
      if(!result)return;
      tab='cross';runId=result.id;
      if(action!=='decision')runFilter='';
      closeModal();await refresh();notify(action==='decision'?'处置意见已保存':'核查单已保存');
    }catch(error){notify(error.message,'error');}finally{if(button)button.disabled=false;}
  });
})();
