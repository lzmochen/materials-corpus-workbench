'use strict';

let svcDelivery;
const svcKind = {training:'训练集', benchmark:'评测集'};
const svcEscape = value => escapeHtml(value ?? '');
const svcId = value => `<span class="mono">${svcEscape(value || '—')}</span>`;
const svcPath = (entity, id) => `/api/${entity}/${encodeURIComponent(id)}`;
const svcWriter = () => workCan('operator');
const svcCanRelease = kind => kind==='training' ? workCan('operator') : kind==='benchmark' && workCan('expert');
const svcPublished = (items, kind) => items.filter(item => item.kind === kind && item.status === 'published');
const svcVersionName = item => `${item.title} · ${item.version}`;
const svcReady = item => item.status === 'draft' && item.sources?.length > 0 && item.sources.every(source => !source.issues.length);

function svcTitle(title, subtitle, action, id) {
  return `<button type="button" class="table-link" data-action="${action}" data-id="${svcEscape(id)}">${svcEscape(title)}</button><small class="cell-note muted">${svcEscape(subtitle)}</small>`;
}

function svcSummary(entries) {
  return `<div class="record-grid">${entries.map(([label, value]) => `<div class="kv"><span>${svcEscape(label)}</span><strong>${svcEscape(value ?? '—')}</strong></div>`).join('')}</div>`;
}

function svcSelect(label, name, options, empty, selected = '') {
  return `<label class="field">${svcEscape(label)}<select name="${name}"${empty ? '' : ' required'}>${workSelect([[ '', empty || '请选择' ], ...options], selected)}</select></label>`;
}

function svcMetricText(value, signed = false) {
  if (!Number.isFinite(value)) return '—';
  return `${signed && value > 0 ? '+' : ''}${new Intl.NumberFormat('zh-CN',{maximumFractionDigits:8}).format(value)}`;
}

async function renderServiceReleases() {
  const releases = await api('/api/releases');
  const controls = svcWriter()
    ? workBtn('新建训练集版本','svc-release-new','training','primary','plus') + workBtn('交付视图与接口','svc-supply-views') : svcCanRelease('benchmark') ? workBtn('新建评测集版本','svc-release-new','benchmark','primary','plus') : '';
  const summary = `${releases.filter(item => item.status === 'draft').length} 个草稿 · ${releases.filter(item => item.status === 'published').length} 个已发布`;
  const body = releases.length ? workTable(['发布名称','类型','版本','状态','样本数','更新时间','操作'], releases.map(item => [
    svcTitle(item.title,item.id,'svc-release-view',item.id), svcEscape(svcKind[item.kind]), svcEscape(item.version),statusBadge(item.status),
    item.itemCount ?? '—',workTime(item.publishedAt ?? item.createdAt),workBtn('查看','svc-release-view',item.id,'small') +
      (item.status === 'published' && svcWriter() ? workBtn('登记交付','svc-release-deliver',item.id,'small link') : '')
  ])) : workEmpty('暂无数据版本');
  return `${sectionHead('','数据发布与交付','',controls)}
    ${workPanel('版本台账',body,`<span class="muted">${summary}</span>`)}`;
}

