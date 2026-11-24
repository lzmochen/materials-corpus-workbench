'use strict';

const materialToolGroups=[
 ['文献与知识抽取','extraction',[
   ['text','文本抽取','选择已核准原文，逐项定位材料名称、性能或工艺字段。','抽取'],
   ['paper','文献抽取','从论文和报告的解析段落中抽取字段，保留原文位置。','选文献'],
   ['custom','自定义属性抽取','定义本次任务的字段，先预览匹配证据。','配置字段'],
   ['structure','分子结构识别与核对','读取结构文件，或对照原始结构图核查识别结果。','读取结构'],
   ['reaction','反应抽取','从原文核对反应物、产物与反应证据。','抽取记录']]],
 ['合成路线与分子资料','routes',[
   ['single','单步逆合成路线','从目标产物反查已收录文献中的一步反应。','查前体'],
   ['multi','多步逆合成路线','沿有关联的反应记录展开上游原料，逐步查阅出处。','展开路线'],
   ['toStructure','文本转分子结构','本地结构库匹配；可核对外部模型生成的 SMILES。','查结构'],
   ['toText','分子描述生成','从收录的结构生成属性描述，或核对外部模型返回的描述。','生成描述'],
   ['screening','分子筛选结果核查','导入外部筛选输出，按指标过滤并留存模型和批次来源。','核查结果']]],
 ['分子理化计算','properties',[
   ['mass','蛋白质与多肽分子量','从序列计算平均分子量，或核对 PDB 文件中的原子质量。','算分子量'],
   ['formula','多肽分子式','从一条未修饰线性肽序列统计元素组成。','算分子式'],
   ['pi','蛋白质等电点与分子量','从序列估算等电点，同时核对分子量。','估算等电点']]],
 ['模板与结果管理','records',[
   ['templates','抽取模板管理','查看模板字段与版本，编制或导入自定义模板。','查看模板'],
   ['verify','抽取结果校验','对照原文核查候选条目，记录改值或剔除的理由。','进入核查'],
   ['knowledge','已核准知识库','按属性、来源或关键词查找核准的抽取条目。','检索知识']]]
];
const materialToolGlyphs = {
  text: '<path d="M7 3H4v5m13-5h3v5M4 16v5h3m13-5v5h-3"/><path d="M8 8h8m-8 4h8m-8 4h5"/>',
  paper: '<path class="tool-paper" d="M7 3h10l3 3v12H7z"/><path d="M3.5 7v14H16M16 3v4h4m-10 3h7m-7 4h5"/>',
  custom: '<path d="M3 6h3m5 0h10M3 12h10m5 0h3M3 18h5m5 0h8"/><g class="tool-solid"><circle cx="8.5" cy="6" r="2"/><circle cx="15.5" cy="12" r="2"/><circle cx="10.5" cy="18" r="2"/></g>',
  structure: '<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4"/><path d="m7 10 5-3 5 3v5l-5 3-5-3zM9 11.3v2.6m4.5 1.8 1.6-.9"/>',
  reaction: '<path class="tool-paper" d="M7 4v4l-4 9a1.5 1.5 0 0 0 1.4 2h9.2a1.5 1.5 0 0 0 1.4-2l-4-9V4Z"/><path d="M6 4h6M5 13h8m2-3h6m-3-3 3 3-3 3"/>',
  single: '<path d="M16 12h-3a2 2 0 0 1-2-2V8a2 2 0 0 0-2-2H7m6 6a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2H7"/><rect class="tool-solid" x="16" y="9.5" width="5" height="5" rx="1"/><circle cx="4.5" cy="6" r="2"/><circle cx="4.5" cy="18" r="2"/>',
  multi: '<path d="M18 12h-2V8h-3m3 4v5h-3M9 8H7V4H5m2 4v4H5"/><rect class="tool-solid" x="18" y="10" width="4" height="4" rx=".8"/><circle cx="11" cy="8" r="1.8"/><circle cx="11" cy="17" r="1.8"/><circle cx="3.5" cy="4" r="1.5"/><circle cx="3.5" cy="12" r="1.5"/>',
  toStructure: '<path d="M3 4h9M3 7h6M4 11v5h6m-2-2 2 2-2 2"/><path d="m14 11 3.5-2 3.5 2v4l-3.5 2-3.5-2zM17.5 17v3"/>',
  toText: '<path d="m3 5.5 3.5-2 3.5 2v4l-3.5 2-3.5-2zM6.5 11.5V15"/><path d="M13 7h5v4m-2-2 2 2 2-2M10 15h11m-11 4h8"/>',
  screening: '<path class="tool-paper" d="M3 4h18l-7 8v2.5l-4 2v-4.5z"/><path d="m14 18 2.3 2.3L21 15.5"/>',
  mass: '<path d="M12 4v16m-5 1h10M3 7l17-2M6 7l-3 7h6L6 7Zm12-1-3 7h6l-3-7Z"/><path d="M3 14c.4 3 5.6 3 6 0m6-1c.4 3 5.6 3 6 0"/>',
  formula: '<path d="M8.5 7a3.5 3.5 0 0 0-6 2.4v3.2a3.5 3.5 0 0 0 6 2.4M12 6v10m5-10v10m-5-5h5m2 5a1.7 1.7 0 1 1 3 1l-3 3h3"/>',
  pi: '<path d="M4 3v17h17"/><path d="M5 11.5h15" stroke-dasharray="2 2"/><path d="M6 6c3.5 0 5 2.3 6.4 5.5S16 17 20 17"/><circle class="tool-solid" cx="12.4" cy="11.5" r="1.8"/>',
  templates: '<rect class="tool-paper" x="3.5" y="4" width="17" height="16" rx="1.7"/><path d="M4 8.5h16M10 9v11m3-7.5h4m-4 4h3"/>',
  verify: '<path class="tool-paper" d="M8 5H5v15h14V5h-3"/><rect x="8.5" y="3" width="7" height="4" rx="1"/><path d="m8.5 13 2.5 2.5 4.5-5"/>',
  knowledge: '<ellipse class="tool-paper" cx="11" cy="5.5" rx="7.5" ry="3"/><path d="M3.5 5.5v11c0 1.8 3.4 3.1 7.5 3.1M18.5 5.5v5m-15 .3c0 1.8 3.4 3 7.5 3h1"/><path d="m14 17.5 2.3 2.4 5-5.4"/>',
};

