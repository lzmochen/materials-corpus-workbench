'use strict';

const benchmarkPreparation = (() => {
  const base = '/api/benchmark-work';
  const status = {design:'设计中',draft:'已制备草稿',reviewing:'专家评审中',published:'已发布'};
  let active = '', meta, page, selection = new Set(), selectionKey = '', loadSeq = 0;
  const h = value => escapeHtml(value);
  const writer = () => workCan('operator','lead','admin');
  const targetKey = t => t.family+'|'+t.topic;
  function button(label, action, id='', tone='') {
    return '<button type="button" class="btn '+tone+'" data-bprep="'+action+'" data-id="'+h(id)+'">'+h(label)+'</button>';
  }
  const pairs = arr => arr.map(v=>[v,v]);
  function total(plan) {return plan.targets.reduce((n,t)=>n+t.quota,0);}
  function counts(list) {
    const result = new Map();
    for(const r of list) result.set(targetKey(r),(result.get(targetKey(r))||0)+1);
    return result;
  }
  function actual() {return page.candidates.filter(c=>selection.has(c.id));}
  function targetTable() {
    const p=page.plan, available=counts(page.candidates), selected=counts(p.benchmarkId?p.imported:actual());
    const inspect=writer()&&!p.benchmarkId;
    const cells=p.targets.map(t=>{
      const key=targetKey(t), count=selected.get(key)||0, candidates=available.get(key)||0;
      const deficit=t.quota-(inspect?candidates:count);
      const result=inspect?(deficit>0?'候选缺 '+deficit+' 题':count>t.quota?'超选 '+(count-t.quota)+' 题':count===t.quota?'已选齐':'可选题')
        :p.benchmarkId?(count===t.quota?'已入卷':'须核对'):'待制备';
      const values=[h(t.family),h(t.topic),String(t.quota)];
      if(inspect) values.push(String(candidates));
      values.push(String(count),'<span class="bp-state '+(deficit>0||count>t.quota?'bp-warn':'')+'">'+result+'</span>');
      return values;
    });
    const heads=['材料门类','能力专题','目标题量'];
    if(inspect) heads.push('可用候选');
    heads.push(p.benchmarkId?'实际入卷':'已选','覆盖情况');
    return workTable(heads,cells);
  }
  function candidateTable() {
    if(!page.candidates.length) return workEmpty('当前配额下暂无可用候选题');
    return workTable(['选用','题型与题干','留出资料','证据'],page.candidates.map(c=>[
      '<input class="bp-check" type="checkbox" data-bprep-check="'+h(c.id)+'" aria-label="选用'+h(c.kind)+'：'+h(c.question)+'" '+(selection.has(c.id)?'checked':'')+(!page.canEdit?' disabled':'')+'>',
      '<span class="bp-kind">'+h(c.kind)+'</span><span class="bp-q">'+h(c.question)+'</span>',
      h(c.resourceTitle),
      button('核对题证','evidence',c.id,'small link')
    ]));
  }
  function exclusionBlock() {
    const rows=page.exclusions;
    if(!rows.length) return '';
    return '<details class="bp-out"><summary>查看未纳入记录（'+rows.reduce((a,b)=>a+b.count,0)+'）</summary>'+
      workTable(['来源','未纳入原因','记录数'],rows.map(r=>[h(r.source),h(r.reason),String(r.count)]))+'</details>';
  }
  function toolbar() {
    const p=page.plan;
    return '<div class="bp-toolbar"><button type="button" class="rd-back" data-bprep="library"><span aria-hidden="true">‹</span>返回蓝图库</button><div class="actions">'+
      (page.canEdit&&!p.benchmarkId?(p.id?button('修改蓝图','edit'):button('保存为蓝图','edit','','primary')):'')+
      (p.benchmarkId?workBtn('打开评审基准','home-benchmark',p.benchmarkId,'primary'):'')+'</div></div>';
  }
  function selectedPanel() {
    if(!writer() || page.plan.benchmarkId) return '';
    const p=page.plan;
    const actions=page.canEdit?button('按配额选取','auto')+button('清空选择','clear'):'';
    return '<section class="bp-section"><div class="bp-title"><h2>候选题</h2><div class="actions">'+actions+'</div></div>'+
      candidateTable()+exclusionBlock()+'<div class="bp-bottom"><span id="bp-counter"></span>'+
      (page.canEdit&&p.id?'<button type="button" class="btn primary" id="bp-prepare" data-bprep="prepare">制备基准草稿</button>':
        page.canEdit?button('保存蓝图并继续','edit','','primary'):'')+'</div></section>';
  }
  function statsLabel(){
    const picked=actual(), p=page.plan, byCell=counts(picked);
    const complete=p.targets.every(t=>(byCell.get(targetKey(t))||0)===t.quota);
    const versions=new Set(picked.map(c=>c.versionId)).size;
    return {label:'已选 '+picked.length+' / '+total(p)+' 题 · '+versions+' 个不同源版本',complete};
  }
  function panel() {
    const p=page.plan, details=p.benchmarkId?'制备基准':p.id?'编制人':'方案状态';
    const value=p.benchmarkId?status[p.status]:p.id?p.owner:'未保存';
    const displayOwner={operator:'数据管理员',lead:'评测负责人',admin:'管理员'};
    return '<div class="bp">'+toolbar()+'<section class="bp-plan"><div><h2>'+h(p.title)+'</h2><p>'+h(p.objective)+'</p></div><dl>'+
      '<div><dt>目标题量</dt><dd>'+total(p)+' 题</dd></div>'+
      (p.benchmarkId?'<div><dt>入卷来源</dt><dd>'+new Set(p.imported.map(i=>i.versionId)).size+' 个版本</dd></div>':'')+
      '<div><dt>'+details+'</dt><dd>'+h(displayOwner[value]||value)+'</dd></div></dl></section>'+
      '<section class="bp-section"><div class="bp-title"><h2>组卷配额</h2></div><div id="bp-coverage">'+targetTable()+'</div></section>'+
      selectedPanel()+'</div>';
  }
  function synch(html) {
    const template=document.createElement('template');template.innerHTML=html;
    const info=statsLabel();
    const msg=template.content.querySelector('#bp-counter');
    if(msg)msg.textContent=info.label;
    const btn=template.content.querySelector('#bp-prepare');
    if(btn)btn.disabled=!info.complete;
    return template.innerHTML;
  }
  async function render() {
    const seq=++loadSeq, identity=window.workspaceUser.username;
    const [inventory,resources]=await Promise.all([api(base),api('/api/resources')]);
    if(seq!==loadSeq || identity!==window.workspaceUser.username) return '';
    meta={...inventory,papers:workSourceChoices(resources,'benchmarks').filter(r=>r.split==='holdout' && r.researchCase)};
    const resolved = active==='template' ? 'template' : inventory.blueprints.find(plan=>plan.id===active)?.id;
    if(!resolved) {
      active='';page=null;
      return library();
    }
    const loaded=await api(base+'/'+resolved);
    if(seq!==loadSeq || identity!==window.workspaceUser.username) return '';
    page=loaded;
    const key=identity+'/'+(page.plan.id||'template')+'/'+page.plan.revision;
    if(selectionKey!==key){selection=new Set();selectionKey=key;}
    for(const id of selection) if(!page.candidates.some(c=>c.id===id)) selection.delete(id);
    return sectionHead('','基准设计与制备','')+synch(panel());
  }
  function library() {
    const plans=meta.blueprints, sample=meta.default;
    const families=[...new Set(sample.targets.map(t=>t.family))];
    const template='<section class="rd-template"><div class="rd-template-icon">'+workIcon('steps')+'</div><div><h2>四门类制备模板</h2><p>'+h(families.join(' · '))+'</p></div>'+
      button('打开模板','open','template')+'</section>';
    const rows=plans.map(p=>{
      const name='<button type="button" class="rd-name" data-bprep="open" data-id="'+h(p.id)+'">'+h(p.title)+'</button>';
      const tone=p.status==='published'?'green':p.status==='reviewing'?'amber':'neutral';
      return reviewRecordRow([name,String(total(p)),String(p.questionCount||0),h(reviewOwner(p.owner)),
        '<span class="ex-badge ex-'+tone+'">'+h(status[p.status]||p.status)+'</span>'],[p.title,p.id,p.objective,reviewOwner(p.owner)].join(' '));
    });
    const list=rows.length?reviewDirectory('blueprints',['蓝图名称','目标题量','已制备','编制人','状态'],rows,'搜索蓝图名称或编号'):
      '<div class="rd-empty"><strong>尚未保存蓝图</strong><p>'+(writer()?'从四门类模板开始，或新建蓝图设置考查范围和题量。':'已保存的组卷方案会显示在这里。')+'</p></div>';
    const papers=meta.papers.length?'<section class="rd-panel">'+reviewListHeader('专题留出文献',meta.papers.length)+
      workTable(['原文摘录','考查专题'],meta.papers.map(r=>[workBtn(r.title,'resource-open',r.id),h(r.topic||'待归类')]))+'</section>':'';
    return sectionHead('','基准设计与制备','',writer()?button('新建蓝图','new','','primary'):'')+papers+template+
      '<section class="rd-panel">'+reviewListHeader('组卷蓝图库',plans.length)+list+'</section>';
  }
  function updateSelection() {
    document.querySelectorAll('[data-bprep-check]').forEach(n=>{n.checked=selection.has(n.dataset.bprepCheck);});
    const info=statsLabel();
    const counter=wb('#bp-counter'), btn=wb('#bp-prepare'), table=wb('#bp-coverage');
    if(counter)counter.textContent=info.label;
    if(btn)btn.disabled=!info.complete;
    if(table)table.innerHTML=targetTable();
  }
  function autoSelect() {
    selection.clear();
    const usedVersions=new Map(), usedKinds=new Map(), usedEvidence=new Set();
    const evidenceKeys=c=>c.evidence.map(e=>e.text.normalize('NFKC').replace(/−/g,'-').replace(/\s/g,''));
    const score=c=>[
      evidenceKeys(c).filter(key=>usedEvidence.has(key)).length / (c.evidence.length||1),
      usedVersions.get(c.versionId)||0, usedKinds.get(c.kind)||0
    ];
    function earlier(a,b){
      for(let i=0;i<a.length;i++){if(a[i]!==b[i])return a[i]<b[i];}
      return false;
    }
    for(const target of page.plan.targets){
      const available=page.candidates.filter(c=>targetKey(c)===targetKey(target));
      for(let slot=0;slot<target.quota && available.length;slot++){
        let best=0, bestScore=score(available[0]);
        for(let i=1;i<available.length;i++){
          const ranking=score(available[i]);
          if(earlier(ranking,bestScore)){best=i;bestScore=ranking;}
        }
        const [item]=available.splice(best,1);
        selection.add(item.id);
        usedVersions.set(item.versionId,(usedVersions.get(item.versionId)||0)+1);
        usedKinds.set(item.kind,(usedKinds.get(item.kind)||0)+1);
        evidenceKeys(item).forEach(key=>usedEvidence.add(key));
      }
    }
    updateSelection();
  }
  function evidence(id) {
    const c=page.candidates.find(r=>r.id===id);
    if(!c)return;
    const rules=workTable(['评分维度','满分','给分依据'],c.rubric.map(r=>[h(r.name),String(r.max),h(r.description)]));
    const items=c.evidence.map(e=>'<li><b>'+h(e.location)+'</b><p>'+h(e.text)+'</p></li>').join('');
    const rule=c.autoRule;
    const defaultScoring=rule.mode==='numeric'?'参考值 '+rule.expected+' '+rule.unit+'，绝对容差 '+rule.tolerance+' '+rule.unit:
      rule.mode==='keywords'?'逐项检索 '+rule.keywords.join('、')+(rule.forbidden?.length?'。排除 '+rule.forbidden.join('、'):''):'与参考答案规范化后逐字比对';
    const checks=workTable(['核查项','本题核查口径'],[
      ['留出分区','当前核准来源，文件摘要、内容摘要与训练版本分开核查'],
      ['证据重复','对照训练原文，检查规范化后至少 18 字的完全相同证据块'],
      ['题干重复','对照训练候选、已有基准及本次候选的规范化题干']
    ]);
    openModal('核对候选题证','<div class="bp-detail stack"><div><span class="bp-kind">'+h(c.kind)+'</span><h3>'+h(c.question)+'</h3></div>'+
      '<section><h3>参考答案</h3><p>'+h(c.answer)+'</p></section><section><h3>两份待评回答</h3>'+
      workTable(['回答','内容'],c.candidates.map((a,i)=>[i?'B':'A',h(a.answer)]))+'</section>'+
      '<section><h3>评分量表</h3>'+rules+'</section><section><h3>原文证据</h3><b>'+h(c.resourceTitle)+'</b> · '+h(c.versionId)+
      '<ol class="bp-evidence">'+items+'</ol></section><details><summary>默认自动判分与隔离核查</summary><p>'+h(defaultScoring)+'</p>'+checks+'</details></div>');
  }
  function fields(t) {
    return '<div class="bp-row"><label>材料门类<select name="family">'+workSelect(pairs(meta.families),t.family)+'</select></label>'+
      '<label>能力专题<select name="topic">'+workSelect(pairs(meta.topics),t.topic)+'</select></label>'+
      '<label>题量<input type="number" step="1" min="1" max="50" name="quota" value="'+h(t.quota||1)+'" required></label>'+
      button('移除','remove','','small link')+'</div>';
  }
  function editor(isNew) {
    const source=isNew?meta.default:page.plan;
    const newId=!(source.id&&!isNew);
    const focus=source.targets.map(fields).join('');
    openModal(newId?'保存基准蓝图':'修改基准蓝图',
      '<form class="stack bp-editor" id="bp-editor"><label class="field">基准名称<input name="title" maxlength="120" required value="'+h(source.title)+'"></label>'+
      '<label class="field">考查目标<textarea name="objective" rows="2" maxlength="900" required>'+h(source.objective)+'</textarea></label>'+
      '<div class="bp-title"><h3>分层抽题配额</h3>'+button('添加配额','add')+'</div><div class="bp-rows">'+focus+'</div>'+
      '<p role="alert" class="bp-form-error"></p><div class="actions"><button type="submit" class="btn primary">保存蓝图</button></div></form>');
    const form=wb('#bp-editor'), requestId=crypto.randomUUID();
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const submitter=form.querySelector('[type="submit"]');
      if(submitter.disabled)return;
      submitter.disabled=true;
      try {
        const targetRows=[...form.querySelectorAll('.bp-row')].map(row=>({
          family:row.querySelector('[name="family"]').value,topic:row.querySelector('[name="topic"]').value,
          quota:Number(row.querySelector('[name="quota"]').value)
        }));
        const data={title:form.elements.title.value.trim(),objective:form.elements.objective.value.trim(),targets:targetRows};
        if(newId)data.requestId=requestId;else data.revision=source.revision;
        const saved=await api(newId?base:base+'/'+source.id,'POST',data);
        const keep=new Set(isNew?[]:selection);
        active=saved.plan.id;
        closeModal();await refresh();
        if(active===saved.plan.id && page?.plan.id===active){
          selection=new Set(page.candidates.filter(c=>keep.has(c.id)).map(c=>c.id));updateSelection();
        }
        notify('蓝图已保存');
      }catch(err){form.querySelector('.bp-form-error').textContent=err.message;}
      finally{submitter.disabled=false;}
    });
  }
  async function prepare() {
    const p=page.plan,request={revision:p.revision,candidateIds:actual().map(c=>c.id)};
    const saved=await api(base+'/'+p.id+'/prepare','POST',request);
    active=saved.plan.id;await refresh();notify('已制备 '+saved.plan.questionCount+' 题，可打开草稿送审');
  }
  document.addEventListener('click',async e=>{
    const el=e.target.closest('[data-bprep]');if(!el || el.disabled)return;
    const action=el.dataset.bprep;
    try {
      if(action==='library' || action==='open'){
        active=action==='open'?el.dataset.id:'';
        await refresh();
        if(action==='open')wb('[data-bprep="library"]')?.focus({preventScroll:true});
        return;
      }
      if(action==='new'||action==='edit'){editor(action==='new');return;}
      if(action==='add'){
        const parent=el.closest('form').querySelector('.bp-rows');
        if(parent.children.length>=12){notify('最多可设置12个配额','error');return;}
        parent.insertAdjacentHTML('beforeend',fields({family:meta.families[0],topic:meta.topics[0],quota:1}));return;
      }
      if(action==='remove'){el.closest('.bp-row').remove();return;}
      if(action==='evidence'){evidence(el.dataset.id);return;}
      if(action==='auto'){autoSelect();return;}
      if(action==='clear'){selection.clear();updateSelection();return;}
      if(action==='prepare'){
        el.disabled=true;await prepare();
      }
    } catch(err){notify(err.message,'error');}
    finally{if(action==='prepare' && el.isConnected)updateSelection();}
  });
  document.addEventListener('change',async e=>{
    if(e.target.matches('[data-bprep-check]')){
      const id=e.target.dataset.bprepCheck;
      if(e.target.checked)selection.add(id);else selection.delete(id);
      updateSelection();
    }
  });
  return {render,reset:()=>{active='';}};
})();
async function renderBenchmarkWork(){return benchmarkPreparation.render();}

