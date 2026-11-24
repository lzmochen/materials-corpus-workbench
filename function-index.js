'use strict';

const businessGroups = [
 ['语料采集管理','训练资源目录',[
   ['inbox','多源数据接入','登记文件、录入原文或按清单批量采集','选择接入方式'],
   ['clean','格式统一与清洗','按版本查看解析字段、清洗前后内容与规范化结果','选择原文'],
   ['file','元数据与来源记录','查看原文件、采集通道、来源、授权说明与校验值','核对来源']]],
 ['语料加工与标注','数据生成与蒸馏 · CoT 精细标注',[
   ['text','多模态智能解析与要素抽取','为文献、表格或图像资料选择抽取方式','抽取要素','extract'],
   ['nodes','语料加工工作流编排','指定输入版本、加工方式和抽取模板','编排制备','workflow'],
   ['screening','语料去重与粗筛','核查重复、缺少证据和质量不合格的样本','筛查样本','filter'],
   ['annotate','人机协同标注','标注员填写判断依据，专家复核或退回修订','打开工单','review'],
   ['imageRegion','多模态标注工具集','标记图像区域，识别科学曲线并校核数据点，关联原文证据','图文标注','image'],
   ['qa','问答对与思维链语料生成','从核准的原文制备问答，以通过质检的问答建立标注工单','制备语料','qa'],
   ['folder','专题语料组织','将样本编入不同专题，保留原始批次和样本编号','管理专题','topics'],
   ['versions','分发版本控制','查看版本内容和差异，审批后冻结交付','查看版本','versions']]],
 ['语料存储与目录管理','训练资源目录',[
   ['archive','语料目录管理','按材料门类、专题、状态和用途查找资源','打开目录'],
   ['shield','权限与安全控制','查看当前岗位对原文版本和评测留出资料的访问范围','核对权限'],
   ['search','高效检索与访问','检索原文证据并定位到相应版本','检索原文'],
   ['lineage','语料溯源与血缘管理','沿原文版本追踪抽取条目、问答及其关联记录','查看血缘'],
   ['publish','语料资产化与发布管控','查看交付版本、来源与冻结状态','发布台账']]],
 ['语料质量评估与训练增量化','数据生成与蒸馏 · HITL 评测基准',[
   ['verify','语料质量评估','从六维质量报告定位到问题样本与原文','检查质量','quality-work'],
   ['score','基准评测任务管理','按蓝图组卷，经独立双评、裁定后冻结基准','办理评测','benchmark-work'],
   ['trend','训练增量化分析','对照相同底座、配置和评测集下的外部训练结果','比较增量','evaluation-desk'],
   ['tools','评测体系与指标管理','配置五个能力域的权重与通过线，审批后用于评测','管理指标','evaluation-desk']]],
 ['训练评测服务','数据生成与蒸馏 · 发布与训练',[
   ['api','统一数据接口','查看版本化接口和冻结交付视图的分页读取约定','查看接口','svc-supply-contract'],
   ['layers','训练数据集构建与编排','从正式版本选样、配比与切分，生成冻结交付视图','编排数据集','svc-supply-new-view'],
   ['monitor','服务监控与审计','追踪交付、读取自检、联调回执及服务审计记录','查看监控','svc-supply-monitor']]],
 ['训练支撑','数据生成与蒸馏 · 发布与训练',[
   ['plug','训练框架适配对接','下载数据、读取适配脚本和校验值，在接收环境验证','读取与校验','svc-supply-views'],
   ['clipboard','训练任务组织与登记','绑定数据版本、底座、配置和外部任务编号，回收结果','训练任务台账','runs'],
   ['chip','模型服务联调与资源管理','登记服务、并发配额和联调任务，核对外部执行回执','办理联调','svc-supply-models']]]
];
const businessTabNames = ['采集管理', '加工与标注', '存储与目录', '质量与增益', '训练评测服务', '训练支撑'];
let businessIndexGroup = -1;
let businessIndexSearch = '';

