'use strict';

const exState = { annotation: '', sample: '', benchmark: '', annotationFilter: 'all', benchmarkFilter: 'all', blocks: [] };
const exEditorViews = new Map();
const exItemViews = new Map();
const exKinds = ['条件核对', '证据提取', '计算与推导', '结论与边界'];
const exStatus = {
  draft: ['草稿', 'neutral'], submitted: ['待专家复核', 'amber'], returned: ['退回修改', 'amber'], approved: ['已通过', 'green'],
  reviewing: ['专家评审中', 'blue'], published: ['已发布', 'green'], pending: ['等待评分', 'neutral'], conflict: ['待仲裁', 'red'],
  accepted: ['评分已定稿', 'green'], open: ['待受理', 'amber'], in_progress: ['处理中', 'blue'], resolved: ['已关闭', 'green']
};
const exActions = {
  create: '创建', save: '保存草稿', submit: '提交', approve: '通过', return: '退回', review: '提交评分', arbitrate: '完成仲裁',
  publish: '冻结发布', item: '维护评测题', remove: '移除题目', open: '创建补充任务', in_progress: '受理任务', resolved: '关闭任务', regression: '归档同题回归复验'
};
const exDate = value => { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12:false }) : '—'; };
const exPath = value => encodeURIComponent(value);
const exText = value => escapeHtml(value ?? '');
const exChecked = checked => checked ? ' checked' : '';
const exSelected = selected => selected ? ' selected' : '';
function exAllowed(...roles) { return roles.includes(window.workspaceUser?.role); }
function exOwn(username) { return username === window.workspaceUser?.username; }
function exBadge(status) {
  const [label, tone] = exStatus[status] || [status || '待标注', 'neutral'];
  return `<span class="ex-badge ex-${tone}">${exText(label)}</span>`;
}
function exButton(label, action, id = '', options = {}) {
  const {primary = false, quiet = false, extra = '', disabled = false} = options;
  return `<button type="button" class="btn${primary ? ' primary' : ''}${quiet ? ' ex-quiet' : ''}" data-action="ex-${exText(action)}"${id ? ` data-id="${exText(id)}"` : ''}${disabled ? ' disabled' : ''}${extra}>${exText(label)}</button>`;
}
function exSubmit(label, action) {
  return `<button type="submit" name="intent" value="${exText(action)}" class="btn${action === 'save' ? '' : ' primary'}">${exText(label)}</button>`;
}
function exPanel(title, meta, body, controls = '') {
  return `<section class="panel ex-panel"><div class="panel-head"><div><h2>${exText(title)}</h2>${meta ? `<p class="muted">${exText(meta)}</p>` : ''}</div>${controls}</div><div class="panel-body">${body}</div></section>`;
}
function exEmpty(title, description = '', actions = '') {
  return `<div class="ex-empty"><strong>${exText(title)}</strong>${description ? `<p>${exText(description)}</p>` : ''}${actions}</div>`;
}
function exSummary(items) {
  return `<dl class="ex-metrics">${items.map(([label,count], index) => `<div class="ex-metric ex-metric-${index}"><dt>${exText(label)}</dt><dd>${exText(count)}</dd></div>`).join('')}</dl>`;
}
function exFilters(name, pairs, current) {
  return `<div class="ex-tabs" aria-label="状态筛选">${pairs.map(([id,label]) => `<button type="button" class="ex-tab${id === current?' active':''}" aria-pressed="${id === current}" data-action="ex-${name}" data-id="${id}">${exText(label)}</button>`).join('')}</div>`;
}
function exHistory(history, title = '操作记录') {
  if (!Array.isArray(history) || !history.length) return '';
  return `<details class="ex-history"><summary>${title}<span class="ex-caption">${history.length} 条</span></summary><ol>${history.slice().reverse().map(entry => `<li><div><strong>${exText(exActions[entry.action?.split('.').at(-1)] || exStatus[entry.status]?.[0] || entry.action || entry.status)}</strong><span>${exText(entry.display || entry.username || '')}</span><time>${exText(exDate(entry.at))}</time></div>${entry.note ? `<p>${exText(entry.note)}</p>` : ''}</li>`).join('')}</ol></details>`;
}
function exEvidenceCard(block) {
  return `<li class="ex-evidence-card"><span class="ex-mono">${exText(block.location || block.blockId || block.id)}</span><p>${exText(block.text)}</p></li>`;
}
function exEvidenceGroup(name, blocks, selection, empty = '当前资源版本没有可用证据块。') {
  if (!blocks.length) return `<p class="muted">${exText(empty)}</p>`;
  return `<div class="ex-evidence-choices">${blocks.map(block => {
    const id = block.blockId || block.id;
    const excerpt = (block.text || '').replace(/\s+/g, ' ');
    return `<label class="ex-evidence-option"><input type="checkbox" name="${exText(name)}" value="${exText(id)}"${exChecked(selection.has(id))}><span><strong>${exText(block.location || id)}</strong><span>${exText(excerpt.length > 145 ? `${excerpt.slice(0,145)}…` : excerpt)}</span></span></label>`;
  }).join('')}</div>`;
}
function exStepDraft(step, index, blocks, active = index) {
  const selected = new Set(step.blockIds || []);
  const kinds = exKinds.includes(step.kind) || !step.kind ? exKinds : [...exKinds, step.kind];
  return `<fieldset class="ex-step" data-ex-step${index !== active ? ' hidden' : ''}><legend><span data-ex-step-number>${String(index + 1).padStart(2, '0')}</span>推理步骤</legend>
    <label class="field">步骤类型<select name="kind">${kinds.map(kind => `<option${exSelected(kind === step.kind)}>${exText(kind)}</option>`).join('')}</select></label>
    <label class="field">步骤说明<textarea name="text" maxlength="2000" rows="4" placeholder="填写本步核对的条件、数据或计算依据">${exText(step.text)}</textarea></label>
    <details class="ex-evidence-picker" open><summary>引用原文证据<span class="ex-caption" data-ex-evidence-count>${selected.size} 项已选</span></summary>${exEvidenceGroup('blockId',blocks,selected)}</details>
    <div class="ex-form-actions">${exButton('移除本步','step-remove','',{quiet:true})}</div>
  </fieldset>`;
}
function exStepNavigation(steps, active) {
  return steps.map((step,index) => {
    const ready = Boolean(step.text?.trim() && step.blockIds?.length);
    return `<button type="button" data-action="ex-step-select" data-id="${index}" aria-current="${index === active ? 'step' : 'false'}"><b>${String(index+1).padStart(2,'0')}</b><span>${exText(step.kind)}</span><small>${ready ? '完整' : '待补充'}</small></button>`;
  }).join('');
}
function exStepValues(form) {
  return Array.from(form.querySelectorAll('[data-ex-step]'), row => ({
    kind:row.querySelector('select').value, text:row.querySelector('textarea').value.trim(),
    blockIds:Array.from(row.querySelectorAll('input:checked'), input => input.value)
  }));
}
function exSyncEditor(form, index, dirty = false) {
  const rows = Array.from(form.querySelectorAll('[data-ex-step]'));
  const steps = exStepValues(form);
  const active = Math.max(0, Math.min(index ?? exEditorViews.get(form.dataset.id) ?? 0, rows.length - 1));
  exEditorViews.set(form.dataset.id, active);
  rows.forEach((row,i) => { row.hidden = i !== active; });
  form.querySelector('.ex-step-nav').innerHTML = exStepNavigation(steps, active);
  form.querySelector('[data-ex-complete]').textContent = steps.filter(step => step.text && step.blockIds.length).length + ' / ' + steps.length + ' 步完整';
  if (dirty) form.querySelector('[data-ex-save-state]').textContent = '有未保存修改';
}
function exReadOnlyStep(step,index) {
  return `<article class="ex-step ex-static-step"><h3><span>${String(index + 1).padStart(2, '0')}</span>${exText(step.kind)}</h3><p>${exText(step.text)}</p>${step.evidence?.length ? `<ul class="ex-evidence-list">${step.evidence.map(exEvidenceCard).join('')}</ul>`:''}</article>`;
}
const exCriteriaLabels = {comparisonConditions:'比较条件',applicability:'结论适用范围'};
function exCriteriaValues(form) {
  return Object.fromEntries(Array.from(form.querySelectorAll('[data-material-criterion]'),row=>[
    row.dataset.materialCriterion, {text:row.querySelector('textarea').value.trim(),
      blockIds:Array.from(row.querySelectorAll('input:checked'),input=>input.value)}
  ]).filter(([,entry])=>entry.text || entry.blockIds.length));
}
function exMaterialCriteria(annotation, editable) {
  const criteria = annotation.materialCriteria || {};
  if (!editable && !Object.keys(criteria).length) return '';
  const fields = Object.entries(exCriteriaLabels).map(([key,label])=>{
    const item = criteria[key];
    if (!editable && !item) return '';
    if (!editable) return `<section class="ex-criterion"><h4>${label}</h4><p>${exText(item.text)}</p>
      <details class="ex-history"><summary>引用原文 · ${item.evidence.length} 处</summary><ul class="ex-evidence-list">${item.evidence.map(exEvidenceCard).join('')}</ul></details></section>`;
    const ids = item?.blockIds || [];
    const placeholder = key === 'comparisonConditions' ? '比较的试样在哪些条件下可作对照？' : '结论适用于哪些试样、状态或试验条件？';
    return `<section class="ex-criterion" data-material-criterion="${key}"><label class="field">${label}<textarea aria-label="${label}" rows="2" maxlength="1000" placeholder="${placeholder}">${exText(item?.text)}</textarea></label>
      <details class="ex-evidence-picker"><summary>引用原文证据 <span data-ex-evidence-count>${ids.length} 项已选</span></summary>${exEvidenceGroup('criterionBlock',annotation.availableBlocks || [],new Set(ids))}</details></section>`;
  }).join('');
  return `<details class="ex-material-criteria"${Object.keys(criteria).length ? ' open' : ''}><summary>比较条件与适用范围</summary>
    <div class="ex-criteria-grid">${fields}</div></details>`;
}
const exHandoffRoles = ['operator','annotator','expert-a','expert-b','lead'];

