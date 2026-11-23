'use strict';

const supplyBase = '/api/supply/v1/';
const supplyFormats = {messages:'对话消息 JSONL',instruction:'指令问答 JSONL',csv:'问答 CSV'};
const supplyStates = {ready:'待外部执行',queued:'配额等待中',succeeded:'已收到成功回执',failed:'已收到失败回执',cancelled:'已撤销'};
const supplyOperation = (text,key,id='',primary=false) => workBtn(text,'svc-supply-'+key,id,primary?'primary':'small');
const supplySummary = (name,raw) => '<details><summary>'+svcEscape(name)+'</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+svcEscape(typeof raw==='string'?raw:JSON.stringify(raw,null,2))+'</pre></details>';
const supplyField = (name,key,min,max,value) => '<label class="field">'+svcEscape(name)+'<input required type="number" step="1" name="'+key+'" min="'+min+'" max="'+max+'" value="'+value+'"></label>';
let supplyDownload=null;

async function supplyViews() {
  const views=await api(supplyBase+'views');
  const list=views.length?workTable(['视图 / 接收方','格式','样本数','授权截止','操作'],views.map(r=>[
    svcTitle(r.title,r.recipient,'svc-supply-view',r.id),svcEscape(supplyFormats[r.format]),r.itemCount,svcEscape(r.validUntil),
    supplyOperation('读取与适配','view',r.id)
  ])):workEmpty('暂无冻结交付视图','从已发布训练集选择版本、样本和字段格式。');
  openModal('数据集编排与读取','<div class="stack"><div class="actions">'+supplyOperation('编排交付视图','new-view','',true)+supplyOperation('接口契约','contract')+supplyOperation('交付审计','monitor')+'</div>'+list+'</div>');
}
async function supplyViewForm() {
  const releases=svcPublished(await api('/api/releases'),'training');
  if(!releases.length){openModal('编排交付视图',workEmpty('暂无已发布训练集','先将质检通过的批次编入训练集，再由评测负责人审批并冻结版本。')+
    '<div class="actions">'+workBtn('新建训练集版本','svc-release-new','training','primary')+workBtn('发布版本台账','nav','releases')+'</div>');return;}
  const fields='<fieldset class="field"><legend>已发布训练集</legend>'+releases.map(r=>'<label class="row"><input type="checkbox" name="releaseIds" value="'+svcEscape(r.id)+'"><span>'+svcEscape(svcVersionName(r))+' · '+r.itemCount+' 条</span></label><label class="field">该版本抽取上限<input type="number" min="1" max="1000000" step="1" name="quota/'+svcEscape(r.id)+'" placeholder="留空则全选符合条件的条目"></label>').join('')+'</fieldset>';
  const minimum=new Date().toISOString().slice(0,10);
  openModal('编排交付视图',workModalForm('svc-supply-new-view',workField('视图名称','title',{max:120})+fields+
    '<div class="grid-2">'+svcSelect('输出字段格式','format',Object.entries(supplyFormats),'','messages')+supplyField('最低质检分','minScore',0,100,0)+'</div>'+
    '<div class="grid-2">'+supplyField('按来源划入验证集的比例（%）','validationPercent',0,50,0)+'<label class="row"><input type="checkbox" name="onlyCot">仅选含已复核 CoT 的样本</label></div>'+
    '<p class="muted">相同问答会去重。同一来源的不同版本分入同一组，小样本的实际比例可能有偏差。</p>'+
    '<div class="grid-2">'+workField('授权接收方','recipient',{max:120})+'<label class="field">授权截止日期<input type="date" name="validUntil" min="'+minimum+'" required></label></div>'+workField('使用用途','purpose',{max:300}),'冻结交付视图'));
}

function supplyContract() {
  const browser=Boolean(document.querySelector('script[src*="browser-bridge"]'));
  const routes=[['GET','views','已冻结视图目录'],['GET','views/{视图ID}','来源版本、字段映射、授权期与文件校验值'],['GET','views/{视图ID}/pages/1','按页读取，固定每页 25 条'],['POST','views/{视图ID}/check','核验 UTF-8、字段、条目顺序与校验值'],['POST','views/{视图ID}/download','含数据、清单和 Python 读取脚本的授权交付']];
  openModal('统一数据接口','<div class="stack"><p><strong>materials.supply.v1</strong> · '+(browser?'公开工作台在当前浏览器内读取。供训练环境调用 HTTP 接口时使用同版本服务端。':'HTTP 服务端使用当前会话授权。')+'</p>'+workTable(['方法','接口路径','返回内容'],routes.map(([m,p,label])=>[m,'<code>'+svcEscape(supplyBase+p)+'</code>',label]))+'<p>条目保留发布版本、原始资源版本及条目编号。超过授权期限后停止读取。</p><div class="actions">'+supplyOperation('打开交付视图','views')+'</div></div>');
}