function businessIndexResults() {
  const query = businessIndexSearch.trim().toLowerCase();
  const canManage = svcWriter();
  let count = 0;
  const sections = businessGroups.map(([title, area, entries], group) => {
    if (!query && businessIndexGroup !== -1 && businessIndexGroup !== group) return '';
    const rows = entries.map(([icon, name, description, action], index) => {
      if (query && ![name, description, action, title, businessTabNames[group], area].join(' ').toLowerCase().includes(query)) return '';
      count++;
      const code = '3.' + (group + 1) + '.' + (index + 1);
      const control = group >= 4 && !canManage
        ? '<span class="biz-role">数据管理员办理</span>'
        : '<button type="button" class="biz-action" data-biz-open="' + code + '">' + action + platIcon('arrow') + '</button>';
      return '<article class="biz-row"><span class="biz-symbol" aria-hidden="true">' + featureIcon(icon) +
        '</span><div class="biz-item"><h3>' + name + '</h3><p>' + description + '</p></div>' + control + '</article>';
    }).filter(Boolean);
    if (!rows.length) return '';
    const layout = rows.length >= 3 && rows.length % 2 ? 'biz-entries biz-odd' : 'biz-entries';
    return '<section class="biz-section" data-family="' + group + '"><header><h2>' + title + '</h2><span>' + area +
      '</span></header><div class="' + layout + '">' + rows.join('') + '</div></section>';
  }).join('');
  const status = query ? '<p class="biz-matches" role="status">找到 ' + count + ' 项功能</p>' : '';
  return status + (sections || '<div class="biz-empty"><h2>没有找到相关功能</h2><button type="button" class="btn" data-biz-clear>清除搜索</button></div>');
}

function renderFunctionIndex() {
  const query = businessIndexSearch.trim();
  const total = businessGroups.reduce((sum, group) => sum + group[2].length, 0);
  const tabs = ['全部功能', ...businessTabNames].map((label, position) => {
    const group = position - 1;
    const selected = group === (query ? -1 : businessIndexGroup);
    return '<button type="button" data-biz-group="' + group + '" aria-pressed="' + selected + '">' + label +
      (group === -1 ? '<span class="biz-total">' + total + '</span>' : '') + '</button>';
  }).join('');
  const search = '<div class="biz-search" role="search">' + platIcon('search') +
    '<input type="search" data-biz-find aria-label="查找业务功能" placeholder="搜索功能或操作" value="' + escapeHtml(businessIndexSearch) +
    '"><button type="button" class="biz-clear" data-biz-clear aria-label="清除搜索"' + (businessIndexSearch ? '' : ' hidden') + '>×</button></div>';
  return sectionHead('', '业务功能索引', '', search + workBtn('返回工作台', 'nav', 'home')) +
    '<div class="biz-layout"><nav class="biz-groups" aria-label="业务功能分类">' + tabs +
    '</nav><div id="biz-results">' + businessIndexResults() + '</div></div>';
}

function refreshBusinessIndex() {
  const results = document.querySelector('#biz-results');
  if (!results) return;
  results.innerHTML = businessIndexResults();
  const group = businessIndexSearch.trim() ? -1 : businessIndexGroup;
  document.querySelectorAll('[data-biz-group]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.bizGroup) === group));
  });
  document.querySelector('.biz-clear').hidden = !businessIndexSearch;
}

document.addEventListener('input', event => {
  if (event.target.matches('[data-biz-find]')) {
    businessIndexSearch = event.target.value;
    refreshBusinessIndex();
  }
});

document.addEventListener('click', async e => {
  const group = e.target.closest('[data-biz-group]');
  const clear = e.target.closest('[data-biz-clear]');
  if (group || clear) {
    if (group) businessIndexGroup = Number(group.dataset.bizGroup);
    businessIndexSearch = '';
    const input = document.querySelector('[data-biz-find]');
    input.value = '';
    refreshBusinessIndex();
    if (clear) input.focus();
    return;
  }
 const b=e.target.closest('[data-biz-open]');if(!b)return;
 const code=b.dataset.bizOpen,[,g,num]=code.split('.').map(Number),action=businessGroups[g-1][2][num-1][4];
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