function exHandoffRow(message, receiver, section, id, itemId = '') {
  const canSwitch = window.workspaceUser?.meeting && exHandoffRoles.includes(receiver) && !exOwn(receiver);
  const switcher = canSwitch ? exButton('切换至' + reviewOwner(receiver),'next-role',id,{extra:
    ` data-receiver="${exText(receiver)}" data-section="${exText(section)}" data-item-id="${exText(itemId)}"`}) : '';
  return `<div class="ex-handoff-row"><span>${exText(message)}</span>${switcher}</div>`;
}

function exAnnotationHandoff(annotation, canEdit, canReview) {
  if (!canEdit && ['draft','returned'].includes(annotation.status)) {
    const task = annotation.status === 'returned' ? '按复核意见修订标注。' : '补全推理步骤并提交复核。';
    return exHandoffRow('待' + reviewOwner(annotation.author) + task,annotation.author,'annotations',annotation.id);
  }
  if (!canReview && annotation.status === 'submitted') {
    const reviewer = annotation.author === 'expert-a' ? 'expert-b' : 'expert-a';
    return exHandoffRow('标注已提交，待独立专家复核。',reviewer,'annotations',annotation.id);
  }
  return '';
}

function exAnnotationDetail(annotation, sample) {
  const canEdit = exOwn(annotation.author) && ['draft','returned'].includes(annotation.status);
  const canReview = exAllowed('expert','lead','admin') && !exOwn(annotation.author) && annotation.status === 'submitted';
  const heading = `<div class="ex-facts"><span><small>工单编号</small><strong class="ex-mono">${exText(annotation.id)}</strong></span><span><small>样本</small><strong class="ex-mono">${exText(annotation.sampleId)}</strong></span><span><small>证据版本</small><strong class="ex-mono">${exText(annotation.versionId)}</strong></span><span><small>标注人</small><strong>${exText(annotation.author)}</strong></span></div>`;
  const question = sample ? `<div class="ex-context"><h3>训练样本${annotation.topic?' · '+exText(annotation.topic):''}</h3><strong>${exText(sample.question)}</strong><p>${exText(sample.answer)}</p>${sample.evidence?.length ? `<details class="ex-history"><summary>查看样本的原始证据</summary><ul class="ex-evidence-list">${sample.evidence.map(exEvidenceCard).join('')}</ul></details>` : ''}</div>` : '';
  const recorded = annotation.steps || [];
  const standardDraft = recorded.length === 1 && recorded[0].kind === '证据提取' && !recorded[0].text;
  const steps = canEdit && (!recorded.length || standardDraft)
    ? [...exKinds.map(kind => recorded.find(step=>step.kind===kind) || {kind,text:'',blockIds:[]}), ...recorded.filter(step=>!exKinds.includes(step.kind))]
    : recorded;
  const active = Math.min(exEditorViews.get(annotation.id) || 0, steps.length - 1);
  const editable = `<form class="stack ex-form" data-form="ex-annotation-edit" data-id="${exText(annotation.id)}" data-owner="${exText(annotation.author)}">
    <div class="ex-editor-bar"><h3>步骤编辑器</h3><span data-ex-complete aria-live="polite">${steps.filter(s => s.text?.trim() && s.blockIds?.length).length} / ${steps.length} 步完整</span><small data-ex-save-state>已载入草稿</small></div>
    <div class="ex-step-nav" aria-label="选择标注步骤">${exStepNavigation(steps,active)}</div>
    <div class="ex-step-grid">${steps.map((step,index) => exStepDraft(step,index,annotation.availableBlocks || [],active)).join('')}</div>
    ${exMaterialCriteria(annotation,true)}
    <div class="ex-form-actions">${exButton('增加推理步骤','step-add','',{quiet:true})}${exSubmit('保存草稿','save')}${exSubmit('提交专家复核','submit')}</div></form>`;
  const readOnly = (steps.length ? `<div class="ex-step-grid">${steps.map(exReadOnlyStep).join('')}</div>` : `<p class="muted">暂无推理步骤</p>`) + exMaterialCriteria(annotation,false);
  const review = canReview ? `<form class="ex-review-form stack" data-form="ex-annotation-review" data-id="${exText(annotation.id)}"><h3>专家复核</h3><label class="field">复核意见<textarea name="note" rows="2" maxlength="2000" placeholder="退回时填写需要修正的步骤及原因"></textarea></label><div class="ex-form-actions">${exSubmit('退回修改','return')}${exSubmit('通过复核','approve')}</div></form>` : '';
  const previous = annotation.review?.note ? `<div class="ex-context"><h3>${annotation.review.action === 'return' ? '退回意见' : '复核意见'}</h3><p>${exText(annotation.review.note)}</p><span class="ex-caption">${exText(annotation.review.display || annotation.review.username)} · ${exText(exDate(annotation.review.at))}</span></div>` : '';
  const controls = annotation.status === 'approved' ? `<div class="ex-form-actions">${exBadge(annotation.status)}${exButton('评测交接','annotation-handoff',annotation.id,{primary:true})}${exButton('导出标注 JSON','annotation-export',annotation.id)}</div>` : exBadge(annotation.status);
  return exPanel('标注工作单','',`<div class="stack">${exAnnotationHandoff(annotation,canEdit,canReview)}${question}${previous}${canEdit ? editable : readOnly}${review}<details class="ex-history"><summary>工单来源与版本</summary>${heading}</details>${exHistory(annotation.history)}</div>`,controls);
}
function handoffEvidence(candidate) {
  return `<h3>${exText(candidate.question)}</h3>
    <ul class="ex-evidence-list">${candidate.evidence.map(exEvidenceCard).join('')}</ul>
    <label class="field">参考答案</label><p>${exText(candidate.answer)}</p>
    <details class="ex-history"><summary>评分标准及候选回答</summary>
    ${workTable(['评分项','满分','给分依据'],candidate.rubric.map(r=>[exText(r.name),exText(r.max),exText(r.description)]))}
    ${candidate.candidates.map((r,i)=>`<p><b>${i ? 'B' : 'A'}</b>　${exText(r.answer)}</p>`).join('')}
    <p>两份候选回答由留出原文及题型规则构造。</p></details>`;
}
function handoffReason(cross) {
  return cross ? '<label class="field">跨门类评测理由<input name="transferReason" required maxlength="480" placeholder="说明两个门类之间需验证的共同能力"></label>' : '';
}
const handoffConfirm = '<label><input name="confirmed" type="checkbox" required> 已核对留出原文、参考答案、评分标准及两份候选回答</label>';
async function openAnnotationBenchmarkHandoff(annotationId, manual = false) {
  const h = await api(`/api/annotations/${exPath(annotationId)}/benchmark-handoff`);
  const s = h.source;
  const summary = `<div class="ex-context"><h3>${exText(s.resourceTitle)}</h3><p>${exText(s.question)}</p><span>${exText([s.family,s.topic].filter(Boolean).join(' · '))}　${exText(s.annotationId)}</span></div>`;
  if (h.benchmarkId) {
    if (exAllowed('operator','expert','lead','admin')) {
      exItemViews.set(h.benchmarkId,h.itemId);
      closeModal();
      return openBenchmarkRecord(h.benchmarkId);
    }
    openModal('评测交接',summary+`<p>${exText(h.title)}　${exBadge(h.status)}</p>`);
    return;
  }
  if (!h.canPrepare) {
    const switcher = window.workspaceUser?.meeting ? exButton('切换至数据管理员办理','handoff-operator',annotationId,{primary:true}) : '';
    openModal('评测交接',summary+exEmpty('待编制独立留出题','数据管理员或评测负责人可接收该标注工单。',switcher));
    return;
  }
  if (!h.materials.length) {
    openModal('评测交接',summary+exEmpty('缺少已核准的独立留出资料','请从资源目录导入相应专题的独立留出文件，核准后返回本工单。',exButton('打开资源目录','page','resources',{primary:true})));
    return;
  }
  const title = `<label class="field">基准名称<input name="title" required maxlength="120" value="${exText((s.resourceTitle+' · '+(s.topic || '能力验证')).slice(0,120))}"></label>`;
  if (manual || !h.candidates.length) {
    let formHtml = exBenchmarkEditForm(h.materials,null,annotationId)
      .replace('ex-item-save','ex-handoff-manual')
      .replace('<div class="grid-2">', title + '<div class="grid-2">')
      .replace('<input name="category" required value="" maxlength="80">',`<select name="category">${(s.topic?[s.topic]:['基础概念理解','标准技术规则识别','科学计算']).map(t=>`<option>${exText(t)}</option>`).join('')}</select>`)
      .replace('<div class="ex-form-actions"><button type="submit"', '<div data-handoff-reason></div>'+handoffConfirm+'<div class="ex-form-actions"><button type="submit"')
      .replace('保存题目','建立评测草稿');
    openModal('独立留出题编制',summary+formHtml);
    const form = document.querySelector('form[data-form="ex-handoff-manual"]');
    form.querySelector('[data-ex-source]').addEventListener('change',e=>{
      const material=h.materials.find(m=>m.id===e.target.value);
      form.querySelector('[data-handoff-reason]').innerHTML=handoffReason(material?.crossFamily);
    });
    return;
  }
  const options = h.candidates.map((c,i)=>`<option value="${exText(c.id)}">${exText(c.resourceTitle)} · ${exText(c.kind)}${c.crossFamily?'（跨门类）':''} · ${i+1}</option>`).join('');
  openModal('标注移交评测',`<form class="stack ex-form" data-form="ex-handoff-prepare" data-id="${exText(annotationId)}">${summary}${title}
    <label class="field">独立留出题<select name="candidateId" required><option value="">请选择资料及题型</option>${options}</select></label>
    <div class="stack" data-handoff-preview></div>${handoffConfirm}
    <div class="ex-form-actions">${exButton('手工编题','handoff-manual',annotationId)}<button class="btn primary" type="submit">建立评测草稿</button></div></form>`);
  const form = document.querySelector('form[data-form="ex-handoff-prepare"]');
  form.elements.candidateId.addEventListener('change',e=>{
    form.elements.confirmed.checked=false;
    const c=h.candidates.find(x=>x.id===e.target.value);
    form.querySelector('[data-handoff-preview]').innerHTML=c ? handoffEvidence(c)+handoffReason(c.crossFamily) : '';
  });
}
async function exFinishHandoff(form,data,manualItem) {
  const result = await api(`/api/annotations/${exPath(form.dataset.id)}/benchmark-handoff`,'POST',{
    title:exTrim(data,'title'), confirmed:data.get('confirmed')==='on', candidateId:exTrim(data,'candidateId'),
    transferReason:exTrim(data,'transferReason'), manualItem
  });
  closeModal();
  exItemViews.set(result.benchmarkId,result.itemId);
  await openBenchmarkRecord(result.benchmarkId);
  notify('评测草稿已建立，可提交专家盲评');
  return true;
}

