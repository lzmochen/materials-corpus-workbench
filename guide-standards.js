'use strict';

(() => {
  const base = '/api/guide-registry';
  const stageLabel = {draft:'内部草案', consult:'征求意见中', final:'内部定稿'};
  const fieldLabels = {title:'名称', mode:'制修订类型', supersedes:'拟修订标准及版本', scope:'适用范围', basis:'依据', clauses:'条款', owner:'责任或权利人', planned:'计划件数', kind:'成果类别', issuer:'发布机构', date:'日期', evidence:'凭证', number:'编号', result:'意见结论', opinionId:'意见编号', note:'说明'};
  const writers = () => workCan('admin','lead','operator');
  const leads = () => workCan('admin','lead');
  const h = value => escapeHtml(value);
  const path = (kind,id='',action='') => base + '/' + kind + (id ? '/'+encodeURIComponent(id) : '') + (action ? '/'+action : '');

  function button(text, action, kind='standards', id='', primary=false, opinion='') {
    return `<button type="button" class="btn${primary?' primary':''}" data-gstd="${action}" data-kind="${kind}" data-id="${h(id)}" data-opinion="${h(opinion)}">${h(text)}</button>`;
  }
  function badge(row) {
    if (row.publication) return '<span class="badge green">已登记发布凭证</span>';
    const tone = {draft:'neutral',consult:'amber',final:'blue'}[row.stage];
    return `<span class="badge ${tone}">${stageLabel[row.stage]}</span>`;
  }
  function sample(rec) {
    return rec.example ? '<small class="gstd-example">课题样例</small>' : '';
  }
  function stat(title,number,unit) {
    return `<div><span>${h(title)}</span><strong>${h(number)}<small>${h(unit)}</small></strong></div>`;
  }
  async function library(kind='standards') {
    const list = await api(base);
    const isStandard = kind === 'standards';
    const tabs = [['standards','标准制修订'],['outputs','知识产权成果']].map(([value,label])=>
      `<button aria-pressed="${value===kind}" type="button" data-gstd="library" data-kind="${value}">${label}</button>`).join('');
    const metrics = isStandard
      ? stat('指南制修订目标','≥ '+list.target,'项') + stat('内部定稿',list.finalized,'项') + stat('已登记发布凭证',list.published,'项')
      : stat('成果计划',list.outputs.length,'条') + stat('计划总量',list.outputs.reduce((a,r)=>a+r.planned,0),'件') + stat('已登记成果凭证',list.registered,'件');
    const rows = isStandard ? list.standards.map(r=>[
      `<strong>${h(r.title)}</strong><small class="cell-note">${h(r.mode)} ${sample(r)}</small>`,h(r.owner),badge(r),button('查看','detail',kind,r.id)
    ]) : list.outputs.map(r=>[
      `<strong>${h(r.title)}</strong><small class="cell-note">${h(r.kind)}</small>`,h(r.owner),`${r.registered} / ${r.planned}`,button('查看','detail',kind,r.id)
    ]);
    openModal('标准与成果台账', `<div class="gstd stack"><nav class="gstd-tabs" aria-label="台账类别">${tabs}</nav>
      <div class="gstd-metrics">${metrics}</div><div class="split"><h3>${isStandard?'标准制修订':'成果权属登记'}</h3>
      ${writers()?button(isStandard?'新建标准任务':'新建成果计划','new',kind,'',true):''}</div>
      ${rows.length?workTable(isStandard?['标准名称','牵头单位或工作组','进度','操作']:['成果名称','约定权利人','已登记 / 计划','操作'],rows):workEmpty(isStandard?'暂无标准任务':'暂无成果计划')}</div>`);
  }
  window.guideStandardsLibrary = library;

  function keyValue(label,value) {
    return `<dt>${h(label)}</dt><dd>${h(value || '—')}</dd>`;
  }
  function reviewList(rec) {
    const list = rec.opinions.map(op=>{
      const decision = op.resolution;
      const handling = !decision && writers() && rec.stage==='consult' ? button('处理意见','resolve','standards',rec.id,false,op.id) : '';
      return `<li><div class="split"><b>${h(op.actor)}</b><small>${workTime(op.at)}</small></div><p>${h(op.note)}</p>
        ${decision?`<p><span class="badge blue">${h(decision.result)}</span> ${h(decision.note)}</p>`:handling || '<span class="badge amber">待处理</span>'}</li>`;
    }).join('');
    return `<section><div class="split"><h3>征求意见 · ${rec.opinions.length}</h3>${rec.stage==='consult'?button('提交意见','opinion','standards',rec.id):''}</div>
      ${list?`<ul class="gstd-notes">${list}</ul>`:'<p class="gstd-source">暂无意见记录</p>'}</section>`;
  }
  function historyDetail(detail) {
    if (typeof detail === 'string') return detail ? `<p>${h(detail)}</p>` : '';
    return Object.entries(detail || {}).map(([k,v])=>{
      const label = h(fieldLabels[k] || k);
      if (v && typeof v==='object') return `<p><b>${label}</b>　<del>${h(v.before)}</del> → ${h(v.after)}</p>`;
      return `<p>${label}　${h(v)}</p>`;
    }).join('');
  }
  function history(rec) {
    return `<details class="gstd-history"><summary>操作记录 · ${rec.history.length}</summary>
      <ol class="gstd-notes">${rec.history.slice().reverse().map(event=>`<li><div class="split"><b>${h(event.action)}</b>
      <small>${h(event.actor)} · ${workTime(event.at)} · v${event.revision}</small></div>${historyDetail(event.detail)}</li>`).join('')}</ol></details>`;
  }
  function proofList(records) {
    return records.length?workTable(['凭证编号','权利人或发布机构','日期','凭证出处'],records.map(r=>[
      h(r.number),h(r.owner||r.issuer),h(r.date),h(r.evidence)
    ])):'<p class="gstd-source">暂无凭证</p>';
  }
  async function detail(kind,id,loaded) {
    const rec = loaded || await api(path(kind,id));
    const isStandard = kind==='standards';
    let actions = '';
    let content = '';
    if (isStandard) {
      if (writers() && rec.stage==='draft') actions += button('发起征求意见','consult',kind,id,true);
      if (leads() && rec.stage==='consult' && rec.opinions.every(o=>o.resolution)) actions += button('内部定稿','finalize',kind,id,true);
      if (leads() && rec.stage==='final' && !rec.publication) actions += button('登记发布凭证','publish',kind,id,true);
      const fields = keyValue('制修订类型',rec.mode) + (rec.mode==='修订'?keyValue('拟修订版本',rec.supersedes):'')
        + keyValue('牵头单位或工作组',rec.owner) + keyValue('适用范围',rec.scope) + keyValue('编制依据',rec.basis) + keyValue('主要条款',rec.clauses);
      content = `<div class="split"><div>${badge(rec)} ${sample(rec)}</div><small class="gstd-source">v${rec.revision}</small></div>
        <dl class="gstd-facts">${fields}</dl>${reviewList(rec)}<section><h3>正式发布凭证</h3>${proofList(rec.publication?[rec.publication]:[])}</section>`;
    } else {
      if (writers() && rec.registrations.length<rec.planned) actions += button('登记成果凭证','register',kind,id,true);
      content = `<dl class="gstd-facts">${keyValue('成果类别',rec.kind)}${keyValue('计划件数',String(rec.planned))}
        ${keyValue('约定权利人',rec.owner)}${keyValue('权属约定依据',rec.basis)}</dl>
        <section><h3>成果凭证 · ${rec.registrations.length} 件</h3>${proofList(rec.registrations)}</section>`;
    }
    if (writers() && (!isStandard || rec.stage!=='final')) actions += button('编辑','edit',kind,id);
    openModal(rec.title,`<div class="gstd stack"><div class="gstd-toolbar">${button('返回台账','library',kind)}<div>${actions}</div></div>${content}${history(rec)}</div>`);
  }
  function area(label,name,value='',max=1000) {
    return `<label class="field">${label}<textarea name="${name}" rows="3" maxlength="${max}" required>${h(value)}</textarea></label>`;
  }
  function select(label,name,items,value) {
    return `<label class="field">${label}<select name="${name}">${workSelect(items.map(key=>[key,key]),value)}</select></label>`;
  }
  function editFields(kind,r) {
    if (kind==='standards') return workField('标准名称','title',{value:r.title,max:120})
      + `<div class="gstd-pair">${select('制修订类型','mode',['制定','修订'],r.mode || '制定')}${workField('牵头单位或工作组','owner',{value:r.owner,max:100})}</div>`
      + `<div id="gstd-previous"${r.mode==='修订'?'':' hidden'}>${workField('拟修订标准及版本','supersedes',{value:r.supersedes,max:180,required:r.mode==='修订'})}</div>`
      + area('适用范围','scope',r.scope) + area('编制依据','basis',r.basis) + area('主要条款','clauses',r.clauses,8000);
    return workField('成果名称','title',{value:r.title,max:120})
      + `<div class="gstd-pair">${select('成果类别','kind',['专利','软件著作权','其他知识产权'],r.kind||'专利')}
        <label class="field">计划件数<input name="planned" type="number" min="1" max="10000" step="1" value="${h(r.planned||1)}" required></label></div>`
      + workField('约定权利人','owner',{value:r.owner,max:180}) + area('权属约定依据','basis',r.basis);
  }
  function formSpec(action,kind,r) {
    const isStandard=kind==='standards';
    if (action==='edit' || action==='new') return [action==='new'?(isStandard?'新建标准任务':'新建成果计划'):'编辑台账条目',editFields(kind,r),'保存'];
    if (action==='consult') return ['发起征求意见',area('征求意见范围或对象','note','',400),'发起征求意见'];
    if (action==='opinion') return ['提交意见',area('意见内容','note'),'提交意见'];
    if (action==='resolve') return ['处理征求意见',select('处理结论','result',['采纳','部分采纳','不采纳'],'采纳')+area('处理说明','note'),'保存处理结论'];
    if (action==='finalize') return ['内部定稿',area('定稿依据及意见汇总','note'),'确认内部定稿'];
    const publish = action==='publish';
    const date = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
    const title = publish?'登记发布凭证':'登记成果凭证';
    return [title,workField(publish?'正式标准编号和年度':'授权或登记编号','number',{max:120})
      + workField(publish?'发布机构':'凭证权利人',publish?'issuer':'owner',{value:publish?'':r.owner,max:180})
      + `<label class="field">${publish?'发布日期':'授权或登记日期'}<input type="date" name="date" max="${date}" required></label>`
      + area(publish?'发布公告网址或档案号':'证书档案号或公告网址','evidence','',500),title];
  }
  async function editor(action,kind,id,opinionId) {
    const r = id ? await api(path(kind,id)) : {};
    const [title,fields,label] = formSpec(action,kind,r);
    const returnButton = id?button('返回详情','detail',kind,id):button('返回台账','library',kind);
    const opinion = opinionId && (r.opinions||[]).find(item=>item.id===opinionId);
    openModal(title,`<form class="gstd stack" id="gstd-form"><div class="gstd-source">${h(r.title || '')}</div>
      ${opinion?`<blockquote>${h(opinion.note)}</blockquote>`:''}${fields}
      <div class="gstd-status" role="alert"></div><div class="actions">${returnButton}<button class="btn primary" type="submit">${h(label)}</button></div></form>`);
    const form=wb('#gstd-form');
    const requestId = action==='new' ? crypto.randomUUID() : null;
    const mode=form.elements.mode;
    if (mode) mode.addEventListener('change',()=>{
      form.querySelector('#gstd-previous').hidden = mode.value!=='修订';
      form.elements.supersedes.required = mode.value==='修订';
      if (!form.elements.supersedes.required) form.elements.supersedes.value='';
    });
    if (action==='edit' && r.registrations?.length) {
      form.elements.kind.disabled=true;
      form.elements.owner.readOnly=true;
      form.elements.basis.readOnly=true;
      form.elements.planned.min=r.registrations.length;
    }
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const submit=form.querySelector('[type=submit]');
      if (submit.disabled) return;
      submit.disabled=true;
      const body=Object.fromEntries(new FormData(form));
      if (requestId) body.requestId=requestId;
      if (r.revision) body.revision=r.revision;
      if (opinionId) body.opinionId=opinionId;
      if ('planned' in body) body.planned=Number(body.planned);
      if (form.elements.kind?.disabled) body.kind=r.kind;
      const endpoint = path(kind,id,['edit','new'].includes(action)?'':action);
      try {
        const saved=await api(endpoint,'POST',body);
        if (form.isConnected) await detail(kind,saved.id,saved);
      } catch(err) {
        form.querySelector('.gstd-status').textContent=err.message;
      } finally {submit.disabled=false;}
    });
  }
  document.addEventListener('click',async ev=>{
    const el=ev.target.closest('button[data-gstd]');
    if (!el || el.disabled) return;
    const {gstd,kind='standards',id='',opinion=''}=el.dataset;
    el.disabled=true;
    try {
      if (gstd==='library') await library(kind);
      else if (gstd==='detail') await detail(kind,id);
      else await editor(gstd,kind,id,opinion);
    } catch(err) {notify(err.message,'error');}
    finally {el.disabled=false;}
  });
})();
