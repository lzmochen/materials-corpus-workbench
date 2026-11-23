'use strict';

const researchTopics = {
  crystal: {
    api:'/api/crystal-case', tutorial:'/materials-corpus-workbench/crystal-tutorial.html', area:'无机非金属材料 / 宽禁带半导体 / 高温溶液生长',
    question:'Si–Cr 溶剂的碳溶解度，哪些来自实验，哪些来自热力学计算？',
    purpose:'从论文中标记实测数据、模型参数和计算范围，再用独立文献考查生长速率与晶体质量。',
    training:{title:'Si–Cr 溶剂用于 SiC 生长的热力学性质',credit:'Zihai Li 等 · 郭中楠、袁文霞共同通讯 · Crystal Growth & Design，2026',url:'https://doi.org/10.1021/acs.cgd.5c01649',rows:[['实验测量','使用两类坩埚制样，考察碳源影响，并分析不同溶剂配比的碳溶解度。','摘要 · 实验方法'],['模型拟合','作者根据实测数据优化三元液相相互作用参数。','摘要 · 参数优化'],['热力学计算','Si₁₋ₓCrₓ 在 x = 0–1、1 700–1 850 ℃ 范围内计算；全域结果来自模型。','摘要 · 计算范围']]},
    evaluation:{title:'富铬 Cr–Si 溶剂中的 4H-SiC 快速生长',credit:'Sakiko Kawanishi 等 · Journal of Crystal Growth，2020',url:'https://doi.org/10.1016/j.jcrysgro.2020.125877',rows:[['评测问题','在 1 933 K，哪种配比生长更快？哪种配比的 3C-SiC 夹杂较少？'],['条件与指标','识别 mol% Si 的组成口径，分别核查生长速率和多型夹杂。'],['结论边界','两种配比的实验比较用于考查证据判读。对热力学模型的外部验证还需另行设计。']]},
    context:{tab:'相关研究',title:'机器学习辅助筛选 SiC 晶体生长溶剂',credit:'Guangda Chen 等 · Calphad，2026',url:'https://doi.org/10.1016/j.calphad.2026.102947',rows:[['研究方法','作者用 CALPHAD 生成 814 个计算数据样本，以支持向量回归预测碳溶解度和黏度。'],['语料标注','给每条数据注明来源是计算或实测。模型的拟合指标与真实晶体的生长质量分别记录。']]},
    annotation:'实验观测、参数拟合、计算范围与生长结论'
  },
  research: {
    api:'/api/research-case',tutorial:'/materials-corpus-workbench/research-tutorial.html',area:'金属材料 / 双相钢 / 退火组织与性能',
    question:'仅凭一组退火试验，能否判定升温会提高抗拉强度？',
    purpose:'核对同一试样的热处理、显微组织和拉伸性能，再用另一项研究检验结论的适用范围。',
    training:{title:'1 000 MPa 热镀锌双相钢组织和断裂机理',credit:'金光灿等 · 北京科技大学冶金工程研究院、首钢技术研究院 · 2009',url:'https://cje.ustb.edu.cn/cn/article/pdf/preview/10.13374/j.issn1001-053x.2009.10.018.pdf',rows:[['热处理制度','两相区退火 820 ℃，保温 80 s，随后模拟热镀锌。','图 1、实验方法'],['显微组织','作者在铁素体基体中观察到岛状马氏体。','图 2、第 2.1 节'],['拉伸性能','屈服强度 598 MPa，抗拉强度 1 022 MPa，A₅₀ 为 9.5%。','表 2']]},
    evaluation:{title:'1500双相钢的微观组织及力学性能研究',credit:'马快等 · 有色金属材料与工程 · 2024',url:'https://snm.usst.edu.cn/html/2024/4/shysjs20230408001.htm',rows:[['评测问题','提高退火温度后，无铌和含铌试验钢的抗拉强度变化方向是否一致？'],['条件与指标','按钢号配对读取表 3 的抗拉强度，结合第 1.3 节核对保温及过时效条件。'],['结论边界','分别检查试验条件、性能指标、变化方向与归因依据。']]},
    context:{tab:'学院研究对照',title:'低碳多相钢的组织调控与力学性能',credit:'任勇强、谢振家、尚成嘉 · 北京科技大学材料科学与工程学院 · 2013',url:'https://cje.ustb.edu.cn/cn/article/pdf/preview/10.13374/j.issn1001-053x.2013.05.007.pdf',rows:[['研究设计','两种试验钢的碳质量分数分别为 0.22% 和 0.17%，采用 T1 和 T2 热处理路线。'],['对照研判','成分、前驱体和热处理条件均不同。讨论针状与块状铁素体基体的差异时，应保留各自的实验条件。']]},annotation:'实验条件、组织观察、性能读数与结论边界'
  }
};
let researchRecord=null;
const researchTabs={research:'training',crystal:'training'};
function researchAction(action,label,primary=false) {
  return `<button type="button" class="btn ${primary?'primary':'small'}" data-research-action="${action}">${escapeHtml(label)}</button>`;
}
function researchArticle(url,label) {
  return `<a class="rs-link" href="${url}" target="_blank" rel="noopener">${escapeHtml(label)} <span aria-hidden="true">↗</span></a>`;
}
function researchPanel(r,part) {
  const paper=researchTopics[r.route][part];
  let controls='';
  if(part==='training') controls=researchAction('source','核对已入库的文献摘录')+(r.batchId?researchAction('batch','检查问答与质检记录'):'');
  if(part==='context') controls=r.contextResourceId?researchAction('context','核对对照文献摘录'):researchArticle('https://huasheng.ustb.edu.cn/szdw/jsml/a6fb731daa664806844909d9708419dd.htm','郭中楠教授研究方向');
  if(part==='evaluation') controls=researchAction('holdout','核对留出文献摘录')+(r.benchmarkId?researchAction('benchmark','打开关联评测',true):r.annotationStatus==='approved'?researchAction('handoff',workCan('expert')?'从已复核标注制备评测':'查看评测交接',workCan('expert')):researchAction('annotation','查看标注办理状态'));
  const content=part==='training'?`<table class="rs-evidence"><thead><tr><th>证据类型</th><th>文献记录</th><th>出处</th></tr></thead><tbody>${paper.rows.map(row=>`<tr><th scope="row">${row[0]}</th><td>${row[1]}</td><td>${row[2]}</td></tr>`).join('')}</tbody></table>`:`<dl class="rs-fields">${paper.rows.map(([term,detail])=>`<div><dt>${term}</dt><dd>${detail}</dd></div>`).join('')}</dl>`;
  return `<div class="rs-paper"><div><h3>${paper.title}</h3><p>${paper.credit}</p></div>${researchArticle(paper.url,'查阅论文原文')}</div>${content}<div class="rs-actions">${controls}</div>`;
}
async function renderResearchCase() {
  const route=window.workspacePage, topic=researchTopics[route], user=window.workspaceUser.username;
  const record=await api(topic.api);
  if(!record.resourceId||!record.versionId)throw new Error('科研案例的训练文献尚未入库。');
  const annotation=record.annotationId?await api('/api/annotations/'+encodeURIComponent(record.annotationId)):null;
  if(window.workspacePage!==route||user!==window.workspaceUser.username)return '';
  const r={...record,route,annotationStatus:annotation?.status};researchRecord=r;
  const tabs=[['training','训练文献'],...(!workCan('annotator')?[['evaluation','独立评测文献']]:[]),['context',topic.context.tab]];
  const part=tabs.some(([id])=>id===researchTabs[route])?researchTabs[route]:'training';
  const nav=tabs.map(([id,label])=>`<button type="button" data-research-tab="${id}" aria-pressed="${part===id}">${label}</button>`).join('');
  const buttons=`<a class="btn" href="${topic.tutorial}" target="_blank" rel="noopener">观看操作实例</a>${researchAction('trail','查看全流程办理',true)}`;
  const phase={draft:'待标注员提交',returned:'待标注员修订',submitted:'待专家复核',approved:'专家复核通过'}[r.annotationStatus]||'待建立标注';
  return sectionHead('','科研案例','',buttons)+`<section class="rs-question"><p>${topic.area}</p><h2>${topic.question}</h2><div>${topic.purpose}</div></section>
    <section class="rs-work"><nav class="rs-tabs" aria-label="专题文献">${nav}</nav>${researchPanel(r,part)}</section>
    <section class="rs-annotation"><div><h3>CoT 标注工单</h3><p>${phase} · ${topic.annotation}</p></div>${researchAction('annotation','打开标注工单')}</section>`;
}
document.addEventListener('click',async event=>{
  const route=window.workspacePage;
  if(!researchTopics[route])return;
  const tab=event.target.closest('[data-research-tab]');
  if(tab){researchTabs[route]=tab.dataset.researchTab;await refresh();return;}
  const btn=event.target.closest('[data-research-action]');
  if(!btn||!researchRecord||researchRecord.route!==route)return;
  const r=researchRecord;btn.disabled=true;
  try{
    rememberCaseTrail(r.resourceId,r.versionId,r.sampleId,r.batchId);
    switch(btn.dataset.researchAction){
      case 'source':return await resourceOpen(r.resourceId,r.versionId);
      case 'holdout':return await resourceOpen(r.holdoutResourceId,r.holdoutVersionId);
      case 'context':return await resourceOpen(r.contextResourceId,r.contextVersionId);
      case 'batch':return await openProductionBatch(r.batchId);
      case 'annotation':return r.annotationId?await openAnnotationRecord(r.annotationId):await openNewSampleAnnotation(r.sampleId);
      case 'trail':return await openCaseTrail(r.resourceId,r.versionId,r.sampleId);
      case 'handoff':return await openAnnotationBenchmarkHandoff(r.annotationId);
      case 'benchmark':if(r.itemId)exItemViews.set(r.benchmarkId,r.itemId);return await openBenchmarkRecord(r.benchmarkId);
    }
  }catch(err){notify(err.message,'error');}finally{btn.disabled=false;}
});