async function svcReleaseForm(kind, predecessor = null) {
  if (!(kind in svcKind) || !svcCanRelease(kind)) return;
  const training = kind === 'training';
  const [versions, sources] = await Promise.all([api('/api/releases'), api(training ? '/api/batches' : '/api/benchmarks')]);
  const previous = svcPublished(versions,kind).filter(item => !versions.some(later => later.family === item.family && later.sequence > item.sequence));
  const sourceOptions = training ? sources.filter(batch => batch.status === 'reviewed' && batch.counts?.passed > 0 && batch.counts?.candidate === 0)
    : sources.filter(benchmark => benchmark.status === 'published');
  const targetRoute = training ? 'batches' : 'benchmarks';
  if (!sourceOptions.length) {
    openModal(`新建${svcKind[kind]}版本`,`<div class="stack">${workEmpty('暂无可发布数据', training
      ? '所选批次须完成质检、无待审样本，并至少有一条通过样本。'
      : '请先发布评测基准。')}<div class="actions">${workBtn(training ? '打开生成批次' : '打开评测基准','nav',targetRoute,'primary')}</div></div>`);
    return;
  }
  if (predecessor && !previous.some(item => item.id === predecessor.id)) throw new Error('该版本已有后续版本，请打开最新版本。');
  const sourceField = training ? `<fieldset class="field"><legend>训练数据批次（最多 25 个）</legend>${sourceOptions.map(item => `<label class="row"><input type="checkbox" name="batchIds" value="${svcEscape(item.id)}" ${predecessor?.batchIds?.includes(item.id) ? 'checked' : ''}><span><strong>${svcEscape(item.title)}</strong><small class="muted cell-note">${svcEscape(item.id)} · ${svcEscape(item.counts.passed)} 条通过</small></span></label>`).join('')}</fieldset>`
    : svcSelect('已发布的评测基准','benchmarkId',sourceOptions.map(item => [item.id,`${item.title} · ${item.version || item.id}`]),'',predecessor?.benchmarkId);
  const parentField = predecessor ? `<input type="hidden" name="previousId" value="${svcEscape(predecessor.id)}"><p>前一版本 · ${svcEscape(svcVersionName(predecessor))}</p>`
    : svcSelect('前一版本','previousId',previous.map(item => [item.id,svcVersionName(item)]),'首版');
  openModal(`新建${svcKind[kind]}版本`,workModalForm('svc-release-create',`<input type="hidden" name="kind" value="${kind}">${workField('发布名称','title',{max:100,value:predecessor?.title || ''})}
    ${parentField}${sourceField}
    <label class="field">交付用途<textarea name="usage" rows="2" maxlength="500">${svcEscape(predecessor?.usage)}</textarea></label>`, '创建发布草稿'));
}

async function svcReleaseView(id) {
  const [item, audit] = await Promise.all([api(svcPath('releases',id)), svcWriter() ? api('/api/audit') : Promise.resolve([])]);
  const deliveries = audit.filter(entry => entry.action === 'release.delivered' && entry.target === item.id);
  const canFreeze = svcCanRelease(item.kind) && svcReady(item);
  const deliverable = item.status === 'published' && svcWriter();
  const counts = item.formatCounts;
  const training = item.kind === 'training';
  const sources = item.status === 'draft'
    ? workTable([training ? '训练批次' : '评测基准', '状态', '发布检查'], item.sources.map(source => [
        svcTitle(source.title, source.id, training ? 'home-batch' : 'home-benchmark', source.id),
        statusBadge(source.status),
        (source.issues.length ? svcEscape(source.issues.join('；')) : '可发布') +
          (source.qualityConflicts || []).map(finding => workBtn(
            '核对 '+finding.sample+' · '+finding.metric, 'quality-inspect-finding',
            finding.runId+'|'+finding.rowKey, 'small link'
          )).join('')
      ]))
    : `<p>${training ? `训练批次 ${item.batchIds.map(svcId).join('、')}` : `评测基准 ${svcId(item.benchmarkId)}`}</p>`;
  openModal('数据版本详情',`<div class="stack"><div class="split"><div><h3>${svcEscape(item.title)}</h3><p class="muted">${svcId(item.id)}</p></div>${statusBadge(item.status)}</div>
    ${svcSummary([['类型',svcKind[item.kind]],['版本',item.version],['样本数',item.itemCount],['前一版本',item.previousId || '首版'],['创建人',item.owner],['发布时间',workTime(item.publishedAt)]])}
    <div class="document"><h3>版本来源</h3>${sources}${counts ? `<p>问答 ${svcEscape(counts.qa ?? 0)} 条 · CoT ${svcEscape(counts.cot ?? 0)} 条</p>`:''}${item.usage?`<p>交付用途 · ${svcEscape(item.usage)}</p>`:''}</div>
    ${svcWriter() && item.status === 'published' ? workPanel('近期交付记录',deliveries.length
      ? workTable(['接收方','登记人','时间'],deliveries.map(entry => [svcEscape(entry.detail),svcEscape(entry.actor),workTime(entry.at)]))
      : workEmpty('最近 100 条审计记录中无本版本交付')) : ''}
    <div class="actions">${canFreeze?workBtn('审批并冻结','svc-release-publish',item.id,'primary'):''}${deliverable?workBtn('登记交付','svc-release-deliver',item.id,'primary'):''}
      ${svcWriter() && (svcReady(item) || item.status === 'published') ? workBtn('版本对比','svc-release-compare',item.id) : ''}
      ${item.nextId ? workBtn('查看后一版本','svc-release-view',item.nextId) : item.status==='published' && svcCanRelease(item.kind) ? workBtn('续建版本','svc-release-next',item.id) : ''}</div></div>`);
}