function agreementRows(benchmark) {
  const rows = [];
  let awaiting = 0, missing = 0;
  for (const [index,item] of benchmark.items.entries()) {
    const reviews = item.reviews || [];
    if (item.reviewCount < 2 && item.reviewState === 'pending') {
      awaiting++;
      continue;
    }
    const rubric = item.rubric || [];
    const valid = rubric.length && reviews.length === 2 && reviews[0].username && reviews[1].username &&
      reviews[0].username !== reviews[1].username && reviews.every(review =>
        review.scores?.length === 2 && review.scores.every(scores => Array.isArray(scores) &&
          scores.length === rubric.length && scores.every((score,i) =>
            Number.isInteger(score) && score >= 0 && score <= rubric[i].max)));
    if (!valid) { missing++; continue; }
    const totals = reviews.map(review=>review.scores.map(scores=>scores.reduce((sum,x)=>sum+x,0)));
    const maximum = rubric.reduce((sum,x)=>sum+x.max,0);
    const gap = Math.max(Math.abs(totals[0][0]-totals[1][0]),Math.abs(totals[0][1]-totals[1][1]));
    const rankDiff = Math.sign(totals[0][0]-totals[0][1]) !== Math.sign(totals[1][0]-totals[1][1]);
    const reasons = [];
    if (rankDiff) reasons.push('候选排序不同');
    if (gap*5 > maximum) reasons.push('总分差超过满分的 20%');
    const state = item.result?.kind === 'arbitration' ? '已仲裁' : reasons.length ? '待仲裁' : '一致';
    rows.push({item, number:index+1, state, maximum, totals, gap, reasons});
  }
  return {rows,awaiting,missing};
}