async function supplyView(id,page=1) {
  const [v,batch]=await Promise.all([api(supplyBase+'views/'+id),api(supplyBase+'views/'+id+'/pages/'+page)]);
  const pages=Math.ceil(batch.total/batch.pageSize);
  const list=workTable(['条目','分组','字段与内容'],batch.items.map(r=>[svcId(r.itemId),r.split==='train'?'训练':'验证',supplySummary('查看字段',r)]));
  openModal('交付视图 · 读取与适配','<div class="stack"><h3>'+svcEscape(v.title)+'</h3>'+
    svcSummary([['版本化接口',v.schema],['输出格式',supplyFormats[v.format]],['训练 / 验证',v.trainCount+' / '+(v.itemCount-v.trainCount)],['重复问答',v.skippedDuplicates+' 条'],['授权接收方',v.recipient],['授权截止',v.validUntil]])+
    '<p>来源版本 · '+v.sources.map(r=>svcEscape(r.title+' '+r.version+(r.selected!=null?'（'+r.selected+' 条）':''))).join('、')+'</p>'+
    '<div class="actions">'+supplyOperation('读取自检','check',id)+supplyOperation('取得交付文件','download',id,true)+supplyOperation('接口契约','contract')+'</div>'+
    '<h3>条目分页</h3>'+list+'<div class="actions">'+(page>1?supplyOperation('上一页','page',id+'|'+(page-1)):'')+'<span>'+page+' / '+pages+'</span>'+(page<pages?supplyOperation('下一页','page',id+'|'+(page+1)):'')+'</div></div>');
}

function supplyPackage(result) {
  openModal('训练框架读取文件','<div class="stack">'+svcSummary([['接收方',result.recipient],['条目数',result.count],['数据格式',supplyFormats[result.format]],['文件字节',result.sizeBytes]])+
    '<p>将数据文件与读取脚本保存在同一目录，运行 <code>python read_dataset.py</code> 检查条目数；PyTorch 数据管道可调用脚本中的 <code>records()</code> 逐条读取。</p>'+
    supplySummary('SHA-256',result.sha256)+'<div class="actions">'+supplyOperation('下载数据','save','data',true)+supplyOperation('下载 Python 读取脚本','save','reader')+supplyOperation('下载授权与来源清单','save','manifest')+'</div></div>');
}

async function supplyModels() {
  const {nodes,requests}=await api(supplyBase+'models');
  const modelRows=nodes.length?workTable(['服务 / 模型版本','资源池','占用 / 配额','操作'],nodes.map(n=>[
    svcEscape(n.title)+'<small class="cell-note">'+svcEscape(n.serviceType+' · '+n.modelVersion)+'</small>',
    svcEscape(n.pool+' · '+n.resourceType),requests.filter(r=>r.nodeId===n.id&&r.state==='ready').length+' / '+n.slots,supplyOperation('新建联调单','new-request',n.id)
  ])):workEmpty('尚未登记模型服务','取得外部服务的模型版本与资源池名后登记。');
  const taskRows=requests.length?workTable(['联调资料','服务 / 优先级','状态','操作'],requests.map(r=>[
    svcEscape(r.sourceTitle),svcEscape(r.serviceType)+' / P'+r.priority,svcEscape(supplyStates[r.state]),supplyOperation('查看联调单','request',r.id)
  ])):workEmpty('暂无资源联调单');
  openModal('模型联调与资源配额','<div class="stack"><div class="actions">'+supplyOperation('登记服务资源','new-model','',true)+supplyOperation('服务监控与审计','monitor')+'</div><h3>服务资源池</h3>'+modelRows+'<h3>联调队列</h3>'+taskRows+'</div>');
}