const svcChangeLabel = {added:'新增',removed:'移出',revised:'修订',unchanged:'沿用'};

function svcFieldValue(value) {
  if (value === null || value === undefined) return '—';
  return svcEscape(typeof value === 'object' ? JSON.stringify(value,null,2) : String(value));
}

async function svcReleaseCompare(id, filter = 'all', page = 0) {
  const report = await api(`${svcPath('releases',id)}/comparison`);
  const source = report.previous;
  const current = report.current;
  const selected = report.changes.filter(row => filter === 'all' || row.change === filter);
  const limit = 12;
  const navBtn = (label, f, p) => workBtn(label,'svc-compare-page',[id,f,p].join('|'),'small');
  const pagination = selected.length > limit ? `<div class="actions">${page ? navBtn('上一页',filter,page-1) : ''}
    <span>${page+1} / ${Math.ceil(selected.length/limit)}</span>${(page+1)*limit < selected.length ? navBtn('下一页',filter,page+1) : ''}</div>` : '';
  const rows = selected.slice(page*limit,(page+1)*limit).map(row => {
    const fields = row.fields.length ? `<details><summary>查看 ${row.fields.length} 项修订</summary>${row.fields.map(f => `<section><strong>${svcEscape(f.field)}</strong><p>前版</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${svcFieldValue(f.before)}</pre><p>本版</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${svcFieldValue(f.after)}</pre></section>`).join('')}</details>` : '';
    return [svcChangeLabel[row.change],svcEscape(row.question)+fields,svcId(row.id),svcId(row.versionId)];
  });
  const stats = report.quality.map(dim => [dim.label,svcMetricText(dim.before.mean),dim.before.n,svcMetricText(dim.after.mean),dim.after.n,svcMetricText(dim.delta,true)]);
  const runs = report.experiments.map(exp => [svcEscape(exp.metric),svcMetricText(exp.before),svcMetricText(exp.after),svcMetricText(exp.delta,true),
     `<details><summary>${svcEscape(exp.baseline)} → ${svcEscape(exp.run)}</summary><p>${svcEscape(exp.model)} · ${svcEscape(exp.framework)}</p><p>评测集 ${svcId(exp.benchmarkReleaseId)}</p><p>${svcEscape(exp.config)}</p></details>`]);
  openModal('版本对比',`<div class="stack"><h3>${svcEscape(current.title)}</h3>
    <p>${source ? svcEscape(source.version)+'（'+report.beforeCount+' 条）' : '首版建档'} → ${svcEscape(current.version)}（${report.afterCount} 条） · ${current.status === 'published' ? '已冻结' : '草稿预览'}</p>
    ${svcSummary(Object.keys(svcChangeLabel).map(k => [svcChangeLabel[k],report.counts[k]]))}
    ${workPanel('样本变更',`<div class="actions">${['all','added','removed','revised'].map(k => k === filter ? `<strong>${svcChangeLabel[k] || '全部'}</strong>` : navBtn(svcChangeLabel[k] || '全部',k,0)).join('')}</div>` +
      (rows.length ? workTable(['变更','问题','样本编号','原文版本'],rows) + pagination : workEmpty('没有符合条件的变更')))}
    ${stats.length ? workPanel('六维质量',workTable(['维度','前版均分','已评分数','本版均分','已评分数','分差'],stats)) : ''}
    ${current.kind === 'training' ? workPanel('外部训练实测',runs.length ? workTable(['指标','基线','本次','差值','对照任务'],runs) :
      workEmpty('暂无同条件配对结果','需要两版分别绑定已完成的外部任务，并使用同一评测集、环境、底座和实验配置。')) : ''}
    <div class="actions">${workBtn('返回版本','svc-release-view',id)}${workBtn('下载对比报告','svc-compare-download',id,'primary')}</div></div>`);
}

