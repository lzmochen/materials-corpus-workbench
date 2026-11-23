'use strict';

const businessGroups = [
 ['语料采集管理','训练资源目录',[
   ['多源数据接入','登记文件、录入原文或按清单批量采集','选择接入方式'],
   ['格式统一与清洗','按版本查看解析字段、清洗前后内容与规范化结果','选择原文'],
   ['元数据与来源记录','查看原文件、采集通道、来源、授权说明与校验值','核对来源']]],
 ['语料加工与标注','数据生成与蒸馏 · CoT 精细标注',[
   ['多模态智能解析与要素抽取','为文献、表格或图像资料选择抽取方式','抽取要素','extract'],
   ['语料加工工作流编排','指定输入版本、加工方式和抽取模板','编排制备','workflow'],
   ['语料去重与粗筛','核查重复、缺少证据和质量不合格的样本','筛查样本','filter'],
   ['人机协同标注','标注员填写判断依据，专家复核或退回修订','打开工单','review'],
   ['多模态标注工具集','标记图像区域，绑定原文证据并保存图文记录','图文标注','image'],
   ['问答对与思维链语料生成','从核准的原文制备问答，以通过质检的问答建立标注工单','制备语料','qa'],
   ['专题语料组织','将样本编入不同专题，保留原始批次和样本编号','管理专题','topics'],
   ['分发版本控制','查看版本内容和差异，审批后冻结交付','查看版本','versions']]],
 ['语料存储与目录管理','训练资源目录',[
   ['语料目录管理','按材料门类、专题、状态和用途查找资源','打开目录'],
   ['权限与安全控制','查看当前岗位对原文版本和评测留出资料的访问范围','核对权限'],
   ['高效检索与访问','检索原文证据并定位到相应版本','检索原文'],
   ['语料溯源与血缘管理','沿原文版本追踪抽取条目、问答及其关联记录','查看血缘'],
   ['语料资产化与发布管控','查看交付版本、来源与冻结状态','发布台账']]],
 ['语料质量评估与训练增量化','数据生成与蒸馏 · HITL 评测基准',[
   ['语料质量评估','从六维质量报告定位到问题样本与原文','检查质量','quality-work'],
   ['基准评测任务管理','按蓝图组卷，经独立双评、裁定后冻结基准','办理评测','benchmark-work'],
   ['训练增量化分析','对照相同底座、配置和评测集下的外部训练结果','比较增量','evaluation-desk'],
   ['评测体系与指标管理','配置五个能力域的权重与通过线，审批后用于评测','管理指标','evaluation-desk']]],
 ['训练评测服务','数据生成与蒸馏 · 发布与训练',[
   ['统一数据接口','查看版本化接口和冻结交付视图的分页读取约定','查看接口','svc-supply-contract'],
   ['训练数据集构建与编排','从正式版本选样、配比与切分，生成冻结交付视图','编排数据集','svc-supply-new-view'],
   ['服务监控与审计','追踪交付、读取自检、联调回执及服务审计记录','查看监控','svc-supply-monitor']]],
 ['训练支撑','数据生成与蒸馏 · 发布与训练',[
   ['训练框架适配对接','下载数据、读取适配脚本和校验值，在接收环境验证','读取与校验','svc-supply-views'],
   ['训练任务组织与登记','绑定数据版本、底座、配置和外部任务编号，回收结果','训练任务台账','runs'],
   ['模型服务联调与资源管理','登记服务、并发配额和联调任务，核对外部执行回执','办理联调','svc-supply-models']]]
];
let businessIndexGroup=0, businessIndexSearch='';
function businessIndexRows(){
 const input=businessIndexSearch.trim().toLowerCase();
 const sections=businessGroups.map(([title,area,entries],i)=>{
   const active=entries.map(([name,desc,act,key],j)=>({name,desc,act,key,code:'3.'+(i+1)+'.'+(j+1)}))
      .filter(f=>input?[f.code,f.name,f.desc,area,title].join(' ').toLowerCase().includes(input):businessIndexGroup===i);
   if(!active.length)return '';
   return '<section class="biz-section"><header><h2>'+title+'</h2><span>'+area+'</span></header>'+
     active.map(f=>'<article class="biz-row"><span class="biz-code">'+f.code+'</span><div><h3>'+f.name+'</h3><p>'+f.desc+'</p></div>'+
       (i>=4 && !svcWriter()?'<span class="biz-role">数据管理员或负责人办理</span>':'<button class="btn" type="button" data-biz-open="'+f.code+'">'+f.act+'</button>')+'</article>').join('')+'</section>';
 }).join('');
 return sections||workEmpty('没有匹配的功能','可按名称、操作或章节编号检索。');
}
function renderFunctionIndex(){
 return sectionHead('','业务功能索引','',workBtn('返回工作台','nav','home'))+
 '<div class="biz-layout"><nav class="biz-groups" aria-label="初步设计功能分类">'+businessGroups.map(([name,,items],i)=>
   '<button type="button" data-biz-group="'+i+'" aria-pressed="'+(!businessIndexSearch&&businessIndexGroup===i)+'"><span>3.'+(i+1)+'</span>'+name+'<small>'+items.length+'</small></button>').join('')+'</nav>'+
 '<div class="biz-main"><label class="biz-search">'+platIcon('search')+'<input type="search" data-biz-find aria-label="查找业务功能" value="'+escapeHtml(businessIndexSearch)+'" placeholder="查找功能名称或章节编号"></label><div id="biz-results">'+businessIndexRows()+'</div></div></div>';
}
function refreshBusinessIndex(){
 const body=document.querySelector('#biz-results');if(!body)return;
 body.innerHTML=businessIndexRows();
 document.querySelectorAll('[data-biz-group]').forEach(b=>b.setAttribute('aria-pressed',String(!businessIndexSearch&&Number(b.dataset.bizGroup)===businessIndexGroup)));
}
document.addEventListener('input',e=>{if(e.target.matches('[data-biz-find]')){businessIndexSearch=e.target.value;refreshBusinessIndex();}});
document.addEventListener('click',async e=>{
 const group=e.target.closest('[data-biz-group]');if(group){businessIndexGroup=Number(group.dataset.bizGroup);businessIndexSearch='';document.querySelector('[data-biz-find]').value='';refreshBusinessIndex();return;}
 const b=e.target.closest('[data-biz-open]');if(!b)return;
 const code=b.dataset.bizOpen,[,g,num]=code.split('.').map(Number),action=businessGroups[g-1][2][num-1][3];
 b.disabled=true;
 try {
   if(g===1||g===3)await catalogPlanEntry(code);
   else if(g===2)await planProcessingOpen(action);
   else if(action.startsWith('svc-'))await serviceUiAction(action,b);
   else {
     await navigate(action);
     if(code==='3.4.3')document.querySelector('#met-training-gain')?.scrollIntoView({block:'start'});
   }
 }catch(err){notify(err.message,'error');}finally{b.disabled=false;}
});