function agreementDetail(row) {
  const {item,number,maximum,totals,reasons} = row;
  const columns = ['独立评审','候选 A','候选 B','排序'];
  const scores = item.reviews.map((review,i)=>{
    const [a,b] = totals[i];
    return [exText(review.display || review.username),String(a),String(b),a===b?'并列':a>b?'A 优于 B':'B 优于 A'];
  });
  const dimensions = item.rubric.map((rule,k)=>[exText(rule.name),String(rule.max),
    ...item.reviews.flatMap(r=>r.scores.map(s=>String(s[k])))]);
  const arb = item.result?.kind === 'arbitration' ?
    '<p><strong>仲裁意见</strong>　'+exText(item.result.note || '已完成仲裁')+'</p>' : '';
  return '<details class="agreement-row"><summary><span class="agreement-num">题 '+number+'</span><span>'+
    exText(item.question)+'</span><strong>'+row.state+'</strong></summary><section>'+
    '<p>'+exText(reasons.length?reasons.join('，'):'两位专家的候选排序相同，分差在允许范围内。')+
    '　最大总分差 '+row.gap+' 分，单个候选满分 '+maximum+' 分。</p>'+
    workTable(columns,scores)+
    '<details class="agreement-rubric"><summary>查看逐项原分</summary>'+workTable(
      ['评分项','满分','第一位评审 A','第一位评审 B','第二位评审 A','第二位评审 B'],dimensions)+'</details>'+arb+'</section></details>';
}