async function svcReleasePublish(id) {
  const item = await api(svcPath('releases',id));
  if (!svcCanRelease(item.kind)) return;
  if (!svcReady(item)) return svcReleaseView(id);
  openModal('审批并冻结版本',workModalForm('svc-release-publish',`<input type="hidden" name="id" value="${svcEscape(item.id)}"><div class="document"><strong>${svcEscape(svcVersionName(item))}</strong><p>发布后版本锁定，修改须新建版本。</p></div>`, '确认冻结并发布'));
}

async function svcReleaseDeliver(id) {
  if (!svcWriter()) return;
  const item = await api(svcPath('releases',id));
  openModal('登记数据交付', workModalForm('svc-release-deliver',`<input type="hidden" name="id" value="${svcEscape(id)}"><p class="muted">${svcEscape(svcVersionName(item))} · ${svcEscape(item.itemCount)} 条</p>${workField('接收方','recipient',{max:120})}`,'生成交付包'));
}

async function renderServiceRuns() {
  const [runs, releases]=await Promise.all([api('/api/runs'),api('/api/releases')]);
  const byRelease = new Map(releases.map(item => [item.id,item]));
  const completed = runs.filter(item=>item.status==='completed').length;
  const items = runs.length ? workTable(['训练任务','模型与环境','绑定的数据版本','状态','指标与对比','操作'],runs.map(item => {
    const train = byRelease.get(item.releaseId), benchmark = byRelease.get(item.benchmarkReleaseId);
    return [svcTitle(item.title,item.externalId,'svc-run-view',item.id),`${svcEscape(item.model)}<small class="muted cell-note">${svcEscape(item.framework)}</small>`,
      `<strong>${svcEscape(train ? svcVersionName(train):item.releaseId)}</strong><small class="muted cell-note">${svcEscape(benchmark ? svcVersionName(benchmark):item.benchmarkReleaseId)}</small>`,statusBadge(item.status),
      `${Object.keys(item.metrics || {}).length} 项指标${item.baselineId ? '<small class="cell-note muted">已绑定基线</small>' : ''}`,
      workBtn('查看','svc-run-view',item.id,'small') + (svcWriter() && ['registered','running'].includes(item.status) ? workBtn('更新结果','svc-run-report',item.id,'small link') : '')];
  })) : workEmpty('暂无外部训练任务');
  return `${sectionHead('','外部训练任务','',svcWriter()?workBtn('登记外部任务','svc-run-create','','primary','plus')+workBtn('模型联调与资源配额','svc-supply-models')+workBtn('服务审计','svc-supply-monitor'):'')}
    ${workPanel('训练任务台账',items,`<span class="muted">${runs.length} 项任务 · ${completed} 项已完成</span>`)}`;
}

async function svcRunForm() {
  if (!svcWriter()) return;
  const [releases, runs] = await Promise.all([api('/api/releases'),api('/api/runs')]);
  const training = svcPublished(releases,'training');
  const benchmarks = svcPublished(releases,'benchmark');
  if (!training.length || !benchmarks.length) {
    openModal('登记外部训练任务',`<div class="stack">${workEmpty('缺少已发布版本', [!training.length && '训练集', !benchmarks.length && '评测集'].filter(Boolean).join('、'))}<div class="actions">${workBtn('前往数据发布','nav','releases','primary')}</div></div>`);
    return;
  }
  const evalAndBaseline = benchmarks.flatMap(item => [[`${item.id}|`,`${svcVersionName(item)} · 无基线`],...runs.filter(run => run.status === 'completed' && run.benchmarkReleaseId === item.id).map(run => [`${item.id}|${run.id}`,`${svcVersionName(item)} · 基线 ${run.title}`])]);
  openModal('登记外部训练任务',workModalForm('svc-run-create',`${workField('任务名称','title',{max:120})}
    <div class="grid-2">${workField('外部任务编号','externalId',{max:120,placeholder:'训练环境生成的任务 ID'})}${workField('训练环境','framework',{max:120})}</div>
    <div class="grid-2">${workField('所属项目','project',{max:120})}${workField('任务责任人','responsible',{max:120,value:window.workspaceUser.display})}</div>
    <div class="grid-2">${workField('训练用途','purpose',{max:300})}<label class="field">计划结束日期<input type="date" name="plannedUntil"></label></div>
    ${workField('模型或底座版本','model',{max:120})}${svcSelect('训练数据版本','releaseId',training.map(item => [item.id,svcVersionName(item)]))}${svcSelect('评测数据版本与基线','benchmarkBaseline',evalAndBaseline)}
    <label class="field">实验配置<textarea name="config" rows="3" maxlength="500" placeholder="训练参数、代码版本、随机种子"></textarea><small>基线须使用相同的评测版本、训练环境、底座和配置。</small></label>`, '登记任务'));
}