function supplyNodeForm() {
  openModal('登记服务资源',workModalForm('svc-supply-new-model',workField('服务名称','title',{max:120})+
    '<div class="grid-2">'+svcSelect('服务类型','serviceType',['OCR','Embedding','多模态解析'].map(i=>[i,i]),'','OCR')+workField('模型版本','modelVersion',{max:120})+'</div>'+
    '<div class="grid-2">'+workField('外部资源池标识','pool',{max:120})+svcSelect('资源类型','resourceType',['CPU','GPU','国产加速卡','其他'].map(i=>[i,i]),'','CPU')+'</div>'+
    supplyField('可同时移交的联调请求数','slots',1,32,1)+'<p class="muted">登记后可生成请求单并接收外部执行回执。</p>','登记资源'));
}
async function supplyRequestForm(id) {
  const res=(await api('/api/resources')).filter(r=>r.split==='train'&&!r.archived);
  const opts=res.flatMap(r=>(r.versions||[]).filter(v=>v.status==='approved').map(v=>[r.id+'|'+v.id,r.title+' · v'+v.number]));
  if(!opts.length){openModal('新建联调单',workEmpty('暂无已核准的训练资料')+workBtn('进入资源目录','nav','resources'));return;}
  openModal('新建联调单',workModalForm('svc-supply-new-request','<input type="hidden" name="nodeId" value="'+svcEscape(id)+'">'+svcSelect('核准的资料版本','inputVersion',opts)+
    svcSelect('排队优先级','priority',[['1','P1 · 紧急'],['2','P2 · 常规'],['3','P3 · 低']],'','2')+'<p class="muted">有空闲配额时可下载请求单；配额满时按优先级和登记顺序排队。</p>','登记联调'));
}
async function supplyRequest(id) {
  const r=await api(supplyBase+'requests/'+id);
  const template={requestId:r.id,modelVersion:r.modelVersion,sourceSha256:r.sourceSha256,ok:null,elapsedMs:null,result:null};
  const ready=r.state==='ready';const open=ready||r.state==='queued';
  const receipt=ready?workModalForm('svc-supply-receipt','<input type="hidden" name="id" value="'+svcEscape(id)+'"><label class="field">外部执行回执（JSON）<textarea name="receipt" rows="7" required placeholder="'+svcEscape(JSON.stringify(template,null,2))+'"></textarea></label><p>成功回执填入实际耗时（毫秒）和结果。OCR、多模态解析使用文本，Embedding 使用数值向量。失败回执填写 ok=false 和 error。</p>','核验并登记回执'):'';
  openModal('服务联调单','<div class="stack">'+svcSummary([['请求编号',r.id],['状态',supplyStates[r.state]],['模型版本',r.modelVersion],['输入资料',r.sourceTitle],['来源版本',r.versionId],['外部耗时',r.elapsedMs==null?'—':r.elapsedMs+' ms']])+
    '<div class="actions">'+(ready?supplyOperation('下载请求 JSON','request-file',id):'')+(open?supplyOperation('撤销联调','cancel',id):'')+supplyOperation('返回资源队列','models')+'</div>'+receipt+
    (r.error?'<p>外部失败原因 · '+svcEscape(r.error)+'</p>':'')+(r.result!==undefined?supplySummary('查看回执结果 · '+r.outputSummary,r.result):'')+'</div>');
}
async function supplyMonitor() {
  const r=await api(supplyBase+'monitor');
  const actions={'view.created':'冻结交付视图','download':'读取交付文件','reader.checked':'运行读取自检','node.created':'登记服务资源','request.created':'建立联调单','request.succeeded':'成功回执','request.failed':'失败回执','request.cancelled':'撤销联调','release.delivered':'版本交付','training.registered':'登记训练任务','training.reported':'回填训练结果'};
  const log=r.events.length?workTable(['时间','经办人','操作','业务对象 / 记录'],r.events.map(e=>[
    workTime(e.at),svcEscape(e.actor),svcEscape(actions[e.action.replace(/^supply\./,'')]||e.action),svcId(e.target)+supplySummary('查看台账明细',e.detail)
  ])):workEmpty('暂无访问和交付记录');
  openModal('服务监控与审计','<div class="stack">'+svcSummary([['过期交付授权',r.expiredViews],['等待配额',r.queued],['成功回执',r.completed],['失败回执',r.failed],['回执平均耗时',r.meanExternalMs==null?'暂无回执':r.meanExternalMs+' ms']])+'<h3>最近服务记录</h3>'+log+'</div>');
}