function materialToolIcon(key) {
  return '<span class="material-tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" focusable="false">'+materialToolGlyphs[key]+'</svg></span>';
}

function renderMaterialsTools(){
 const writer=workCan('operator');
 const shelves=materialToolGroups.map(([name,family,entries])=>'<section class="tools-shelf" data-tool-family="'+family+'"><header><h2>'+name+'</h2></header>'+
 entries.map(([key,title,desc,action])=>'<article class="tool-row">'+materialToolIcon(key)+'<div class="material-tool-copy"><h3>'+title+'</h3><p>'+desc+'</p></div>'+
 (['text','paper','custom'].includes(key)&&!writer?'<span class="biz-role">数据管理员办理</span>':'<button type="button" class="btn" data-material-tool="'+key+'">'+action+'</button>')+'</article>').join('')+'</section>').join('');
 return sectionHead('','文献与分子工具','',workBtn('科学曲线识别','nav','curve-work')+workBtn('原文资源库','nav','resources')+workBtn('抽取任务列表','nav','extraction'))+'<div class="tools-groups">'+shelves+'</div>';
}
let materialResult=null;
function materialsOfferResult(title,record,source,evidence=null){
 const stamp=new Date().toISOString();
 materialResult={title,record,...(evidence?{evidence}:{}),source:String(source||''),createdAt:stamp,createdBy:window.workspaceUser.username};
 const obj=Array.isArray(record)?record:Object.entries(record).map(([字段,值])=>({字段,值}));
 const printable=v=>v!=null&&typeof v==='object'?JSON.stringify(v,null,2):String(v??'');
 const detail=obj.slice(0,80).map(row=>typeof row==='object'&&row!==null?Object.entries(row).map(([k,v])=>
    '<div class="kv"><span>'+escapeHtml(k)+'</span><strong style="white-space:pre-wrap;overflow-wrap:anywhere">'+escapeHtml(printable(v))+'</strong></div>').join(''):
    '<p>'+escapeHtml(String(row))+'</p>').join('');
 openModal(title,'<div class="stack"><p class="mt-source">来源　'+escapeHtml(materialResult.source)+'</p><div class="record-grid">'+detail+'</div>'+
   (obj.length>80?'<p>预览前80条，导出文件包含完整记录。</p>':'')+'<div class="actions"><button class="btn" data-mat-export>导出记录 JSON</button>'+
   (svcWriter()?'<button class="btn primary" data-mat-register>登记为语料资源</button>':'')+'</div></div>');
}
const solventLibrary=[
 {name:'乙酸乙酯',other:'ethyl acetate',formula:'C4H8O2',smiles:'CCOC(=O)C',alternates:['CC(=O)OCC'],group:'羧酸酯',notes:'含乙酰基与乙氧基的酯，可作为涂料配方中的溶剂。',cid:8857},
 {name:'乙醇',other:'ethanol',formula:'C2H6O',smiles:'CCO',alternates:['OCC'],group:'醇',notes:'具有一个羟基的二碳直链醇。',cid:702},
 {name:'乙酸',other:'acetic acid',formula:'C2H4O2',smiles:'CC(=O)O',alternates:['OC(=O)C'],group:'羧酸',notes:'具有一个羧基的二碳一元羧酸。',cid:176},
 {name:'甘油',other:'glycerol',formula:'C3H8O3',smiles:'C(C(CO)O)O',alternates:['OCC(O)CO','OCC(CO)O'],group:'多元醇',notes:'三碳直链骨架上含有三个羟基。',cid:753},
 {name:'丙酮',other:'acetone',formula:'C3H6O',smiles:'CC(=O)C',alternates:['CC(C)=O'],group:'酮',notes:'具有两个甲基的简单脂肪酮。',cid:180}
];
function structureSearch(reverse){
 const fill=reverse?'CCOC(=O)C':'羧酸酯';
 openModal(reverse?'分子结构生成描述':'描述检索分子结构','<form class="stack" data-material-search="'+(reverse?'smiles':'name')+'"><label class="field">'+(reverse?'已收录结构的 SMILES':'分子名称、分子式或官能团')+
 '<input name="query" required maxlength="180" value="'+fill+'"></label><p>本地对照库收录乙酸乙酯、乙醇、乙酸、甘油和丙酮。结果附 PubChem 记录。</p><div class="actions"><button type="submit" class="btn primary">'+(reverse?'生成属性描述':'检索结构')+'</button><button type="button" class="btn" data-material-tool="'+(reverse?'text-receipt':'structure-receipt')+'">核对外部模型结果</button></div><div data-material-hits aria-live="polite"></div></form>');
}
function screenSheet(){
 openModal('分子筛选结果核查','<form class="stack" data-material-screen><div class="field"><label>外部结果文件（JSON） <input type="file" name="file" accept=".json,application/json"></label></div>'+
 '<label class="field">筛选记录<textarea name="rows" required rows="6" maxlength="240000" placeholder=\'{"model":"外部服务名称及版本","batch":"结果批次","metric":"指标名称","unit":"单位","rows":[{"name":"化合物标识","value":1.2}]}\'></textarea></label>'+
 '<div class="ge-pair"><label class="field">下限（可留空）<input type="number" step="any" name="lower"></label><label class="field">上限（可留空）<input type="number" step="any" name="upper"></label></div>'+
 '<p>导入已有测量或模型输出，按指定指标单位筛选。原始结合预测由提供结果的外部服务执行。</p><div class="actions"><button type="button" class="btn" data-mat-sample>载入材料属性样例</button><button type="submit" class="btn primary">校验并筛选</button></div></form>');
}
function validateScreen(data,lower,upper){
 const str=(v,n)=>typeof v==='string'&&v.trim()&&v.length<=n;
 if(!data||!['model','batch','metric','unit'].every(k=>str(data[k],180))||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>1000)throw Error('请填写模型、批次、指标、单位和1至1000条记录。');
 if(lower>upper)throw Error('下限不能大于上限。');
 const keys=new Set();
 for(const r of data.rows){
   if(!r||!str(r.name,180)||typeof r.value!=='number'||!Number.isFinite(r.value)||keys.has(r.name.trim()))throw Error('每条记录须包含唯一化合物名称和有限数值。');
   keys.add(r.name.trim());
 }
 return data.rows.filter(r=>r.value>=lower&&r.value<=upper).map(r=>({化合物:r.name,读数:r.value,单位:data.unit,指标:data.metric}));
}
async function openMaterialsTool(key){
 if(['text','paper','custom'].includes(key)){
   await createLuoshuTask();
   const el=document.querySelector(key==='custom'?'#ls-create-template':'#ls-source-kind');
   if(el&&key!=='text'){el.value=key==='custom'?'custom':'document';el.dispatchEvent(new Event('change',{bubbles:true}));}
 }else if(key==='structure')await openStructureReader();
 else if(['single','multi','reaction'].includes(key))await openMaterialRoutes(key);
 else if(['formula','mass','pi'].includes(key))await openMoleculeCalculator(key);
 else if(key==='toStructure'||key==='toText')structureSearch(key==='toText');
 else if(key==='structure-receipt'||key==='text-receipt')materialModelReceipt(key);
 else if(key==='screening')screenSheet();
 else if(key==='templates')await templateList();
 else {lsState.tab=key==='verify'?'review':'knowledge';lsState.taskId='';await navigate('extraction');}
}
document.addEventListener('click',async e=>{
 const btn=e.target.closest('[data-material-tool],[data-mat-export],[data-mat-register],[data-mat-sample],[data-mat-cid]');if(!btn)return;
 try{
   if(btn.hasAttribute('data-material-tool'))return await openMaterialsTool(btn.dataset.materialTool);
   if(btn.hasAttribute('data-mat-sample')){
     btn.form.elements.rows.value=JSON.stringify({model:'材料属性汇总（示例数据）',batch:'溶剂属性清单',metric:'相对分子质量',unit:'1',rows:[{name:'乙醇',value:46.07},{name:'乙酸乙酯',value:88.11},{name:'丙酮',value:58.08}]},null,2);return;
   }
   if(btn.hasAttribute('data-mat-cid')){
     const m=solventLibrary.find(m=>m.cid===Number(btn.dataset.matCid));if(!m)return;
     return materialsOfferResult(m.name+' · 结构核查',{名称:m.name,分子式:m.formula,SMILES:m.smiles,属性描述:m.notes},'PubChem CID '+m.cid+' · https://pubchem.ncbi.nlm.nih.gov/compound/'+m.cid);
   }
   if(!materialResult||materialResult.createdBy!==window.workspaceUser.username)throw Error('请重新运行工具。');
   if(btn.hasAttribute('data-mat-export'))return downloadJson(materialResult.title+'.json',materialResult);
   if(!svcWriter())throw Error('当前岗位无权登记资源');
   openModal('登记工具结果','<form class="stack" data-mat-save>'+workField('资源名称','title',{value:materialResult.title,max:180})+
     workField('资料来源','source',{value:materialResult.source.slice(0,180),max:180})+
     workField('使用授权说明','license',{placeholder:'填写本条结果的使用依据',max:180})+
     (materialResult.evidence?'<label class="field">用途分区<input readonly value="'+(materialResult.evidence.split==='holdout'?'独立评测留出':'训练')+'"><input type="hidden" name="split" value="'+escapeHtml(materialResult.evidence.split)+'"></label>':svcSelect('用途分区','split',[['train','训练'],['holdout','独立评测留出']]))+
     '<div class="actions"><button type="submit" class="btn primary">保存原始记录</button></div></form>');
 }catch(err){notify(err.message,'error');}
});
document.addEventListener('change',async e=>{
 if(!e.target.matches('[data-material-screen] input[type=file]'))return;
 const f=e.target.files[0];if(!f)return;
 if(f.size>240000){notify('结果文件上限为240 KB','error');return;}
 try{e.target.form.elements.rows.value=await f.text();}catch(err){notify(err.message,'error');}
});
document.addEventListener('submit',async e=>{
 const f=e.target.closest('[data-material-search],[data-material-screen],[data-mat-save],[data-mat-model]');if(!f)return;
 e.preventDefault();const b=f.querySelector('[type=submit]');b.disabled=true;
 try{
  if(f.hasAttribute('data-material-search')){
   const q=f.elements.query.value.trim(),low=q.toLowerCase(),rev=f.dataset.materialSearch==='smiles';
   const hits=solventLibrary.filter(m=>rev?[m.smiles,...m.alternates].includes(q):[m.name,m.other,m.formula,m.group,m.notes].some(x=>x.toLowerCase().includes(low)));
   f.querySelector('[data-material-hits]').innerHTML=hits.length?workTable(['分子','分子式','SMILES','核对'],hits.map(m=>[m.name,m.formula,escapeHtml(m.smiles),'<button type="button" class="btn small" data-mat-cid="'+m.cid+'">查看属性与来源</button>'])):workEmpty('当前对照库没有匹配结构','可用结构文件识别，或核对外部模型出具的结构结果。');return;
  }
  if(f.hasAttribute('data-mat-model')){
   const form=new FormData(f),model=String(form.get('model')).trim(),input=String(form.get('input')).trim(),out=String(form.get('result')).trim(),ref=String(form.get('source')).trim();
   if(!model||!input||!out||!ref)throw Error('请补齐模型版本、输入、输出和回执来源。');
   if(f.dataset.matModel==='structure-receipt' && /\s/.test(out))throw Error('SMILES 结构串不得含空白。');
   return materialsOfferResult('外部模型结果核对',{任务类型:f.dataset.matModel==='structure-receipt'?'文本转分子结构':'分子描述生成',模型版本:model,原始输入:input,外部输出:out,核对人:window.workspaceUser.display,备注:'人工登记的外部返回值，结构有效性及预测质量以原始验证记录为准。'},ref);
  }
  if(f.hasAttribute('data-material-screen')){
   let d;try{d=JSON.parse(f.elements.rows.value);}catch{throw Error('结果不是有效的 JSON。');}
   const low=f.elements.lower.value,high=f.elements.upper.value,rows=validateScreen(d,low===''?-Infinity:Number(low),high===''?Infinity:Number(high));
   return materialsOfferResult('分子筛选结果核查',{模型:d.model,批次:d.batch,指标:d.metric,单位:d.unit,输入条数:d.rows.length,匹配条数:rows.length,下限:low||'无',上限:high||'无',匹配结果:rows},d.model+' · '+d.batch);
  }
  if(!materialResult||!svcWriter()||materialResult.createdBy!==window.workspaceUser.username)throw Error('请用当前办理人重新生成记录。');
  const raw=JSON.stringify(materialResult,null,2);
  const upload=await workReadFile(new File([raw],'材料工具结果.txt',{type:'text/plain'}));
  const v=await api('/api/resources','POST',{...upload,title:f.elements.title.value.trim(),category:'科研工具记录',inputMode:'tool',toolEvidence:materialResult.evidence,source:f.elements.source.value.trim(),license:f.elements.license.value.trim(),split:f.elements.split.value});
  closeModal();await navigate('resources');await resourceOpen(v.id,v.activeVersion);notify('已登记工具记录，可继续解析、核准或建立标注');
 }catch(err){notify(err.message,'error');}finally{b.disabled=false;}
});