async function svcRunView(id) {
  const [item,releases]=await Promise.all([api(svcPath('runs',id)),api('/api/releases')]);
  const baseline = item.baselineId ? await api(svcPath('runs',item.baselineId)) : null;
  const train = releases.find(release => release.id === item.releaseId);
  const benchmark = releases.find(release => release.id === item.benchmarkReleaseId);
  const metricRows = Object.entries(item.metrics || {}).map(([name,value]) => [svcEscape(name),svcMetricText(value),svcMetricText(baseline?.metrics?.[name]),svcMetricText(item.deltas?.[name],true)]);
  openModal('外部训练任务详情',`<div class="stack"><div class="split"><div><h3>${svcEscape(item.title)}</h3><p class="muted">${svcId(item.id)}</p></div>${statusBadge(item.status)}</div>
    ${svcSummary([['所属项目',item.project],['任务责任人',item.responsible || item.owner],['训练用途',item.purpose],['计划结束日期',item.plannedUntil],['外部任务编号',item.externalId],['训练环境',item.framework],['模型或底座',item.model],['基线任务',baseline?.title],['训练数据版本',train ? svcVersionName(train) : item.releaseId],['评测数据版本',benchmark ? svcVersionName(benchmark) : item.benchmarkReleaseId]])}
    ${item.config ? `<div class="document"><h3>实验配置</h3><p>${svcEscape(item.config)}</p></div>`:''}
    ${workPanel('评测指标与基线差值',metricRows.length ? workTable(['指标','本次','基线','本次减基线'],metricRows):workEmpty('暂无实测指标'))}
    ${item.note?`<div class="document"><h3>结果说明</h3><p>${svcEscape(item.note)}</p></div>`:''}
    ${svcWriter() && ['registered','running'].includes(item.status) ? `<div class="actions">${workBtn('更新状态与结果','svc-run-report',item.id,'primary')}</div>`:''}</div>`);
}

async function svcRunReport(id) {
  if (!svcWriter()) return;
  const item = await api(svcPath('runs',id));
  openModal('回填外部训练结果',workModalForm('svc-run-report',`<input type="hidden" name="id" value="${svcEscape(item.id)}">${svcSelect('任务状态','status',[['running','运行中'],['completed','完成'],['failed','失败']])}
    <label class="field">实测指标（JSON）<textarea name="metrics" rows="5" maxlength="6000" placeholder='{"准确率":0.86,"证据引用率":0.78}'>${Object.keys(item.metrics || {}).length ? svcEscape(JSON.stringify(item.metrics,null,2)) : ''}</textarea><small>任务完成时必填 1–30 项数值。基线差按同名指标计算。</small></label>
    <label class="field">结果说明<textarea name="note" rows="3" maxlength="1000" placeholder="完成或失败时必填">${svcEscape(item.note)}</textarea></label>`, '保存结果'));
}

async function openReleaseRecord(id) {
  await navigate('releases');
  if (window.workspacePage === 'releases') await svcReleaseView(id);
}

async function openRunRecord(id) {
  await navigate('runs');
  if (window.workspacePage === 'runs') await svcRunView(id);
}

