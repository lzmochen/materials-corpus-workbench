'use strict';

const evalModes = { keywords: '关键要点匹配', numeric: '数值与单位', exact: '参考答案全文匹配' };
const evalRunUrl = (id, run = '') => '/api/benchmarks/' + exPath(id) + '/auto-evaluation' + (run ? '/' + exPath(run) : '');

function evalOptions(options, selected) {
  return Object.entries(options).map(([key, label]) =>
    `<option value="${exText(key)}"${key === selected ? ' selected' : ''}>${exText(label)}</option>`
  ).join('');
}

function evalQuestionForm(item, number, topics) {
  const rule = item.rule;
  const numberField = (label, key, value, min) =>
    `<label class="field">${label}<input type="number" step="any" ${min ? 'min="0"' : ''} name="${key}" value="${exText(value)}"></label>`;
  return `<details class="ge-question" data-ge-item="${exText(item.itemId)}"${number === 0 ? ' open' : ''}>
    <summary><span class="ge-index">${number + 1}</span><strong>${exText(item.question)}</strong></summary>
    <div class="ge-body">
      <p class="ge-reference"><strong>参考答案</strong>${exText(item.reference)}</p>
      <div class="ge-pair">
        <label class="field">评测专题<select name="topic">${evalOptions(Object.fromEntries(topics.map(t => [t,t])),rule.topic)}</select></label>
        <label class="field">计分方法<select name="mode">${evalOptions(evalModes,rule.mode)}</select></label>
      </div>
      <div data-ge-mode="keywords"${rule.mode === 'keywords' ? '' : ' hidden'}>
        <div class="ge-pair"><label class="field">关键要点（每行一项）<textarea name="keywords" rows="2">${exText((rule.keywords || []).join('\n'))}</textarea></label>
        <label class="field">排除词（可选，每行一项）<textarea name="forbidden" rows="2">${exText((rule.forbidden || []).join('\n'))}</textarea></label></div>
        <p class="ge-hint">按要点字面命中比例计分。命中任一排除词计 0 分。</p>
      </div>
      <div data-ge-mode="numeric"${rule.mode === 'numeric' ? '' : ' hidden'}>
        <div class="ge-values">${numberField('参考值','expected',rule.expected ?? '',false)}${numberField('绝对容差','tolerance',rule.tolerance ?? 0,true)}
          <label class="field">单位<input name="unit" maxlength="32" value="${exText(rule.unit || '')}" placeholder="无量纲可留空"></label></div>
        <p class="ge-hint">取最后一个带指定单位的数值，偏差在容差内计 100 分。单位区分大小写；无量纲取最后一个数值。</p>
      </div>
      <p data-ge-mode="exact" class="ge-hint"${rule.mode === 'exact' ? '' : ' hidden'}>统一全半角、大小写并移除空白后比较全文，一致计 100 分。</p>
      <div class="ge-pair">${item.answers.map((value,index) => `<label class="field">待测答案 ${index ? 'B' : 'A'}<textarea name="answer${index}" rows="3" maxlength="6000">${exText(value)}</textarea></label>`).join('')}</div>
    </div></details>`;
}