function isReviewDesk(route) {
  return route==='annotations' || route==='benchmarks';
}
function reviewEntry(route, kind='', id='') {
  const filter=route==='annotations'?exState.annotationFilter:exState.benchmarkFilter;
  const list=reviewListState[route];
  const source=route==='annotations'?sourceQueueFilters.annotations:{};
  return {route,kind,id,username:window.workspaceUser.username,query:list.query,page:list.page,
    filter,scope:workScopeValue(route),family:source.family||'',topic:source.topic||'',
    item:kind==='benchmark'?(exItemViews.get(id)||''):''};
}
function restoreReviewEntry(route) {
  if (!isReviewDesk(route)) return;
  const entry=history.state?.review;
  const target=entry?.route===route?entry:null;
  const sameUser=target && target.username===window.workspaceUser.username;
  if (sameUser) {
    Object.assign(reviewListState[route],{query:target.query || '',page:target.page || 1});
    if (route==='annotations') {
      exState.annotationFilter=target.filter || 'all';
      Object.assign(sourceQueueFilters.annotations,{family:target.family||'',topic:target.topic||''});
    } else exState.benchmarkFilter=target.filter || 'all';
    workRecordScopes.set(workScopeKey(route),target.scope || 'active');
  } else if (target) {
    Object.assign(reviewListState[route],{query:'',page:1});
    if (route==='annotations') {
      exState.annotationFilter='all';
      Object.assign(sourceQueueFilters.annotations,{family:'',topic:''});
    } else exState.benchmarkFilter='all';
  }
  if (route==='annotations') {
    exState.annotation=target?.kind==='annotation'?target.id:'';
    exState.sample=target?.kind==='sample'?target.id:'';
  } else {
    exState.benchmark=target?.kind==='benchmark'?target.id:'';
    if (exState.benchmark && target.item) exItemViews.set(exState.benchmark,target.item);
  }
}
function replaceReviewEntry(route,kind='',id='') {
  if (!isReviewDesk(route) || window.workspacePage!==route || location.hash!=='#'+route) return;
  history.replaceState({...history.state,review:reviewEntry(route,kind,id)},'');
}
function openAnnotationRecord(id) {
  return navigate('annotations',reviewEntry('annotations','annotation',id));
}
function openNewSampleAnnotation(id) {
  return navigate('annotations',reviewEntry('annotations','sample',id));
}
function openBenchmarkRecord(id) {
  return navigate('benchmarks',reviewEntry('benchmarks','benchmark',id));
}
async function returnReviewDirectory(route) {
  await navigate(route,reviewEntry(route));
  wb('[data-rd-query]')?.focus({preventScroll:true});
}
function exSamplePreview(sample, canCreate) {
  const evidence = (sample.evidence || []).map(exEvidenceCard).join('');
  return exPanel('待标注样本', '', `<div class="stack">
    <div class="ex-context"><h3>问题</h3><p>${exText(sample.question)}</p><h3>参考答案</h3><p>${exText(sample.answer)}</p></div>
    <details class="ex-history"><summary>样本来源与版本</summary><div class="ex-facts"><span><small>样本编号</small><strong class="ex-mono">${exText(sample.id)}</strong></span><span><small>训练批次</small><strong class="ex-mono">${exText(sample.batchId)}</strong></span><span><small>源文件版本</small><strong class="ex-mono">${exText(sample.versionId)}</strong></span></div></details>
    <section><h3>原文证据</h3>${evidence ? `<ul class="ex-evidence-list">${evidence}</ul>` : '<p class="muted">暂无关联证据</p>'}</section></div>`,canCreate ? exButton('开始标注','annotation-new',sample.id,{primary:true}) : '');
}

function cotTaskTitle(sample, question, resourceTitle) {
  const specimens = [...question.matchAll(/“([^”]+)”（[^）]+）/g)].map(match => match[1]);
  if (sample?.rule?.label && specimens.length) return specimens.join(' / ') + ' · ' + sample.rule.label;
  const field = question.match(/^(.+?)记录的(.+?)是什么[？?]$/);
  if (field) return (specimens[0] || field[1]) + ' · ' + field[2];
  const comparison = question.match(/^比较.+的(.+?)[。？]/);
  if (comparison && specimens.length) return specimens.join(' / ') + ' · ' + comparison[1];
  const short = question.replace(/^试样\s*(.+?)\s*的(.+?)分别是多少[？?]$/, '$1 · $2');
  return short || resourceTitle;
}
function cotMatches(query, text) {
  return query.trim().toLocaleLowerCase().split(/\s+/).every(word => text.toLocaleLowerCase().includes(word));
}
const reviewListState = {
  annotations:{page:1, query:''},
  benchmarks:{page:1, query:''},
  blueprints:{page:1, query:''}
};
const reviewOwnerNames = {operator:'数据管理员',annotator:'语料标注员','expert-a':'评审专家 A','expert-b':'评审专家 B',lead:'评测负责人',admin:'管理员'};
function reviewOwner(username) { return reviewOwnerNames[username] || username || '—'; }