async function supplyAction(action,el) {
  if(!svcWriter())return true;
  const id=el.dataset.id;
  switch(action){
    case 'views':await supplyViews();break;
    case 'new-view':await supplyViewForm();break;
    case 'view':await supplyView(id);break;
    case 'page':{const [rid,p]=id.split('|');await supplyView(rid,Number(p));break;}
    case 'contract':supplyContract();break;
    case 'check':{const r=await api(supplyBase+'views/'+id+'/check','POST',{});openModal('读取自检结果','<div class="stack"><h3>条目顺序与文件校验通过</h3>'+svcSummary([['实际读取条数',r.count],['实际字节数',r.sizeBytes],['本次读取耗时',r.elapsedMs+' ms']])+supplySummary('SHA-256',r.sha256)+supplyOperation('返回视图','view',id)+'</div>');break;}
    case 'download':{const r=await api(supplyBase+'views/'+id+'/download','POST',{});supplyDownload={user:window.workspaceUser.username,result:r};supplyPackage(r);break;}
    case 'save':{if(supplyDownload?.user!==window.workspaceUser.username)break;const r=supplyDownload.result;if(id==='manifest')downloadJson(r.viewId+'-manifest.json',r.manifest);else workDownload(id==='reader'?'read_dataset.py':r.filename,new Blob([id==='reader'?r.reader:r.content],{type:'text/plain;charset=utf-8'}));break;}
    case 'models':await supplyModels();break;
    case 'new-model':supplyNodeForm();break;
    case 'new-request':await supplyRequestForm(id);break;
    case 'request':await supplyRequest(id);break;
    case 'request-file':{const r=await api(supplyBase+'requests/'+id);if(r.state!=='ready')throw Error('请求当前没有可用配额。');downloadJson(id+'.json',{schema:'materials.service-request.v1',requestId:id,serviceType:r.serviceType,modelVersion:r.modelVersion,resourceId:r.resourceId,sourceVersionId:r.versionId,sourceSha256:r.sourceSha256});break;}
    case 'cancel':openModal('撤销联调请求',workModalForm('svc-supply-cancel','<input type="hidden" name="id" value="'+svcEscape(id)+'"><p>撤销当前请求后将释放其占用的配额。</p>','确认撤销'));break;
    case 'monitor':await supplyMonitor();break;
    default:return false;
  }
  return true;
}
async function supplySubmit(form) {
  const f=new FormData(form),d=Object.fromEntries(f);
  switch(form.dataset.form){
    case 'svc-supply-new-view':{const releaseIds=f.getAll('releaseIds');const quotas=Object.fromEntries(releaseIds.filter(k=>f.get('quota/'+k)).map(k=>[k,Number(f.get('quota/'+k))]));const v=await api(supplyBase+'views','POST',{title:d.title,recipient:d.recipient,purpose:d.purpose,validUntil:d.validUntil,format:d.format,releaseIds,quotas,minScore:Number(d.minScore),validationPercent:Number(d.validationPercent),onlyCot:f.has('onlyCot')});await supplyView(v.id);notify('交付视图已冻结');break;}
    case 'svc-supply-new-model':await api(supplyBase+'models','POST',{...d,slots:Number(d.slots)});await supplyModels();notify('服务资源已登记');break;
    case 'svc-supply-new-request':{const [resourceId,versionId]=d.inputVersion.split('|');const r=await api(supplyBase+'requests','POST',{resourceId,versionId,nodeId:d.nodeId,priority:Number(d.priority)});await supplyRequest(r.id);break;}
    case 'svc-supply-receipt':{let o;try{o=JSON.parse(d.receipt);}catch{throw Error('请输入有效的 JSON 回执。');}if(!o||Array.isArray(o)||typeof o!=='object')throw Error('回执须为 JSON 对象。');if('cancel' in o)throw Error('回执不包含撤销操作。');await api(supplyBase+'requests/'+d.id+'/receipt','POST',o);await supplyRequest(d.id);notify('外部回执已登记');break;}
    case 'svc-supply-cancel':await api(supplyBase+'requests/'+d.id+'/receipt','POST',{cancel:true});await supplyModels();break;
    default:return false;
  }
  return true;
}