async function evalOpen(id, ticket = '', focus = '') {
  const [config,desk,library] = await Promise.all([api(evalRunUrl(id)),ticket ? api(evalRegressionUrl(ticket)) : null,api(metricProfilesPath)]);
  if (desk && (desk.benchmarkId !== id || desk.itemId !== focus)) throw new Error('工单与当前评测题不匹配。');
  const assigned = config.items.find(q=>q.itemId === focus);
  if (assigned && desk?.rule) assigned.rule = desk.rule;
  const ordered = focus ? [...config.items].sort((a,b)=>Number(b.itemId === focus)-Number(a.itemId === focus)) : config.items;
  const hasBaseline = config.runs.some(r=>r.benchmarkVersion === config.benchmarkVersion);
  const title = ticket ? ticket + (hasBaseline ? ' · 同题复测' : ' · 基线评测') : config.benchmarkTitle.slice(0,106) + ' · 规则评测';
  const previous = config.runs.map(run =>
    `<div class="ge-history"><div><strong>${exText(run.title)}</strong><small>${exText(exDate(run.createdAt))} · ${run.itemCount} 道题 · ${exText(run.createdBy)}</small></div>
      ${exButton('查看报告','evaluation-report',run.id,{extra:` data-benchmark-id="${exText(id)}"`})}</div>`).join('');
  const form = config.canRun && config.items.length ? `<form class="stack" data-form="ex-evaluation-run" data-id="${exText(id)}" data-ticket="${exText(ticket)}" data-revision="${exText(config.revision)}">
    <label class="field">评测名称<input name="title" required maxlength="120" value="${exText(title)}"></label>
    <label class="field">评测指标版本<select required name="profileId">${workSelect(library.profiles.filter(p=>p.status==='published').map(p=>[p.id,profileName(p)]),config.profileId || 'PROFILE-MATERIALS-V1')}</select></label>
    <div class="ge-set">${ordered.map((item, i) => evalQuestionForm(item, i, config.topics)).join('')}</div>
    <div class="ge-footer"><span>共 ${config.items.length} 题 · 每题 2 份作答</span><button type="submit" class="btn primary">运行并保存报告</button></div></form>` : '';
  openModal('多维自动评测',`<div class="ge-desk stack"><div class="ge-heading"><h3>${exText(config.benchmarkTitle)}</h3><span>独立留出基准</span></div>
    ${form}${!config.items.length ? exEmpty('尚未添加留出题') : ''}<section class="ge-runs"><h3>评测记录 <span>${config.runs.length}</span></h3>${previous || '<p class="ge-hint">暂无运行记录</p>'}</section></div>`);
  if (assigned && desk?.rule) {
    const row = document.querySelector('#workspace-dialog [data-ge-item]');
    for (const field of row?.querySelectorAll('select, [data-ge-mode] input, [data-ge-mode] textarea') || []) field.disabled = true;
  }
}

function evalInput(row) {
  const val = name => row.querySelector(`[name="${name}"]`).value.trim();
  const lines = key => val(key).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const rule = { topic: val('topic'), mode: val('mode') };
  if (rule.mode === 'keywords') {
    rule.keywords = lines('keywords');
    rule.forbidden = lines('forbidden');
    if (!rule.keywords.length) throw new Error('请为关键要点匹配填写至少一项要点。');
  }
  if (rule.mode === 'numeric') {
    for (const name of ['expected','tolerance']) {
      if (!val(name) || !Number.isFinite(Number(val(name)))) throw new Error('请完整填写参考值和容差。');
      rule[name] = Number(val(name));
    }
    rule.unit = val('unit');
  }
  return { itemId:row.dataset.geItem, rule, answers:[val('answer0'),val('answer1')] };
}

async function evalSubmit(form) {
  const items = [];
  for (const row of form.querySelectorAll('[data-ge-item]')) {
    try {
      const item = evalInput(row);
      if (item.answers.some(x=>!x)) throw new Error('待测答案 A、B 均需填写。');
      items.push(item);
    } catch (error) {
      row.open = true;
      row.scrollIntoView({block:'nearest'});
      throw error;
    }
  }
  const run = await api(evalRunUrl(form.dataset.id),'POST',{
    title:form.elements.title.value.trim(), revision:form.dataset.revision, profileId:form.elements.profileId.value, items
  });
  evalReport(run,form.dataset.ticket);
}

function evalRuleDescription(rule) {
  if (rule.mode === 'numeric') return `参考值 ${rule.expected} ${rule.unit} · 绝对容差 ${rule.tolerance}`;
  if (rule.mode === 'keywords') return `要点 ${rule.keywords.join('、')}${rule.forbidden.length ? ' · 排除 ' + rule.forbidden.join('、') : ''}`;
  return '参考答案全文匹配';
}