function reviewListHeader(title, count, actions='') {
  return `<header class="rd-list-head"><h2>${exText(title)} <span>${count}</span></h2>${actions}</header>`;
}
function reviewRecordRow(cells,search,extra='') {
  return {search, html:`<tr data-rd-row data-rd-text="${exText(search)}"${extra}>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`};
}
function reviewListPage(key,rows) {
  const state=reviewListState[key];
  const matches=rows.filter(r=>cotMatches(state.query,r.search));
  const pages=Math.max(1,Math.ceil(matches.length/8));
  state.page=Math.min(pages,Math.max(1,state.page));
  replaceReviewEntry(key);
  const visible=new Set(matches.slice((state.page-1)*8,state.page*8));
  return {matches,pages,visible};
}
function reviewFooter(count,page,pages) {
  return `<span role="status">共 <b>${count}</b> 项</span><div><button type="button" data-rd-turn="-1" aria-label="上一页"${page===1?' disabled':''}>上一页</button><span>${page} / ${pages}</span><button type="button" data-rd-turn="1" aria-label="下一页"${page>=pages?' disabled':''}>下一页</button></div>`;
}
function reviewDirectory(key,headings,rows,searchLabel,controls='',tools='') {
  const state=reviewListState[key], {matches,pages,visible}=reviewListPage(key,rows);
  const rowHtml=rows.map(r=>visible.has(r)?r.html:r.html.replace('<tr ','<tr hidden ')).join('');
  return `<div class="rd-directory" data-rd-directory="${key}">${controls}
    <div class="rd-filters"><label class="rd-search"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/></svg><input type="search" data-rd-query aria-label="${exText(searchLabel)}" value="${exText(state.query)}" placeholder="${exText(searchLabel)}"></label>${tools}</div>
    <div class="rd-table-scroll"><table class="rd-table"><thead><tr>${headings.map(h=>`<th scope="col">${exText(h)}</th>`).join('')}</tr></thead><tbody>${rowHtml}</tbody></table></div>
    <p class="rd-empty" data-rd-empty${matches.length?' hidden':''}>没有匹配的记录</p>
    <footer class="rd-pagination" data-rd-footer>${reviewFooter(matches.length,state.page,pages)}</footer></div>`;
}
function reviewUpdateDirectory(root) {
  const key=root.dataset.rdDirectory, state=reviewListState[key];
  const rows=[...root.querySelectorAll('[data-rd-row]')].map(el=>({el,search:el.dataset.rdText}));
  const {matches,pages,visible}=reviewListPage(key,rows);
  for (const row of rows) row.el.hidden=!visible.has(row);
  root.querySelector('[data-rd-empty]').hidden=Boolean(matches.length);
  root.querySelector('[data-rd-footer]').innerHTML=reviewFooter(matches.length,state.page,pages);
}
document.addEventListener('input', event => {
  if (!event.target.matches('[data-rd-query]')) return;
  const root=event.target.closest('[data-rd-directory]'), state=reviewListState[root.dataset.rdDirectory];
  state.query=event.target.value;state.page=1;
  reviewUpdateDirectory(root);
});
document.addEventListener('click', event=>{
  const turn=event.target.closest('[data-rd-turn]');
  if (turn && !turn.disabled) {
    const root=turn.closest('[data-rd-directory]');
    reviewListState[root.dataset.rdDirectory].page+=Number(turn.dataset.rdTurn);
    reviewUpdateDirectory(root);
    const next=root.querySelector(`[data-rd-turn="${turn.dataset.rdTurn}"]:not(:disabled)`) || root.querySelector('[data-rd-turn]:not(:disabled)');
    next?.focus({preventScroll:true});
  }
});
function reviewNameButton(title, action, id) {
  return `<button type="button" class="rd-name" title="${exText(title)}" data-action="ex-${action}" data-id="${exText(id)}">${exText(title)}</button>`;
}
function reviewBack(label, action) {
  return `<div class="rd-detail-nav"><button type="button" class="rd-back" data-action="ex-${action}"><span aria-hidden="true">‹</span>${exText(label)}</button></div>`;
}
function reviewTabs(action,pairs,active) {
  return `<div class="rd-tabs" aria-label="状态筛选">${pairs.map(([key,label,count])=>`<button type="button" data-action="ex-${action}" data-id="${key}" aria-pressed="${key===active}">${exText(label)}<span>${count}</span></button>`).join('')}</div>`;
}
async function renderAnnotations() {
  const revision=workView;
  const [annotations,allSamples,resources]=await Promise.all([api('/api/annotations'),api('/api/samples'),api('/api/resources')]);
  if (revision!==workView) return '';
  const sampleById=new Map(allSamples.filter(s=>s.status==='passed').map(s=>[s.id,s]));
  const assigned=new Map(annotations.map(r=>[r.sampleId,r]));
  const pending=[...sampleById.values()].filter(s=>!assigned.has(s.id));
  let selected=annotations.find(r=>r.id===exState.annotation || r.sampleId===exState.sample);
  let requestedSample=selected ? null : sampleById.get(exState.sample);
  let detail;
  if (selected) {
    try { detail=await api('/api/annotations/'+exPath(selected.id)); }
    catch(error) {
      if (![403,404].includes(error.status)) throw error;
      selected=null;requestedSample=null;
    }
    if (revision!==workView) return '';
  }
  const canCreate=exAllowed('annotator','operator','lead','admin');
  const scope=sourceQueueView('annotations',resources,selected || requestedSample);
  if (selected || requestedSample) {
    exState.annotation=detail?.id || '';exState.sample=requestedSample?.id || '';
    replaceReviewEntry('annotations',detail?'annotation':'sample',detail?.id || requestedSample.id);
    exState.blocks=detail?.availableBlocks || [];scope.select(detail || requestedSample);
    return sectionHead('','领域专业思维链标注','')+reviewBack('返回标注队列','annotation-back')+
      '<div class="rd-detail">'+(detail?queuedAnnotationBody(detail,sampleById.get(detail.sampleId)):exSamplePreview(requestedSample,canCreate))+'</div>';
  }
  if (exState.annotation || exState.sample) notify('该记录已移除或当前岗位无权查看，已返回标注队列。');
  exState.annotation='';exState.sample='';exState.blocks=[];scope.select(null);
  const titles=new Map(resources.map(r=>[r.id,r]));
  const entries=[...annotations.map(rec=>({rec,sample:sampleById.get(rec.sampleId),status:rec.status})),...pending.map(sample=>({rec:sample,sample,status:'new'}))];
  const listed=workScopeRows(entries.map(e=>({...e,catalogTier:e.rec.catalogTier})), 'annotations');
  const sourceOf=e=>titles.get(e.rec.resourceId || e.sample?.resourceId);
  const scoped=listed.filter(e=>scope.matches(e.rec.resourceId || e.sample?.resourceId))
    .sort((a,b)=>workCaseRank(sourceOf(a))-workCaseRank(sourceOf(b)));
  const statuses=[['all','全部任务'],['new','待标注'],['draft','草稿'],['submitted','待复核'],['returned','已退回'],['approved','已通过']];
  const active=exState.annotationFilter;
  const tabs=reviewTabs('annotation-filter',statuses.map(([key,label])=>[key,label,key==='all'?scoped.length:scoped.filter(e=>e.status===key).length]),active);
  const rows=scoped.filter(e=>active==='all'||e.status===active).map(({rec,sample,status})=>{
    const source=titles.get(rec.resourceId || sample?.resourceId), resource=source?.title||rec.resourceTitle||'—';
    const question=sample?.question || rec.question || '';
    const name=source?.researchCase ? question : cotTaskTitle(sample,question,resource) || resource;
    const family=source?guideFamily(source):'';
    const action=status==='new'?'sample-select':'annotation-select';
    const statusLabel=status==='new'?'待标注':exStatus[status]?.[0]||status;
    return reviewRecordRow([reviewNameButton(name,action,rec.id),exText([resource,workSourceLabel(source)].filter(Boolean).join(' · ')),exText(family||'待归类'),exText(reviewOwner(status==='new'?'':rec.author)),
      status==='new'?'<span class="ex-badge ex-neutral">待标注</span>':exBadge(status)],
      [name,question,resource,family,rec.id,rec.sampleId,rec.author,statusLabel].filter(Boolean).join(' '));
  });
  const cls=sourceQueueFilters.annotations;
  const picker=`<details class="rd-more"><summary>分类筛选${cls.family||cls.topic?' · 已启用':''}</summary><div>${scope.controls(rows.length,entries.length,'项')}${cls.family||cls.topic?'<button type="button" class="rd-text-link" data-queue-clear="annotations">清除筛选</button>':''}</div></details>`;
  return sectionHead('','领域专业思维链标注','',canCreate?exButton('查看训练批次','page','batches'):'')+`<section class="rd-panel">${reviewListHeader('标注队列',listed.length,workScopeMenu('annotations'))}${reviewDirectory('annotations',['试样与标注任务','原文资料','材料门类','标注人','状态'],rows,'搜索试样、指标或工单编号',tabs,picker)}</section>`;
}

