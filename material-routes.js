'use strict';

const mrSources={
  ester:{name:'乙酸和乙醇酯化',product:'乙酸乙酯',reagents:['乙酸','乙醇'],type:'酯化',
    doi:'10.1039/C6RE00088F',reference:'Reaction Chemistry & Engineering，2016',
    quote:'esterification to produce ethyl acetate from acetic acid and ethanol',location:'Introduction，反应与分离研究目的'},
  oxidation:{name:'乙醇水相氧化',product:'乙酸',reagents:['乙醇','空气中的氧'],type:'氧化',
    doi:'10.1002/anie.200601180',reference:'Angewandte Chemie International Edition，2006',
    quote:'Formation of Acetic Acid by Aqueous-Phase Oxidation of Ethanol with Air',location:'论文标题'}
};
const mrModes={reaction:'反应抽取',single:'单步文献逆查',multi:'多步文献逆查'};
function mrTokens(value){
  return value.toLowerCase().replace(/ethyl acetate|ethyl ethanoate|乙酸乙酯|醋酸乙酯|ch3cooc2h5|ch₃cooc₂h₅/g,'{ester}')
    .replace(/acetic acid|ethanoic acid|冰醋酸|(?:乙酸|醋酸)(?!钠|盐|酐|酯|甲酯|丙酯)|ch3cooh|ch₃cooh/g,'{acid}')
    .replace(/ethanol|ethyl alcohol|乙醇|酒精|c2h5oh|c₂h₅oh/g,'{alcohol}')
    .replace(/(?:空气中的)?氧气|空气|\boxygen\b|\bair\b|\bo2\b|o₂/g,'{oxygen}');
}
function mrTextMatch(line){
  const t=mrTokens(line);
  if(/未(?:能|观察|见|检测|生成|产生|反应|发生|发现|证实)|没有|不能|并非|不发生|不生成|不产生|无法|不一定|可能|拟研究|是否|[?？]|\b(?:no|not|never|failed|might|may|can not|cannot|hypothes[ei]s|hypothetical)\b/i.test(t))return [];
  const arrow=t.split(/(?:→|⟶|->|=>|⇌)/);
  const order=/\{acid\}.{0,48}\{alcohol\}|\{alcohol\}.{0,48}\{acid\}/;
  const direction=/生成|制得|形成|得到|制备|yield(?:ed|ing)?|form(?:ed|ing)?|produc(?:ed?|ing)|give|giving/;
  const esterAt=t.lastIndexOf('{ester}'), acidAt=t.lastIndexOf('{acid}'),alcoholAt=t.indexOf('{alcohol}');
  const esterFrom=/(?:form(?:ation)?|produc\w*|synthes\w*)[^.;]{0,28}\{ester\}\s+from\s/.test(t)&&order.test(t.slice(esterAt+7));
  const esterForward=esterAt>=0&&order.test(t.slice(0,esterAt))&&direction.test(t.slice(Math.max(t.indexOf('{acid}'),t.indexOf('{alcohol}'))+6,esterAt));
  const oxFrom=/(?:formation|production) of \{acid\} by .{0,35}oxidation of \{alcohol\}/.test(t);
  const oxForward=alcoholAt>=0&&acidAt>alcoholAt&&/氧化|oxidiz|oxidis|oxidat|oxidant/.test(t)&&
    /氧化(?:为|成|生成)|生成|制得|得到|形成|(?:into|to|yield\w*|produc\w*|giv(?:e|ing))\s*(?:the\s*)?$/.test(t.slice(alcoholAt+9,acidAt));
  const matches=[];
  if((arrow.length===2&&order.test(arrow[0])&&arrow[1].includes('{ester}'))||esterFrom||esterForward)matches.push('ester');
  if((arrow.length===2&&arrow[0].includes('{alcohol}')&&arrow[0].includes('{oxygen}')&&arrow[1].includes('{acid}'))||oxFrom||oxForward)matches.push('oxidation');
  return matches;
}
function mrExtract(text){
  if(text.length>100000)throw new Error('单次最多读取 100000 个字符。');
  if(!text.trim())throw new Error('请粘贴反应描述，或选择文献原文短句。');
  const rows=[];
  for(const m of text.matchAll(/[^。！？；;!?\r\n]+[。！？；;!?]?/g)){
    const quote=m[0].trim();if(!quote)continue;
    const start=m.index+m[0].indexOf(quote);
    // Do not join independent English claims across sentence boundaries.
    for(const part of quote.matchAll(/(?:[^.]+(?:\.(?!\s|$)[^.]*)*\.?)/g)){
      const sentence=part[0].trim();if(!sentence)continue;
      const pos=start+part.index+part[0].indexOf(sentence);
      for(const key of mrTextMatch(sentence)){
        const ref=mrSources[key], includesOxygen=mrTokens(sentence).includes('{oxygen}');
        rows.push({type:ref.type,product:ref.product,reagents:key==='oxidation'&&!includesOxygen?['乙醇']:ref.reagents,
          evidence:sentence,offset:pos,endOffset:pos+sentence.length,comparisonDOI:ref.doi});
      }
    }
  }
  return rows;
}
function mrLookup(product,maxDepth){
  if(![1,2].includes(maxDepth))throw new Error('可选深度为一或两步。');
  const index=Object.values(mrSources);const rows=[];
  function trace(target,depth){
    const s=index.find(r=>r.product===target);if(!s)return;
    rows.push({depth,product:s.product,reagents:s.reagents.slice(),type:s.type,doi:s.doi,source:s.reference,evidence:s.quote,location:s.location});
    if(depth<maxDepth)s.reagents.forEach(raw=>trace(raw,depth+1));
  }
  trace(product,1);return rows;
}
function mrDOILink(doi){return '<a target="_blank" rel="noopener noreferrer" href="https://doi.org/'+encodeURI(doi)+'">'+escapeHtml(doi)+'</a>';}
function openMaterialRoutes(mode,origin=null){
  if(!Object.hasOwn(mrModes,mode))throw new Error('未知的材料路线工具。');
  const text=mode==='reaction';
  const bound=origin&&text;
  const inputs=bound?'<label class="field">原文证据<textarea readonly name="passage" rows="5">'+escapeHtml(origin.text)+'</textarea></label><span>'+escapeHtml(origin.source)+'</span>':text?`<label class="field">载入研究文献<select name="preset"><option value="">粘贴或上传自己的文本</option>${Object.entries(mrSources).map(([key,s])=>'<option value="'+key+'">'+s.name+' · '+s.reference+'</option>').join('')}</select></label><label class="field">文献或实验记录<textarea name="passage" rows="5" required maxlength="100000" placeholder="粘贴包含反应物、反应方向与产物的原文"></textarea></label><label class="field">读取文本文件<input type="file" name="upload" accept=".txt,.md,.text"></label>`:
    '<label class="field">目标产物<select name="target">'+Object.values(mrSources).map(s=>'<option>'+s.product+'</option>').join('')+'</select></label>';
  const scope=text?'从原文中定位乙酸乙酯酯化、乙醇氧化两类反应。':'根据已收录文献逐步回查原料和出处。各步骤来自独立报道。';
  openModal(mrModes[mode],`<form class="stack" data-material-route="${mode}">${inputs}<p class="cat-note">${scope}</p><div class="actions"><button type="submit" class="btn primary">${text?'抽取反应':'查找文献路线'}</button></div><p class="form-error" data-route-error role="alert"></p><section data-route-output aria-live="polite"></section></form>`);
  if(bound){
    const form=document.querySelector('[data-material-route]');
    form.routeSource=origin.source;
    form.evidenceRef={resourceId:origin.resourceId,versionId:origin.versionId,blockId:origin.blockId,split:origin.split};
  }
}
function mrReset(form){form.routeResult=null;form.querySelector('[data-route-error]').textContent='';form.querySelector('[data-route-output]').replaceChildren();}
document.addEventListener('input',e=>{
  if(e.target.matches('[data-material-route] textarea')){
    const form=e.target.form;form.elements.preset.value='';form.elements.upload.value='';form.routeSource='粘贴文本';mrReset(form);
  }
});
document.addEventListener('change',async e=>{
  const form=e.target.closest('[data-material-route]');if(!form)return;const el=e.target,fields=form.elements;
  if(el===fields.preset){
    mrReset(form);fields.upload.value='';const ref=mrSources[el.value];fields.passage.value=ref?.quote||'';form.routeSource=ref?'文献原文 · '+ref.doi+' · '+ref.location:'粘贴文本';
  }else if(el===fields.upload&&el.files?.length){
    mrReset(form);const file=el.files[0];fields.preset.value='';fields.passage.value='';form.routeSource=file.name;
    try{
      if(file.size>400000)throw new Error('文本文件上限为 400 KB。');
      const text=await file.text();if(text.length>100000)throw new Error('文本超过 100000 个字符。');
      if(el.files[0]===file&&form.isConnected)fields.passage.value=text;
    }catch(error){form.querySelector('[data-route-error]').textContent=error.message;}
  }else if(el===fields.target)mrReset(form);
});
document.addEventListener('submit',e=>{
  const form=e.target.closest('[data-material-route]');if(!form)return;
  e.preventDefault();mrReset(form);
  const mode=form.dataset.materialRoute,box=form.querySelector('[data-route-output]');
  try{
    const extraction=mode==='reaction',target=form.elements.target?.value;
    const rows=extraction?mrExtract(form.elements.passage.value):mrLookup(target,mode==='single'?1:2);
    if(!rows.length){box.textContent='未找到有原文依据的反应。请核对物质名称与反应方向。';return;}
    const source=extraction?(form.routeSource||'粘贴文本'):rows.map(r=>r.doi).join('；');
    const details=rows.map(row=>`<article class="document"><h3>${extraction?escapeHtml(row.type):'逆查第 '+row.depth+' 步'} · ${escapeHtml(row.product)}</h3><p><b>反应物</b>　${escapeHtml(row.reagents.join('、'))}</p><p><b>原文</b>　${escapeHtml(row.evidence)}</p><p>${extraction?'原文字符 '+(row.offset+1)+'–'+row.endOffset+' · 对照文献':'原始研究 · '+escapeHtml(row.source)}　${mrDOILink(row.doi||row.comparisonDOI)}</p></article>`).join('');
    const stop=mode==='multi'&&rows.length===1?'<p>当前文献库只收录该目标的一步来源。</p>':'';
    box.innerHTML=details+stop+'<div class="actions"><button type="button" class="btn" data-route-save>保存或导出结果</button></div>';
    form.routeResult={title:mrModes[mode]+(target?' · '+target:''),payload:{mode,source,rows},source,evidence:form.evidenceRef};
  }catch(error){form.querySelector('[data-route-error]').textContent=error.message;}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-route-save]');if(!b)return;const r=b.form?.routeResult;if(!r)return;
  try{await materialsOfferResult(r.title,r.payload,r.source,r.evidence);}catch(error){notify(error.message,'error');}
});