function evalReport(run, ticket = '') {
  const metrics = run.dimensions.map(d=>
    `<div><h4>${exText(d.topic)}</h4><small>${d.count} 题${run.profile?' · 权重 '+run.profile.weights[d.topic]+'%':''}</small>${d.count ?
       `<p><b>A</b> ${d.means[0]} <b>B</b> ${d.means[1]}</p>` : '<p>暂无该专题题目</p>'}</div>`).join('');
  const rows = run.items.map((item,i)=>
    `<details class="ge-question"><summary><span class="ge-index">${i+1}</span><strong>${exText(item.question)}</strong>
       <span class="ge-score">A ${item.scores[0].score} · B ${item.scores[1].score}</span></summary>
       <div class="ge-body"><div class="ge-heading"><h4>${exText(item.rule.topic)}</h4><span>${exText(evalModes[item.rule.mode])}</span></div>
       <p class="ge-hint">${exText(evalRuleDescription(item.rule))}</p>
       <div class="ge-pair">${item.scores.map((score,k)=>`<div class="ge-result"><strong>答案 ${k?'B':'A'} · ${score.score} 分</strong><p>${exText(item.answers[k])}</p><small>${exText(score.reason)}</small></div>`).join('')}</div>
       <p class="ge-reference"><strong>参考答案</strong>${exText(item.reference)}</p>
       <div class="ge-source"><strong>${exText(item.resourceTitle)}</strong> <small>${exText(item.versionId)}</small>
         ${item.evidence.map(block=>`<p><b>${exText(block.location)}</b> ${exText(block.text)}</p>`).join('')}</div>
       <div>${exButton('查看原题与人工评审','evaluation-item',item.itemId,{extra:` data-benchmark-id="${exText(run.benchmarkId)}"`})}</div></div></details>`).join('');
  openModal('自动评测报告',`<div class="ge-desk stack"><div class="ge-heading"><h3>${exText(run.title)}</h3><span>${exText(run.engine)}</span></div>
    <p class="ge-hint">${exText(run.benchmarkTitle)} · ${exText(exDate(run.createdAt))} · ${exText(run.createdBy)}</p>
    ${run.profile ? `<section class="ge-runs"><h3>${exText(profileName(run.profile))}</h3><p>已覆盖权重 ${run.aggregate.coveredWeight}% · 通过线 ${run.profile.threshold} 分</p><p>${run.aggregate.means ? run.aggregate.means.map((v,i)=>'候选 '+(i?'B':'A')+'　'+v+' 分（'+(run.aggregate.pass[i]?'通过':'未通过')+'）').join('　') : '部分能力域缺题，本次保留分项成绩。'}</p></section>` : '<p>历史报告按逐题规则计分。</p>'}
    <section class="ge-runs"><h3>专题平均规则分 <span>满分 100</span></h3><div class="ge-metrics">${metrics}</div></section>
    <section class="ge-set">${rows}</section>
    <div class="ge-footer">${ticket ? exButton('返回工单复验','feedback-regression',ticket) : exButton('返回评测配置','evaluation-open',run.benchmarkId)}${exButton('导出报告 JSON','evaluation-export',run.id,{extra:` data-benchmark-id="${exText(run.benchmarkId)}"`})}</div></div>`);
}

const evalRegressionUrl = id => '/api/feedback/' + exPath(id) + '/regression';
const evalDifference = value => value === 0 ? '持平' : (value > 0 ? '+' : '') + value + ' 分';
const evalPairAttrs = (before,after) => ` data-before="${exText(before)}" data-after="${exText(after)}"`;

async function evalRegressionDesk(id) {
  const desk = await api(evalRegressionUrl(id));
  const reportSelect = selected => desk.reports.map(r=>`<option value="${exText(r.id)}"${exSelected(r.id === selected)}>${exText(r.title)} · ${exText(exDate(r.createdAt))} · ${exText(r.id)}</option>`).join('');
  const chooser = desk.reports.length >= 2 ? `<form class="stack" data-form="ex-feedback-regression" data-id="${exText(id)}">
    <div class="ge-pair"><label class="field">基线报告<select name="before">${reportSelect(desk.reports[1].id)}</select></label><label class="field">复测报告<select name="after">${reportSelect(desk.reports[0].id)}</select></label></div>
    <div class="ex-form-actions"><button class="btn primary" type="submit">核对报告</button></div></form>` :
    `<p class="ge-hint">本冻结版本已有 ${desk.reports.length} 份评测报告。请保存基线与复测两份报告。</p>`;
  const checks = desk.checks.slice().reverse().map(c=>`<div class="ge-history"><div><strong>A ${exText(evalDifference(c.deltas[0]))} · B ${exText(evalDifference(c.deltas[1]))}</strong><small>${exText(exDate(c.filedAt))} · ${exText(c.filedBy)}</small></div>
    ${exButton('查看复验','feedback-regression-review',id,{extra:evalPairAttrs(c.beforeId,c.afterId)})}</div>`).join('');
  const run = desk.canRun ? exButton('运行自动评测','evaluation-open',desk.benchmarkId,{
    extra:` data-ticket="${exText(id)}" data-item-id="${exText(desk.itemId)}"`}) : '';
  openModal('同题回归复验',`<div class="ge-desk stack"><div class="ge-heading"><h3>${exText(desk.title)}</h3>${exBadge(desk.status)}</div>
    <p class="ge-reference"><strong>${exText(desk.benchmarkVersion)} · ${exText(desk.itemId)}</strong>${exText(desk.question)}</p>
    ${desk.rule ? `<p class="ge-hint">工单计分规则 · ${exText(desk.rule.topic)} · ${exText(evalRuleDescription(desk.rule))}</p>` : ''}
    <section class="stack"><div class="ge-heading"><h3>评测报告</h3>${run}</div>${chooser}</section>
    <section class="ge-runs"><h3>已归档复验 <span>${desk.checks.length}</span></h3>${checks || '<p class="ge-hint">暂无复验记录</p>'}</section></div>`);
}