async function serviceUiAction(action, el) {
  if (action.startsWith('svc-supply-')) return supplyAction(action.slice(11),el);
  const id=el.dataset.id;
  switch(action) {
    case 'svc-release-new': await svcReleaseForm(id); break;
    case 'svc-release-view': await svcReleaseView(id); break;
    case 'svc-release-next': {
      const previous = await api(svcPath('releases',id));
      await svcReleaseForm(previous.kind,previous);
      break;
    }
    case 'svc-release-compare': await svcReleaseCompare(id); break;
    case 'svc-compare-page': {
      const [releaseId,filter,page] = id.split('|');
      await svcReleaseCompare(releaseId,filter,Number(page));
      break;
    }
    case 'svc-compare-download':
      downloadJson(id+'-版本对比.json',await api(`${svcPath('releases',id)}/comparison`));
      break;
    case 'svc-release-publish': await svcReleasePublish(id); break;
    case 'svc-release-deliver': await svcReleaseDeliver(id); break;
    case 'svc-run-create': await svcRunForm(); break;
    case 'svc-run-view': await svcRunView(id); break;
    case 'svc-run-report': await svcRunReport(id); break;
    case 'svc-export-data':
      if (svcDelivery?.owner === window.workspaceUser?.username) workDownload(svcDelivery.filename,new Blob([svcDelivery.content],{type:svcDelivery.filename.endsWith('.jsonl')?'application/x-ndjson;charset=utf-8':'application/json;charset=utf-8'}));
      break;
    case 'svc-export-manifest':
      if (svcDelivery?.owner === window.workspaceUser?.username) downloadJson(svcDelivery.filename.replace(/\.(jsonl|json)$/i,'')+'-manifest.json',svcDelivery.manifest);
      break;
    default: return false;
  }
  return true;
}

async function serviceUiSubmit(form) {
  if (form.dataset.form.startsWith('svc-supply-')) return supplySubmit(form);
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  switch (form.dataset.form) {
    case 'svc-release-create': {
      if (data.kind === 'training') {
        data.batchIds = formData.getAll('batchIds');
        if (data.batchIds.length < 1 || data.batchIds.length > 25) throw new Error('请选择 1–25 个训练数据批次。');
      }
      const item = await api('/api/releases','POST',data);
      await refresh();
      await svcReleaseView(item.id);
      notify('发布草稿已创建。');
      break;
    }
    case 'svc-release-publish': {
      const item = await api(`${svcPath('releases',data.id)}/publish`,'POST',{});
      await refresh();
      await svcReleaseView(item.id);
      notify(`${item.version} 已冻结发布。`);
      break;
    }
    case 'svc-release-deliver': {
      const result = await api(`${svcPath('releases',data.id)}/export`,'POST',{recipient:data.recipient});
      svcDelivery = {...result,owner:window.workspaceUser?.username};
      openModal('数据交付包',`<div class="stack">${svcSummary([['接收方',data.recipient],['版本',result.manifest.version],['样本量',result.manifest.itemCount],['数据文件',result.filename],['发布人',result.manifest.publishedBy]])}
        <div class="actions">${workBtn('下载交付清单','svc-export-manifest')}${workBtn(result.filename.endsWith('.jsonl')?'下载训练 JSONL':'下载评测 JSON','svc-export-data','','primary')}</div></div>`);
      notify('交付已登记。');
      break;
    }
    case 'svc-run-create': {
      const [benchmarkReleaseId,baselineId] = (data.benchmarkBaseline || '').split('|');
      if (!benchmarkReleaseId) throw new Error('请选择评测数据版本。');
      const {benchmarkBaseline,...rest} = data;
      const item = await api('/api/runs','POST',{...rest,benchmarkReleaseId,baselineId:baselineId || ''});
      await refresh();
      await svcRunView(item.id);
      notify('外部训练任务已登记。');
      break;
    }
    case 'svc-run-report': {
      let metrics;
      try {metrics=data.metrics.trim() ? JSON.parse(data.metrics) : {};} catch {throw new Error('实测指标须为有效的 JSON 对象。');}
      if (!metrics || Array.isArray(metrics) || typeof metrics !== 'object' || Object.values(metrics).some(value=>!Number.isFinite(value))) throw new Error('请填写指标名称与有限数值。');
      const item = await api(`${svcPath('runs',data.id)}/report`,'POST',{status:data.status,note:data.note,metrics});
      await refresh();
      await svcRunView(item.id);
      notify('外部训练结果已回填。');
      break;
    }
    default: return false;
  }
  return true;
}