function exBenchmarkEditForm(resources, item, benchmarkId) {
  const versions = resources.find(resource => resource.id === item?.resourceId)?.versions || [];
  const displayVersion = versions.find(version => version.id === item?.versionId);
  return `<form class="stack ex-form" data-form="ex-item-save" data-id="${exText(benchmarkId)}" data-item-id="${exText(item?.id)}">
    <div class="grid-2"><label class="field">留出来源<select name="resourceId" data-ex-source required><option value="">请选择审核通过的留出资源</option>${resources.map(resource => `<option value="${exText(resource.id)}"${exSelected(resource.id===item?.resourceId)}>${exText(resource.title)} · ${exText(resource.id)}</option>`).join('')}</select></label><label class="field">资料版本<select name="versionId" data-ex-version required><option value="">请选择来源</option>${displayVersion ? `<option value="${exText(displayVersion.id)}" selected>${exText(displayVersion.filename)} · ${exText(displayVersion.id)}</option>`:''}</select></label></div>
    <div class="ex-picker-zone" data-ex-item-evidence><label class="field">原文证据</label>${exEvidenceGroup('itemBlock',item?.evidence || [],new Set(item?.blockIds || []),'请选择来源与版本。')}</div>
    <label class="field">题目分类<input name="category" required value="${exText(item?.category)}" maxlength="80"></label>
    <label class="field">评测问题<textarea name="question" required rows="2" maxlength="2000">${exText(item?.question)}</textarea></label>
    <label class="field">参考答案<textarea name="answer" required rows="2" maxlength="4000">${exText(item?.answer)}</textarea></label>
    <fieldset class="ex-review-form"><legend>评分维度</legend><div class="ex-rubric-edit" data-ex-rubric>${(item?.rubric?.length ? item.rubric : [{name:'事实与计算',max:4,description:'关键事实与推算结果均准确。'},{name:'证据引用',max:3,description:'引用与结论对应的原文位置。'},{name:'结论边界',max:3,description:'说明比较条件和结论的适用范围。'}]).map(exRubricRow).join('')}</div>
    ${exButton('增加维度','rubric-add','',{quiet:true})}</fieldset>
    <fieldset class="ex-review-form"><legend>待评候选答案</legend><div class="grid-2">${['A','B'].map((letter,index)=>`<label class="field">候选 ${letter}<textarea name="candidate" required rows="4" maxlength="4000">${exText(item?.candidates?.[index]?.answer)}</textarea></label>`).join('')}</div></fieldset>
    <div class="ex-form-actions"><button type="submit" class="btn primary">保存题目</button></div></form>`;
}
function exRubricRow(dimension = {}) {
  return `<div class="ex-rubric-row" data-ex-rubric-row><label class="field">评分项<input name="rubricName" value="${exText(dimension.name)}" required maxlength="80"></label><label class="field">分值上限<input name="rubricMax" value="${exText(dimension.max)}" type="number" min="1" max="100" required></label>${exButton('删除维度','rubric-remove','',{quiet:true,extra:' aria-label="删除这个评分维度"'})}<label class="field ex-rubric-description">给分要求<input name="rubricDescription" value="${exText(dimension.description)}" maxlength="1000"></label></div>`;
}
function exScoreGrid(item, edit) {
  const {rubric = [], candidates = [], result} = item;
  const labels = candidates.map((_, index) => String.fromCharCode(65 + index));
  const answers = candidates.map((candidate, index) => `<div><dt>${labels[index]}</dt><dd>${exText(candidate.answer)}</dd></div>`).join('');
  const showScores = edit || Boolean(result?.scores?.length);
  const max = rubric.reduce((sum, dimension) => sum + Number(dimension.max), 0);
  const rows = rubric.map((dimension, j) => {
    const cells = showScores ? labels.map((label, i) => {
      const field = `<input type="number" name="score-${i}-${j}" data-ex-candidate="${i}" min="0" max="${exText(dimension.max)}" aria-label="回答 ${label} 的${exText(dimension.name)}得分" required>`;
      return `<td>${edit ? field : exText(result?.scores?.[i]?.[j] ?? '—')}</td>`;
    }).join('') : '';
    return `<tr><th scope="row">${exText(dimension.name)}${dimension.description ? `<small>${exText(dimension.description)}</small>` : ''}</th><td>${exText(dimension.max)}</td>${cells}</tr>`;
  }).join('');
  const totals = showScores ? labels.map((_, i) => `<td>${edit ? `<output data-ex-total="${i}" aria-live="polite">—</output>` : exText(result?.scores?.[i]?.reduce((sum, n) => sum + Number(n), 0) ?? '—')}</td>`).join('') : '';
  return `<section class="ex-blind-sheet">${answers ? `<h4>候选回答</h4><dl class="ex-blind-answers">${answers}</dl>` : ''}<table class="ex-blind-scores"><thead><tr><th scope="col">评分标准</th><th scope="col">满分</th>${showScores ? labels.map(label => `<th scope="col">回答 ${label}</th>`).join('') : ''}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th scope="row">合计</th><td>${max}</td>${totals}</tr></tfoot></table></section>`;
}
function exScoresReview(item) {
  if (!item.reviews?.length) return '';
  return `<details class="ex-history"><summary>专家评分记录<span class="ex-caption">${item.reviews.length} 条可见</span></summary><ol>${item.reviews.map(review => `<li><div><strong>${exText(review.display || review.username)}</strong><time>${exText(exDate(review.at))}</time></div><p>候选 A ${exText(review.scores?.[0]?.join(' / '))} 分 · 候选 B ${exText(review.scores?.[1]?.join(' / '))} 分</p>${review.note ? `<p>${exText(review.note)}</p>`:''}</li>`).join('')}</ol></details>`;
}
function exDisagreement(item) {
  if (item.reviewState !== 'conflict' || item.reviews?.length !== 2) return '';
  const totals = item.reviews.map(review => review.scores.map(row => row.reduce((sum,value)=>sum+value,0)));
  const rows = totals.map((row,index) => `<tr><th scope="row">${exText(item.reviews[index].display || item.reviews[index].username)}</th><td>${row[0]}</td><td>${row[1]}</td></tr>`).join('');
  const ranking = totals.map(([a,b]) => Math.sign(a-b));
  const reason = ranking[0] !== ranking[1] ? '两位专家对候选回答的排序不同。' : '同一候选回答的总分差超过满分的 20%。';
  return `<section class="ex-disagreement"><h3>分歧核对</h3><p>${reason}</p><table><thead><tr><th>独立评审</th><th>候选 A 总分</th><th>候选 B 总分</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function exItemHandoff(benchmark, item, canReview, canArbitrate) {
  if (benchmark.status !== 'reviewing') return '';
  if (item.reviewState === 'conflict' && !canArbitrate) {
    return exHandoffRow('两份评分存在分歧，待未参与制题的评测负责人或管理员仲裁。',
      benchmark.owner === 'lead' ? '' : 'lead','benchmarks',benchmark.id,item.id);
  }
  if (item.reviewState !== 'pending' || canReview) return '';
  let reviewer = '';
  if (!item.reviewCount) reviewer = benchmark.owner === 'expert-a' ? 'expert-b' : 'expert-a';
  if (item.hasReviewed && exOwn('expert-a')) reviewer = 'expert-b';
  if (item.hasReviewed && exOwn('expert-b')) reviewer = 'expert-a';
  return exHandoffRow(item.reviewCount ? '待另一名专家独立评分。' : '本题已送审，待专家独立评分。',
    reviewer === benchmark.owner ? '' : reviewer,'benchmarks',benchmark.id,item.id);
}

function exBenchmarkItem(benchmark, item) {
  const canEdit = item.id !== benchmark.handoff?.itemId && benchmark.status === 'draft' && (exOwn(benchmark.owner) || exAllowed('lead','admin'));
  const canReview = benchmark.status === 'reviewing' && exAllowed('expert') && !item.hasReviewed && !exOwn(benchmark.owner) && item.reviewState === 'pending';
  const canArbitrate = benchmark.status === 'reviewing' && exAllowed('lead','admin') && !exOwn(benchmark.owner) && item.reviewState === 'conflict';
  const canFeedback = benchmark.status === 'published' && exAllowed('expert','lead','admin');
  const editType = canArbitrate ? 'arbitrate' : 'review';
  const scores = item.candidates?.length || item.rubric?.length ? exScoreGrid(item, canReview || canArbitrate) : '';
  const context = item.reviewState === 'pending' && benchmark.status === 'reviewing'
    ? (item.hasReviewed ? '本人评分已提交' : canReview ? '评分提交后锁定' : '') : '';
  const scoreForm = canReview || canArbitrate ? `<form class="ex-review-form stack" data-form="ex-item-${editType}" data-id="${exText(benchmark.id)}" data-item-id="${exText(item.id)}" data-rubric-count="${item.rubric.length}"><h3>${canArbitrate ? '仲裁定稿' : '独立盲评'}</h3>${scores}<label class="field">${canArbitrate ? '仲裁依据' : '评分意见'}<textarea name="note" rows="2" maxlength="2000" required></textarea></label><div class="ex-form-actions">${exSubmit(canArbitrate ? '提交仲裁' : '提交独立评分',editType)}</div></form>` : scores;
  const ref = item.answer ? `<details class="ex-history"><summary>参考答案与原文证据</summary><div class="ex-reference"><h4>参考答案</h4><p>${exText(item.answer)}</p>${item.evidence?.length ? `<ul class="ex-evidence-list">${item.evidence.map(exEvidenceCard).join('')}</ul>`:''}</div></details>` : '';
  const result = item.result ? `<div class="ex-context"><h3>${item.result.kind === 'arbitration' ? '仲裁结论' : '一致性结论'}</h3><p>${exText(item.result.note || '专家评分一致性达到发布条件。')}</p></div>` : '';
  const tools = `${canEdit ? exButton('编辑题目','item-edit',item.id,{extra:` data-benchmark-id="${exText(benchmark.id)}"`})+exButton('移除题目','item-remove',item.id,{extra:` data-benchmark-id="${exText(benchmark.id)}"`,quiet:true}) : ''}${canFeedback?exButton('创建语料补充任务','feedback-create',item.id,{extra:` data-benchmark-id="${exText(benchmark.id)}"`}):''}`;
  const progress = benchmark.status === 'reviewing' ? `<span>已评 ${exText(item.reviewCount ?? 0)} / 2</span>` : '';
  const source = `<details class="ex-history"><summary>试题编号与留出来源</summary><p class="ex-caption">试题 ${exText(item.id)} · 资源 ${exText(item.resourceId)} · 版本 ${exText(item.versionId)}</p></details>`;
  return `<article class="ex-benchmark-item stack"><div class="ex-line ex-item-meta"><span>${exText(item.category)}</span>${progress}${context ? `<span>${context}</span>` : ''}${benchmark.status !== 'draft' && item.reviewState !== 'pending' ? exBadge(item.reviewState) : ''}</div><h3>${exText(item.question)}</h3>
    ${exItemHandoff(benchmark,item,canReview,canArbitrate)}${exDisagreement(item)}${ref}${scoreForm}${source}${exScoresReview(item)}${result}${tools ? `<div class="ex-form-actions">${tools}</div>` : ''}</article>`;
}

function exCanProgressFeedback(ticket) {
  return ['open','in_progress'].includes(ticket.status) && exAllowed('operator','lead','admin') &&
    (!ticket.assignee || exOwn(ticket.assignee) || exAllowed('lead','admin'));
}
function exRegressionButton(entry) {
  if (!exAllowed('operator','lead','admin','expert')) return '';
  return exButton('同题回归复验','feedback-regression',entry.id);
}
function exFeedbackPanel(feedback, benchmark) {
  const rows = feedback.map(entry => {
    const canProgress = exCanProgressFeedback(entry);
    const progress = canProgress ? exButton(entry.status === 'open' ? '受理任务' : '记录处理结果','feedback-progress',entry.id,{primary:true}) : '';
    return `<article class="ex-feedback-entry"><div class="ex-line"><span class="ex-mono">${exText(entry.id)} · ${exText(entry.itemId)}</span>${exBadge(entry.status)}</div><h3>${exText(entry.title)}</h3><p>${exText(entry.description)}</p><div class="ex-line ex-item-meta"><span>训练资源 · ${exText(entry.trainingResourceId || '待关联')}${entry.trainingVersionId ? ` / ${exText(entry.trainingVersionId)}` : ''}${entry.trainingSampleId ? ` / ${exText(entry.trainingSampleId)}` : ''}</span><span>处理人 · ${exText(entry.assignee || '待认领')}</span></div>${entry.resultBatchId ? `<p class="ex-caption">验证批次 · ${exText(entry.resultBatchId)}</p>` : ''}${exHistory(entry.history,'处理记录')}<div class="ex-form-actions">${exRegressionButton(entry)}${progress}</div></article>`;
  }).join('');
  return exPanel('语料补充任务',benchmark?.title || '',`<div class="ex-feedback-list">${rows || exEmpty('暂无补充任务')}</div>`);
}
function exBenchmarkDetail(benchmark, feedback) {
  const draft = benchmark.status === 'draft';
  const published = benchmark.status === 'published';
  const canDraft = exOwn(benchmark.owner) || exAllowed('lead','admin');
  const accepted = benchmark.items.filter(item => item.reviewState === 'accepted').length;
  const unresolved = benchmark.items.filter(item=>item.reviewState === 'conflict').length;
  const canPublish = !draft && !published && exAllowed('lead','admin') && benchmark.items.length > 0 && accepted === benchmark.items.length;
  const awaitFreeze = benchmark.status === 'reviewing' && benchmark.items.length && accepted === benchmark.items.length && !canPublish;
  const toolbar = draft && canDraft ? exButton('添加留出题','item-add',benchmark.id,{primary:true}) + exButton('提交专家盲评','benchmark-submit',benchmark.id,{disabled:!benchmark.items.length})
    : canPublish ? exButton('冻结并发布','benchmark-publish',benchmark.id,{primary:true})
    : published && !exAllowed('annotator') ? exButton('导出基准 JSON','benchmark-export',benchmark.id,{primary:true}) : '';
  const agreement = !draft && exAllowed('lead','admin') ? `<button type="button" class="btn" data-review-agreement="${exText(benchmark.id)}">双评一致性</button>` : '';
  const stage = draft ? 0 : published || accepted === benchmark.items.length ? 3 : unresolved ? 2 : 1;
  const stages = ['题目构建','独立盲评','分歧仲裁','冻结发布'];
  const relevant = feedback.filter(entry => entry.benchmarkId === benchmark.id);
  const chosen = benchmark.items.find(item => item.id === exItemViews.get(benchmark.id)) || benchmark.items.find(item => item.reviewState === 'conflict' || (item.reviewState === 'pending' && !item.hasReviewed)) || benchmark.items[0];
  const topicNav = benchmark.items.length > 1 ? `<div class="ex-item-nav">${benchmark.items.map((item,i)=>exButton('题 '+(i+1),'item-select',item.id,{extra:` aria-pressed="${item.id === chosen.id}"`})).join('')}</div>` : '';
  const spec = benchmark.blueprint;
  const design = spec ? `<h4>组卷蓝图 · 修订 ${exText(spec.revision)}</h4>${workTable(['材料门类','考查专题','设计题量'],spec.targets.map(t=>[exText(t.family),exText(t.topic),exText(t.quota)]))}` : '';
  const h = benchmark.handoff;
  const origin = h ? `<div class="ex-context"><h3>来源标注</h3><p>${exText(h.resourceTitle || h.annotationId)}${h.holdoutTitle?'　→　'+exText(h.holdoutTitle):''}</p>${h.transferReason?'<p>跨门类依据　'+exText(h.transferReason)+'</p>':''}${exButton('查看办理进度','handoff-trail',h.resourceId,{extra:` data-version="${exText(h.versionId)}" data-sample="${exText(h.sampleId)}"`})}</div>` : '';
  const metadata = `<details class="ex-history"><summary>基准信息</summary><p>${benchmark.description ? exText(benchmark.description) + ' · ' : ''}编号 ${exText(benchmark.id)} · 命题人 ${exText(benchmark.owner)}${benchmark.version ? ' · 版本 ' + exText(benchmark.version) : ''}</p>${design}</details>`;
  const content = `<div class="stack" data-ex-item-browser="${exText(benchmark.id)}"><div class="ex-benchmark-overview"><ol class="ex-stages hitl-stages" aria-label="评测流程">${stages.map((label,index)=>`<li${index === stage?' aria-current="step"':''}><span>${index+1}</span>${label}</li>`).join('')}</ol></div>
  ${awaitFreeze ? exHandoffRow('全部试题已定稿，待评测负责人冻结并发布基准。','lead','benchmarks',benchmark.id,chosen?.id) : ''}${origin}${topicNav}${benchmark.items.map(item => `<div data-ex-item-pane="${exText(item.id)}"${item.id !== chosen.id ? ' hidden' : ''}>${exBenchmarkItem(benchmark,item)}</div>`).join('') || exEmpty('暂无评测题')}${metadata}${exHistory(benchmark.history)}</div>`;
  return `${exPanel(benchmark.title,'',content,(toolbar || agreement) ? `<div class="ex-form-actions">${agreement}${toolbar}</div>` : '')}${published || relevant.length ? exFeedbackPanel(relevant,benchmark) : ''}`;
}
async function renderBenchmarks() {
  const revision=workView;
  const [allBenchmarks,resources]=await Promise.all([api('/api/benchmarks'),api('/api/resources')]);
  if (revision!==workView) return '';
  const benchmarks=workScopeRows(allBenchmarks,'benchmarks');
  const selected=allBenchmarks.find(item=>item.id===exState.benchmark);
  let detail;
  if (selected) {
    try { detail=await api('/api/benchmarks/'+exPath(selected.id)); }
    catch(error) { if (![403,404].includes(error.status)) throw error; }
    if (revision!==workView) return '';
  }
  if (detail) {
    const feedback=await api('/api/feedback');
    if (revision!==workView) return '';
    replaceReviewEntry('benchmarks','benchmark',detail.id);
    const auto=exAllowed('operator','lead','admin') || (exAllowed('expert') && detail.status==='published') ? exButton('多维自动评测','evaluation-open',detail.id) : '';
    return sectionHead('','基准评审与发布','',auto)+reviewBack('返回基准目录','benchmark-back')+`<div class="rd-detail">${exBenchmarkDetail(detail,feedback)}</div>`;
  }
  if (exState.benchmark) notify('该记录已移除或当前岗位无权查看，已返回基准目录。');
  exState.benchmark='';
  const active=exState.benchmarkFilter, states=[['all','全部基准'],['draft','草稿'],['reviewing','评审中'],['published','已发布']];
  const tabs=reviewTabs('benchmark-filter',states.map(([key,label])=>[key,label,key==='all'?benchmarks.length:benchmarks.filter(item=>item.status===key).length]),active);
  const rows=benchmarks.filter(item=>active==='all'||item.status===active).map(item=>{
    const items=item.items||[],ready=items.filter(q=>q.reviewState==='accepted').length;
    const stages={draft:'待送审',reviewing:ready+' / '+items.length+' 题定稿',published:'已冻结'};
    return reviewRecordRow([reviewNameButton(item.title,'benchmark-select',item.id),String(items.length),exText(stages[item.status]||'—'),exText(reviewOwner(item.owner)),exBadge(item.status)],
      [item.title,item.id,item.owner,reviewOwner(item.owner),item.version,item.description].filter(Boolean).join(' '));
  });
  const create=exAllowed('operator','lead','admin')?exButton('新建评测基准','benchmark-new','',{primary:true}):'';
  const sources=workScopeRows(resources,'benchmarks').filter(r=>r.split==='holdout' && r.researchCase && !workCan('annotator')).sort((a,b)=>workCaseRank(a)-workCaseRank(b));
  const papers=sources.length ? '<section class="rd-panel">'+reviewListHeader('科研留出文献',sources.length)+workTable(['文献摘录','制题进度'],sources.map(r=>{
    const b=allBenchmarks.find(item=>item.items?.some(i=>i.resourceId===r.id));
    return [workBtn(r.title,'resource-open',r.id),b?reviewNameButton(b.title,'benchmark-select',b.id):exButton('查看标注与制题条件','paper-handoff',r.researchCase==='sic-solvent-growth-v1'?'crystal':'research')];
  }))+'</section>' : '';
  return sectionHead('','基准评审与发布','',create)+papers+`<section class="rd-panel">${reviewListHeader('基准目录',benchmarks.length,workScopeMenu('benchmarks'))}${reviewDirectory('benchmarks',['评测基准','题数','评审进度','命题人','状态'],rows,'搜索基准名称或编号',tabs)}</section>`;
}

async function exLoadResourceVersions(form, preserveVersion = '', selection = []) {
  const resourceId = form.elements.resourceId.value;
  const versionSelect = form.elements.versionId;
  const evidence = form.querySelector('[data-ex-item-evidence]');
  const requestId = String(Number(form.dataset.requestId || 0) + 1);
  form.dataset.requestId = requestId;
  if (!resourceId) {
    versionSelect.innerHTML = '<option value="">请先选择来源</option>';
    evidence.innerHTML = '<p class="muted">请选择来源与版本。</p>';
    return;
  }
  versionSelect.disabled = true;
  evidence.innerHTML = '<p class="muted">正在读取版本和证据块…</p>';
  try {
    const resource = await api(`/api/resources/${exPath(resourceId)}`);
    if (form.dataset.requestId !== requestId) return;
    const versions = resource.versions.filter(version => version.status === 'approved' && (form.dataset.form !== 'ex-handoff-manual' || version.id === resource.activeVersion));
    const version = versions.find(row=>row.id===preserveVersion) || versions.find(row=>row.id===resource.activeVersion) || versions.at(-1);
    versionSelect.innerHTML = version ? versions.map(row=>`<option value="${exText(row.id)}"${exSelected(row.id===version.id)}>${exText(row.filename)} · ${exText(row.id)}</option>`).join('') : '<option value="">暂无已审核的版本</option>';
    evidence.innerHTML = `<div class="ex-line"><strong>原文证据</strong><span class="ex-caption">${exText(version?.blocks?.length ?? 0)} 个证据块</span></div>${exEvidenceGroup('itemBlock',version?.blocks || [], new Set(selection))}`;
  } catch (error) {
    if (form.dataset.requestId !== requestId) return;
    versionSelect.innerHTML = '<option value="">读取失败</option>';
    evidence.innerHTML = `<p class="muted">${exText(error.message)}</p>`;
  } finally {
    if (form.dataset.requestId === requestId) versionSelect.disabled = false;
  }
}
async function exShowItemEditor(benchmarkId, itemId = '') {
  const resourcesPromise = api('/api/resources');
  const itemPromise = itemId ? api(`/api/benchmarks/${exPath(benchmarkId)}`).then(benchmark => benchmark.items.find(item=>item.id===itemId)) : null;
  const [rawResources, item] = await Promise.all([resourcesPromise,itemPromise]);
  const resources = workSourceChoices(rawResources,'benchmarks',item?.resourceId).filter(resource => resource.split === 'holdout' && resource.versions.some(version=>version.status==='approved'));
  if (!resources.length) {
    openModal('添加留出题',exEmpty('缺少可用的留出资料','添加题目需要已核准的留出版本。',exButton('前往资源目录','page','resources',{primary:true})));
    return;
  }
  openModal(item ? '编辑基准题' : '添加独立留出题',exBenchmarkEditForm(resources,item,benchmarkId));
  const form = document.querySelector('form[data-form="ex-item-save"]');
  if (item) await exLoadResourceVersions(form,item.versionId,item.blockIds || []);
}
function exBenchmarkModal() {
  openModal('新建评测基准',`<form class="stack ex-form" data-form="ex-benchmark-create"><label class="field">基准名称<input name="title" required maxlength="120"></label><label class="field">评测目标<textarea name="description" rows="3" maxlength="2000"></textarea></label><div class="ex-form-actions"><button type="submit" class="btn primary">创建基准</button></div></form>`);
}
async function exFeedbackModal(benchmarkId, itemId) {
  const [allResources, allSamples] = await Promise.all([api('/api/resources'),api('/api/samples')]);
  const resources = workSourceChoices(allResources,'benchmarks').filter(resource => resource.split === 'train');
  const samples = workScopeRows(allSamples,'benchmarks').filter(sample => sample.status === 'passed');
  openModal('创建语料补充任务',`<form class="stack ex-form" data-form="ex-feedback-new" data-id="${exText(benchmarkId)}" data-item-id="${exText(itemId)}">
  <label class="field">任务标题<input name="title" maxlength="120" required></label><label class="field">问题描述与验收要求<textarea name="description" rows="3" required maxlength="2000"></textarea></label>
  <div class="grid-2"><label class="field">关联训练资源<select name="trainingResourceId" data-ex-feedback-source><option value="">暂不关联</option>${resources.map(resource=>`<option value="${exText(resource.id)}">${exText(resource.title)} · ${exText(resource.id)}</option>`).join('')}</select></label><label class="field">关联质检通过样本（可选）<select name="trainingSampleId" data-ex-feedback-sample><option value="">暂不关联</option>${samples.map(sample=>`<option value="${exText(sample.id)}" data-resource-id="${exText(sample.resourceId)}">${exText(sample.id)} · ${exText(sample.question)}</option>`).join('')}</select></label></div><label class="field">负责人账号（可选）<input name="assignee" placeholder="留空时由运营认领"></label>
  <div class="ex-form-actions"><button type="submit" class="btn primary">创建补充任务</button></div></form>`);
}
async function openFeedbackRecord(ticketId) {
  const ticket = await api(`/api/feedback/${exPath(ticketId)}`);
  const summary = `<div class="ex-context"><div class="ex-line"><strong class="ex-mono">${exText(ticket.id)}</strong>${exBadge(ticket.status)}</div>
    <h3>${exText(ticket.title)}</h3><p>${exText(ticket.description)}</p>
    <div class="ex-item-meta">处理人 · ${exText(ticket.assignee || '待认领')}</div></div>`;
  if (!exCanProgressFeedback(ticket)) {
    const result = ticket.resolution ? `<div><h3>处理结果</h3><p>${exText(ticket.resolution)}</p></div>` : '';
    openModal('语料补充任务',`<div class="stack">${summary}${result}${exHistory(ticket.history,'处理记录')}<div>${exRegressionButton(ticket)}</div></div>`);
    return;
  }

  const closing = ticket.status === 'in_progress';
  const needsCheck = closing && ticket.requiresRegression && !ticket.regressions?.length;
  let batchField = '';
  if (closing) {
    const batches = await api('/api/batches');
    const eligible = batches.filter(batch => batch.status === 'reviewed' && batch.counts?.passed > 0 &&
      batch.id !== ticket.trainingBatchId && batch.createdAt >= ticket.createdAt &&
      (!ticket.trainingResourceId || batch.resourceId === ticket.trainingResourceId));
    batchField = `<label class="field">关联补充批次（可选）<select name="resultBatchId"><option value="">不关联批次</option>${eligible.map(batch=>`<option value="${exText(batch.id)}">${exText(batch.title || batch.id)}</option>`).join('')}</select></label>`;
  }
  openModal(closing ? '关闭语料补充任务' : '受理语料补充任务',`<form class="stack ex-form" data-form="ex-feedback-update" data-id="${exText(ticket.id)}" data-next="${closing ? 'resolved' : 'in_progress'}">
    ${summary}${closing ? `<div class="ex-line"><span>${ticket.regressions?.length ? '已归档复验 ' + ticket.regressions.length + ' 次' : (needsCheck ? '本题已配置计分规则，请先归档同题复验。' : '人工验收，请填写核对的原文和处理结论。')}</span>${exRegressionButton(ticket)}</div>` : ''}<label class="field">${closing ? '处理结果与验收依据' : '受理说明'}<textarea name="note" ${closing ? 'required' : ''} rows="3" maxlength="3000"></textarea></label>${batchField}
    <div class="ex-form-actions"><button type="submit" class="btn primary"${needsCheck ? ' disabled' : ''}>${closing ? '记录结果并关闭' : '确认受理'}</button></div></form>`);
}
function exConfirm(title, description, action, id, itemId = '') {
  openModal(title,`<form class="stack ex-form" data-form="ex-${action}" data-id="${exText(id)}" data-item-id="${exText(itemId)}"><p>${exText(description)}</p><div class="ex-form-actions"><button type="submit" class="btn primary">${exText(title)}</button></div></form>`);
}
async function expertUiAction(action, el) {
  if (action?.startsWith('ex-evaluation-')) return evalAction(action,el);
  if (!action?.startsWith('ex-')) return false;
  const {id, benchmarkId} = el.dataset;
  switch (action) {
    case 'ex-paper-handoff': {
      const c=await api(id==='crystal'?'/api/crystal-case':'/api/research-case');
      if(c.benchmarkId) await openBenchmarkRecord(c.benchmarkId);
      else if(c.annotationId) {
        const annotation=await api('/api/annotations/'+exPath(c.annotationId));
        if(annotation.status==='approved') await openAnnotationBenchmarkHandoff(c.annotationId);
        else await openAnnotationRecord(c.annotationId);
      }
      break;
    }
    case 'ex-handoff-trail': await openCaseTrail(id,el.dataset.version,el.dataset.sample); break;
    case 'ex-next-role': {
      const {receiver, section, itemId} = el.dataset;
      if (!window.workspaceUser?.meeting || !exHandoffRoles.includes(receiver)) throw new Error('请联系承办岗位接续办理');
      if (!['annotations','benchmarks'].includes(section)) break;
      window.workspaceUser = await api('/api/meeting/role','POST',{username:receiver});
      if (section === 'annotations') await openAnnotationRecord(id);
      else {
        if (itemId) exItemViews.set(id,itemId);
        await openBenchmarkRecord(id);
      }
      break;
    }
    case 'ex-handoff-operator':
      if (!window.workspaceUser?.meeting) throw new Error('请由数据管理员接续办理');
      window.workspaceUser=await api('/api/meeting/role','POST',{username:'operator'});
      closeModal();
      await openAnnotationRecord(id);
      await openAnnotationBenchmarkHandoff(id);
      break;
    case 'ex-annotation-handoff': await openAnnotationBenchmarkHandoff(id); break;
    case 'ex-handoff-manual': await openAnnotationBenchmarkHandoff(id,true); break;
    case 'ex-page': closeModal(); await navigate(id); break;
    case 'ex-annotation-back': await returnReviewDirectory('annotations');break;
    case 'ex-annotation-filter': exState.annotationFilter=id;reviewListState.annotations.page=1;await refresh();break;
    case 'ex-benchmark-back': await returnReviewDirectory('benchmarks');break;
    case 'ex-annotation-select': await openAnnotationRecord(id); break;
    case 'ex-sample-select': await openNewSampleAnnotation(id); break;
    case 'ex-annotation-new': {
      const annotation = await api('/api/annotations','POST',{sampleId:id});
      exState.annotation = annotation.id;
      exState.sample = '';
      exState.annotationFilter = 'all';
      await refresh();
      notify('标注草稿已建立');
      break;
    }
    case 'ex-step-select': {
      const form = el.closest('form');
      exSyncEditor(form,Number(id));
      form.querySelector('.ex-step-nav [aria-current="step"]').focus();
      break;
    }
    case 'ex-item-select': {
      const panel = el.closest('[data-ex-item-browser]');
      exItemViews.set(panel.dataset.exItemBrowser,id);
      replaceReviewEntry('benchmarks','benchmark',panel.dataset.exItemBrowser);
      for (const section of panel.querySelectorAll('[data-ex-item-pane]')) section.hidden = section.dataset.exItemPane !== id;
      for (const button of panel.querySelectorAll('[data-action="ex-item-select"]')) button.setAttribute('aria-pressed',String(button.dataset.id === id));
      break;
    }
    case 'ex-step-add': {
      const steps = el.closest('form').querySelector('.ex-step-grid');
      if (steps.children.length >= 20) { notify('推理步骤已达到 20 条','error'); break; }
      steps.insertAdjacentHTML('beforeend',exStepDraft({kind:exKinds[1],text:'',blockIds:[]},steps.children.length,exState.blocks));
      exSyncEditor(steps.closest('form'),steps.children.length - 1,true);
      steps.lastElementChild.querySelector('select').focus();
      break;
    }
    case 'ex-step-remove': {
      const step = el.closest('[data-ex-step]');
      const steps = step.parentElement;
      if (steps.children.length <= 2) { notify('请保留至少两步推理','error'); break; }
      step.remove();
      Array.from(steps.querySelectorAll('[data-ex-step-number]')).forEach((number,index)=>{ number.textContent=String(index+1).padStart(2,'0'); });
      exSyncEditor(steps.closest('form'),steps.children.length - 1,true);
      steps.lastElementChild.querySelector('select').focus();
      break;
    }
    case 'ex-annotation-export': downloadJson(`${id}-CoT.json`,await api(`/api/annotations/${exPath(id)}/export`)); break;
    case 'ex-benchmark-filter': reviewListState.benchmarks.page = 1; exState.benchmarkFilter = id; exState.benchmark = ''; await refresh(); break;
    case 'ex-benchmark-select': await openBenchmarkRecord(id); break;
    case 'ex-benchmark-new': exBenchmarkModal(); break;
    case 'ex-item-add': await exShowItemEditor(id); break;
    case 'ex-item-edit': await exShowItemEditor(benchmarkId,id); break;
    case 'ex-item-remove': exConfirm('移除题目','确认从当前基准移除此题？','item-remove-confirm',benchmarkId,id); break;
    case 'ex-benchmark-submit': exConfirm('提交专家盲评','送审后将锁定题目和评分规则。','benchmark-submit-confirm',id); break;
    case 'ex-benchmark-publish': exConfirm('冻结并发布','确认冻结题目、原文证据及评分结果？','benchmark-publish-confirm',id); break;
    case 'ex-benchmark-export': {
      const snapshot = await api(`/api/benchmarks/${exPath(id)}/export`);
      downloadJson(`${id}-${snapshot.version || 'published'}.json`,snapshot);
      break;
    }
    case 'ex-feedback-create': await exFeedbackModal(benchmarkId,id); break;
    case 'ex-feedback-progress': await openFeedbackRecord(id); break;
    case 'ex-feedback-regression': await evalRegressionDesk(id); break;
    case 'ex-feedback-regression-review': await evalRegressionReview(id,el.dataset.before,el.dataset.after); break;
    case 'ex-feedback-regression-file': await evalRegressionReview(id,el.dataset.before,el.dataset.after,true); break;
    case 'ex-rubric-add': {
      const field = el.closest('fieldset').querySelector('[data-ex-rubric]');
      if (field.children.length >= 8) { notify('评分维度已达到 8 项', 'error'); break; }
      field.insertAdjacentHTML('beforeend',exRubricRow());
      field.lastElementChild.querySelector('input').focus();
      break;
    }
    case 'ex-rubric-remove': {
      const row = el.closest('[data-ex-rubric-row]');
      if (row.parentElement.children.length === 1) { notify('请保留至少一个评分维度','error'); break; }
      row.remove();
      break;
    }
    default: return false;
  }
  return true;
}
function exTrim(data,name) { return String(data.get(name) || '').trim(); }
function exRequired(value, message) { if (!value) throw new Error(message); return value; }
async function expertUiSubmit(form, submitter) {
  if (form.dataset.form === 'ex-evaluation-run') return evalSubmit(form);
  if (form.dataset.form === 'ex-feedback-regression') return evalRegressionReview(form.dataset.id,form.elements.before.value,form.elements.after.value);
  const {form: action, id, itemId, next, rubricCount} = form.dataset;
  if (!action?.startsWith('ex-')) return false;
  const data = new FormData(form);
  const intent = submitter?.value || form.querySelector('button[type="submit"].primary')?.value;
  const benchmarkPath = `/api/benchmarks/${exPath(id)}`;
  let message = '';
  let close = false;
  switch (action) {
    case 'ex-annotation-edit': {
      const steps = exStepValues(form);
      if (!['submit','save'].includes(intent)) throw new Error('请尝试用保存草稿或提交专家复核按钮。');
      if (intent === 'submit' && (steps.length < 2 || steps.some(step=>!step.text||!step.blockIds.length))) throw new Error('请填写每个推理步骤，并选择至少一个原文证据块。');
      const materialCriteria = exCriteriaValues(form);
      if (intent === 'submit') {
        for (const [key,value] of Object.entries(materialCriteria)) {
          if (Boolean(value.text) === Boolean(value.blockIds.length)) continue;
          const row = form.querySelector(`[data-material-criterion="${key}"]`);
          row.closest('.ex-material-criteria').open = true;
          row.querySelector('.ex-evidence-picker').open = true;
          row.scrollIntoView({block:'nearest'});
          throw new Error(`请为“${exCriteriaLabels[key]}”填写陈述并勾选原文，或将两项均留空。`);
        }
      }
      await api(`/api/annotations/${exPath(id)}/${intent}`,'POST',{steps,materialCriteria});
      message = intent === 'save' ? '标注草稿已保存' : '标注已提交专家复核';
      break;
    }
    case 'ex-annotation-review': {
      if (!['return','approve'].includes(intent)) throw new Error('请选择退回修改或通过复核。');
      const note = exTrim(data,'note');
      if (intent === 'return') exRequired(note,'退回修改时请填写复核意见。');
      await api(`/api/annotations/${exPath(id)}/${intent}`,'POST',{note});
      message = intent === 'return' ? '标注已退回修改' : '标注已通过复核';
      break;
    }
    case 'ex-benchmark-create': {
      const benchmark = await api('/api/benchmarks','POST',{title:exTrim(data,'title'),description:exTrim(data,'description')});
      closeModal();
      await openBenchmarkRecord(benchmark.id);
      notify('评测基准已创建');
      return true;
    }
    case 'ex-handoff-prepare': return exFinishHandoff(form,data);
    case 'ex-handoff-manual':
    case 'ex-item-save': {
      const blockIds = data.getAll('itemBlock');
      if (!blockIds.length) throw new Error('请为评测题选择至少一个留出证据块。');
      const rubric = data.getAll('rubricName').map((name,index)=>({name:name.trim(),max:Number(data.getAll('rubricMax')[index]),description:data.getAll('rubricDescription')[index].trim()}));
      const candidates = data.getAll('candidate').map(answer=>({answer:answer.trim()}));
      const itemPayload = {id:itemId || undefined,resourceId:exTrim(data,'resourceId'),versionId:exTrim(data,'versionId'),blockIds,question:exTrim(data,'question'),answer:exTrim(data,'answer'),category:exTrim(data,'category'),rubric,candidates};
      if (action==='ex-handoff-manual') return exFinishHandoff(form,data,itemPayload);
      await api(`${benchmarkPath}/items`,'POST',itemPayload);
      close = true;
      message = '留出题及评分维度已保存';
      break;
    }
    case 'ex-item-remove-confirm': await api(`${benchmarkPath}/remove-item`,'POST',{itemId}); close = true; message = '题目已从草稿移除'; break;
    case 'ex-benchmark-submit-confirm': await api(`${benchmarkPath}/submit`,'POST',{}); close = true; message = '基准已提交专家盲评'; break;
    case 'ex-benchmark-publish-confirm': await api(`${benchmarkPath}/publish`,'POST',{}); close = true; message = '评测基准版本已冻结并发布'; break;
    case 'ex-item-review':
    case 'ex-item-arbitrate': {
      const scores = [0,1].map(i=>Array.from({length:Number(rubricCount)},(_,j)=>Number(exRequired(exTrim(data,`score-${i}-${j}`),'请填写每一项分值。'))));
      const mode = action === 'ex-item-review' ? 'review' : 'arbitrate';
      await api(`${benchmarkPath}/${mode}`,'POST',{itemId,scores,note:exTrim(data,'note')});
      message = mode === 'review' ? '独立评分已提交' : '仲裁结果已定稿';
      break;
    }
    case 'ex-feedback-new': {
      await api('/api/feedback','POST',{benchmarkId:id,itemId,title:exTrim(data,'title'),description:exTrim(data,'description'),trainingResourceId:exTrim(data,'trainingResourceId') || undefined,trainingSampleId:exTrim(data,'trainingSampleId') || undefined,assignee:exTrim(data,'assignee') || undefined});
      close = true;
      message = '语料补充任务已创建';
      break;
    }
    case 'ex-feedback-update': {
      await api(`/api/feedback/${exPath(id)}/progress`,'POST',{status:next,note:exTrim(data,'note'),resultBatchId:exTrim(data,'resultBatchId') || undefined});
      close = true;
      message = next === 'in_progress' ? '补充任务已受理' : '补充任务已关闭';
      break;
    }
    default: return false;
  }
  if (close) closeModal();
  await refresh();
  if (message) notify(message);
  return true;
}

document.addEventListener('change', event => {
  const target = event.target;
  const itemForm = target.closest('form[data-form="ex-item-save"],form[data-form="ex-handoff-manual"]');
  if (itemForm && target.matches('[data-ex-source]')) void exLoadResourceVersions(itemForm);
  if (itemForm && target.matches('[data-ex-version]')) void exLoadResourceVersions(itemForm,target.value);
  if (target.matches('[data-ex-feedback-source]')) {
    const sampleSelect = target.form.elements.trainingSampleId;
    if (sampleSelect.selectedOptions[0]?.dataset.resourceId && target.value && sampleSelect.selectedOptions[0].dataset.resourceId !== target.value) sampleSelect.value = '';
    for (const option of sampleSelect.options) option.hidden = Boolean(option.value && target.value && option.dataset.resourceId !== target.value);
  }
  if (target.matches('input[type="checkbox"][name="blockId"],input[type="checkbox"][name="criterionBlock"]')) {
    const details = target.closest('.ex-evidence-picker');
    if (!details) return;
    details.querySelector('[data-ex-evidence-count]').textContent = `${details.querySelectorAll('input:checked').length} 项已选`;
  }
});

document.addEventListener('input', event => {
  const form = event.target.closest('form[data-form="ex-annotation-edit"]');
  if (form) exSyncEditor(form,undefined,true);
  const candidate = event.target.dataset.exCandidate;
  if (candidate === undefined) return;
  const sheet = event.target.closest('.ex-blind-sheet');
  const fields = Array.from(sheet.querySelectorAll(`input[data-ex-candidate="${candidate}"]`));
  const output = sheet.querySelector(`[data-ex-total="${candidate}"]`);
  const filled = fields.filter(input => input.value !== '' && input.validity.valid);
  output.textContent = filled.length === fields.length
    ? String(filled.reduce((sum, input) => sum + Number(input.value), 0))
    : filled.length + '/' + fields.length + ' 项';
});

// Reset the design desk when entered from a module link.
document.addEventListener('click',event=>{
  const link=event.target.closest('[data-action="nav"]');
  if (!link) return;
  const route=link.dataset.id;
  if(route==='benchmark-work')benchmarkPreparation.reset();
},true);