async function evalRegressionReview(id,before,after,file = false) {
  const data = await api(evalRegressionUrl(id),'POST',{action:file ? 'file' : 'preview',beforeId:before,afterId:after});
  const c = data.comparison;
  if (file) await refresh();
  const comparisons = ['A','B'].map((lane,i)=>`<section class="ge-question ge-body"><div class="ge-heading"><h3>作答 ${lane}</h3><strong>${exText(evalDifference(c.deltas[i]))}</strong></div>
    <div class="ge-pair">${c.reports.map((r,j)=>`<div class="ge-result"><h4>${j ? '复测' : '基线'} · ${r.scores[i].score} 分</h4><p>${exText(r.answers[i])}</p><small>${exText(r.scores[i].reason)}</small></div>`).join('')}</div></section>`).join('');
  const details = c.reports.map((r,i)=>`<div class="ge-history"><div><strong>${i ? '复测' : '基线'} · ${exText(r.title)}</strong><small>${exText(r.id)} · ${exText(exDate(r.createdAt))} · ${exText(r.createdBy)}</small></div></div>`).join('');
  const record = data.filed ? `<p class="ge-hint">已归档 · ${exText(data.filed.id)} · ${exText(data.filed.filedBy)} · ${exText(exDate(data.filed.filedAt))}</p>` : '';
  const archive = data.canFile && !data.filed ? exButton('归档复验','feedback-regression-file',id,{primary:true,extra:evalPairAttrs(before,after)}) : '';
  openModal('同题回归复验',`<div class="ge-desk stack"><div class="ge-heading"><h3>${exText(c.question)}</h3><span>${exText(c.benchmarkVersion)}</span></div>
    <p class="ge-reference"><strong>参考答案</strong>${exText(c.reference)}</p><section class="ge-runs"><h3>评测依据</h3>${details}
      <p>${exText(c.rule.topic)} · ${exText(evalRuleDescription(c.rule))} · ${exText(c.engine)} · ${c.profile?exText(profileName(c.profile)):'历史逐题规则'}</p></section>${comparisons}
    <details class="ge-question"><summary><strong>冻结原文与证据</strong></summary><div class="ge-body"><p>${exText(c.resourceTitle)} · ${exText(c.resourceId)} / ${exText(c.versionId)}</p>${c.evidence.map(b=>`<p><strong>${exText(b.location)}</strong>　${exText(b.text)}</p>`).join('')}</div></details>
    ${record}<div class="ge-footer">${exButton('返回工单复验','feedback-regression',id)}${archive}</div></div>`);
  if (file) notify('同题复验已归档');
}

async function evalAction(action, el) {
  const {id, benchmarkId} = el.dataset;
  if (action === 'ex-evaluation-open') return evalOpen(id,el.dataset.ticket,el.dataset.itemId);
  if (action === 'ex-evaluation-item') {
    const current = await api('/api/benchmarks/' + exPath(benchmarkId));
    if (!current.items.some(q=>q.id === id)) throw new Error('原基准已移除此题，历史原文仍可在报告中查看。');
    exItemViews.set(benchmarkId, id);
    closeModal();
    await openBenchmarkRecord(benchmarkId);
    document.querySelector('[data-ex-item-pane]:not([hidden])')?.scrollIntoView({block:'start'});
    return;
  }
  const run = await api(evalRunUrl(benchmarkId, id));
  if (action === 'ex-evaluation-report') return evalReport(run);
  if (action === 'ex-evaluation-export') return downloadJson(run.id + '.json',run);
}

document.addEventListener('change',event=>{
  const select = event.target.closest('[data-ge-item] select[name="mode"]');
  if (!select) return;
  for (const section of select.closest('[data-ge-item]').querySelectorAll('[data-ge-mode]')) {
    section.hidden = section.dataset.geMode !== select.value;
  }
});