async function openReviewAgreement(id) {
  if (!exAllowed('lead','admin')) return;
  const who = window.workspaceUser.username;
  const data = await api('/api/benchmarks/'+exPath(id));
  if (who !== window.workspaceUser?.username || !exAllowed('lead','admin') || data.status==='draft') return;
  const {rows,awaiting,missing} = agreementRows(data);
  const n = rows.length;
  const metrics = ['一致','待仲裁','已仲裁'].map(label=>rows.filter(r=>r.state===label).length);
  const rate = n ? (100*metrics[0]/n).toLocaleString('zh-CN',{maximumFractionDigits:1})+'%' : '—';
  const stats = ['一致','待仲裁','已仲裁'].map((label,i)=>
    '<div><dt>'+label+'</dt><dd>'+metrics[i]+'<small> 题</small></dd></div>').join('');
  const method = '两位专家对候选 A、B 的排序相同，且同一候选的总分差不超过满分的 20%，计作一致。';
  const count = '双评完成 '+n+' / '+data.items.length+' 题，尚未双评 '+awaiting+' 题'+(missing?'，原始评分不全 '+missing+' 题':'')+'。';
  openModal('双评一致性','<div class="agreement-desk"><h3>'+exText(data.title)+'</h3><p>'+count+'</p>'+
    '<dl class="agreement-stats"><div><dt>一致率</dt><dd>'+rate+'</dd><small>'+metrics[0]+' / '+n+' 题</small></div>'+stats+'</dl>'+
    '<p class="agreement-method">'+method+'</p><h4>双评题目</h4>'+
    (rows.length ? rows.map(agreementDetail).join('') : workEmpty('暂无双评完成的题目'))+'</div>');
}

document.addEventListener('click', event=>{
  const button = event.target.closest('[data-review-agreement]');
  if (button) openReviewAgreement(button.dataset.reviewAgreement).catch(err=>notify(err.message,'error'));
});