function materialModelReceipt(key){
 const toStructure=key==='structure-receipt';
 openModal('核对外部模型结果','<form class="stack" data-mat-model="'+key+'">'+workField('模型名称及版本','model',{placeholder:'如 BioT5+，同时填写版本号',max:140})+
 '<label class="field">'+(toStructure?'原始文本':'原始分子表示（SMILES 或 SELFIES）')+'<textarea required name="input" rows="2" maxlength="3500"></textarea></label>'+
 '<label class="field">'+(toStructure?'模型返回的 SMILES':'模型返回的分子描述')+'<textarea required name="result" rows="2" maxlength="6000"></textarea></label>'+
 workField('回执来源或外部任务编号','source',{max:180})+
 '<div class="actions"><button class="btn primary" type="submit">预览核对记录</button></div></form>');
}

document.addEventListener('click',async event=>{
  const trigger=event.target.closest('[data-material-block],[data-material-origin]');if(!trigger)return;
  try{
    if(trigger.hasAttribute('data-material-origin')){
      await resourceOpen(trigger.dataset.materialOrigin,trigger.dataset.version);
      const row=[...document.querySelectorAll('.evidence-row')].find(x=>x.querySelector('summary .mono')?.textContent===trigger.dataset.block);
      if(row){row.open=true;row.scrollIntoView({block:'nearest'});}
      return;
    }
    const context=detailCatalogSource;
    if(!context||context.owner!==window.workspaceUser.username)return;
    const block=context.version.blocks.find(b=>b.id===trigger.dataset.materialBlock);
    if(!block)return;
    const {resource,version}=context;
    openMaterialRoutes('reaction',{resourceId:resource.id,versionId:version.id,blockId:block.id,split:resource.split,
      text:block.text,source:resource.title+' · v'+version.number+' · '+block.location});
  }catch(error){notify(error.message,'error');}
});
