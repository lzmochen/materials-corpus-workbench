'use strict';

const moleculeModes={formula:'多肽分子式',mass:'蛋白质分子量',pi:'等电点与分子量'};
const moleculeElements=['C','H','N','O','S'];
const moleculeMass={C:12.011,H:1.008,N:14.007,O:15.999,S:32.06,D:2.014101778};
// Neutral peptide residues (free amino acid minus H₂O), in C,H,N,O,S order.
const moleculeResidues={
  A:[3,5,1,1,0],R:[6,12,4,1,0],N:[4,6,2,2,0],D:[4,5,1,3,0],C:[3,5,1,1,1],
  E:[5,7,1,3,0],Q:[5,8,2,2,0],G:[2,3,1,1,0],H:[6,7,3,1,0],I:[6,11,1,1,0],
  L:[6,11,1,1,0],K:[6,12,2,1,0],M:[5,9,1,1,1],F:[9,9,1,1,0],P:[5,7,1,1,0],
  S:[3,5,1,2,0],T:[4,7,1,2,0],W:[11,10,2,1,0],Y:[9,9,1,2,0],V:[5,9,1,1,0]
};
const moleculeThreeLetter=new Set('ALA ARG ASN ASP CYS GLU GLN GLY HIS ILE LEU LYS MET PHE PRO SER THR TRP TYR VAL'.split(' '));
const moleculePositivePk={K:10,R:12,H:5.98};
const moleculeNegativePk={D:4.05,E:4.45,C:9,Y:10};
const moleculeNtermPk={A:7.59,M:7,S:6.93,P:8.36,T:6.82,V:7.44,E:7.7};
const moleculeCtermPk={D:4.55,E:4.75};
function moleculeSequence(raw){
  const lines=raw.trim().split(/\r\n|[\r\n]/);
  let title='';
  if(lines[0]?.startsWith('>'))title=lines.shift().slice(1).trim();
  if(lines.some(l=>l.trimStart().startsWith('>')))throw new Error('每次处理一条 FASTA 序列，请分开提交多条记录。');
  const sequence=lines.join('').replace(/\s/g,'').toUpperCase();
  if(!sequence)throw new Error('请填写氨基酸序列。');
  if(sequence.length>100000)throw new Error('单条序列最多 100000 个残基。');
  const unknown=[...new Set([...sequence].filter(ch=>!Object.hasOwn(moleculeResidues,ch)))];
  if(unknown.length)throw new Error('只接受 20 种标准氨基酸的一字母代码，请核对字符 '+unknown.slice(0,8).join('、')+'。');
  return {title,sequence};
}
function moleculePI(sequence,counts){
  const positive=[[1,moleculeNtermPk[sequence[0]]??7.5],...Object.entries(moleculePositivePk).map(([aa,k])=>[counts[aa]||0,k])];
  const negative=[[1,moleculeCtermPk[sequence.at(-1)]??3.55],...Object.entries(moleculeNegativePk).map(([aa,k])=>[counts[aa]||0,k])];
  let low=0,high=14;
  for(let step=0;step<55;step++){
    const ph=(low+high)/2;
    const charge=positive.reduce((total,[n,pk])=>total+n/(1+10**(ph-pk)),0)
      -negative.reduce((total,[n,pk])=>total+n/(1+10**(pk-ph)),0);
    if(charge>0)low=ph;else high=ph;
  }
  return (low+high)/2;
}
function moleculeComposition(atoms){
  const elements=[...moleculeElements,'D'].filter(k=>atoms[k]>0);
  return {formula:elements.map(k=>k+(atoms[k]===1?'':atoms[k])).join(''),
    massDa:+elements.reduce((total,k)=>total+atoms[k]*moleculeMass[k],0).toFixed(6)};
}
function moleculeSequenceRecord(raw){
  const {title,sequence}=moleculeSequence(raw);
  const counts={},atoms={C:0,H:2,N:0,O:1,S:0};
  for(const aa of sequence)counts[aa]=(counts[aa]||0)+1;
  for(const [aa,n] of Object.entries(counts))moleculeElements.forEach((el,i)=>{atoms[el]+=moleculeResidues[aa][i]*n;});
  return {sourceType:'sequence',title,sequence,length:sequence.length,atoms,...moleculeComposition(atoms),
    theoreticalPI:+moleculePI(sequence,counts).toFixed(6),residueCounts:counts,
    assumptions:'单条线性肽链、游离氨基端和羧基端、还原态；不计修饰、盐、水合物。',pIMethod:'Bjellqvist pKa；Henderson–Hasselbalch 净电荷零点。'};
}
function moleculePdbRecord(raw){
  if(raw.length>8*1024*1024)throw new Error('单个 PDB 文件上限为 8 MiB。');
  const atomsBySite=new Map();
  let model='1',seenModel=false;
  for(const line of raw.split(/\r\n|[\r\n]/)){
    const kind=line.slice(0,6).trim();
    if(kind==='MODEL'){if(seenModel||atomsBySite.size)break;model=line.slice(6).trim()||'1';seenModel=true;continue;}
    if(kind==='ENDMDL')break;
    if(kind!=='ATOM'||!moleculeThreeLetter.has(line.slice(17,20).trim()))continue;
    const elem=line.slice(76,78).trim().toUpperCase(),name=line.slice(12,16).trim();
    if(!name||!Object.hasOwn(moleculeMass,elem))throw new Error('PDB 的 ATOM 记录需要原子名及第 77–78 列明确的元素符号（C、H、N、O、S 或 D）。');
    const res=line.slice(21,27),site=res+'|'+name,occText=line.slice(54,60).trim();
    const occupancy=occText===''?1:Number(occText);
    if(!Number.isFinite(occupancy)||occupancy<0||occupancy>1)throw new Error('PDB 原子占有率须为 0–1。');
    if(occupancy===0)continue;
    const alt=line[16]||' ',prev=atomsBySite.get(site);
    if(!prev||occupancy>prev.occupancy||(occupancy===prev.occupancy&&alt<prev.alt))atomsBySite.set(site,{elem,res,occupancy,alt});
  }
  if(!atomsBySite.size)throw new Error('未找到标准氨基酸的有效 ATOM 记录，请检查 PDB 固定列格式。');
  const atoms={},residues=new Set();
  for(const a of atomsBySite.values()){atoms[a.elem]=(atoms[a.elem]||0)+1;residues.add(a.res);}
  return {sourceType:'PDB 显式原子',model,length:residues.size,atomCount:atomsBySite.size,atoms,...moleculeComposition(atoms),
    assumptions:'首个模型中的标准氨基酸 ATOM 记录，排除 HETATM、溶剂及零占有率原子。每个原子位点取占有率最高的构象，并列时按构象标识排序；不补氢或缺失原子。'};
}
function openMoleculeCalculator(mode){
  if(!Object.hasOwn(moleculeModes,mode))throw new Error('未知理化计算工具。');
  const source=mode==='mass'?'<label class="field">输入类型<select name="source"><option value="sequence">氨基酸序列</option><option value="pdb">PDB 显式原子</option></select></label>':'';
  openModal(moleculeModes[mode],`<form class="stack" data-molecule-form="${mode}">${source}<label class="field"><span data-molecule-label>氨基酸序列</span><textarea name="content" rows="5" required placeholder="粘贴一字母代码或单条 FASTA，例 GG"></textarea></label><label class="field">从文件读取<input name="file" type="file" accept=".txt,.fasta,.faa,.fa"></label><div class="actions"><button class="btn" type="button" data-molecule-example>使用甘氨酰甘氨酸样例</button><button class="btn primary" type="submit">计算</button></div><p class="form-error" role="alert" data-molecule-error></p><section data-molecule-result aria-live="polite"></section></form>`);
}
function moleculeClear(form){form.moleculeRecord=null;form.querySelector('[data-molecule-error]').textContent='';form.querySelector('[data-molecule-result]').replaceChildren();}
function moleculeResults(form,r){
  const mode=form.dataset.moleculeForm,pdb=r.sourceType!=='sequence';
  const summary=[['残基数',r.length]];
  if(mode==='formula')summary.unshift(['分子式',r.formula]);
  if(mode==='pi')summary.unshift(['理论等电点',r.theoreticalPI.toFixed(2)]);
  if(mode!=='formula')summary.push([pdb?'显式原子质量':'平均分子质量',r.massDa.toFixed(3)+' Da']);
  if(pdb)summary.push(['模型',r.model],['计入原子',r.atomCount]);
  const source=mode==='pi'?'<p>按 Bjellqvist 端基与侧链 pKa 求净电荷零点。该结果为模型估计，短肽对端基参数尤为敏感。 <a href="https://web.expasy.org/compute_pi/pi_tool-doc.html" target="_blank" rel="noopener noreferrer">计算方法</a></p>':'';
  form.querySelector('[data-molecule-result]').innerHTML='<div class="document"><h3>计算结果</h3>'+workTable(['项目','结果'],summary.map(([k,v])=>[k,escapeHtml(v)]))+'<p>'+escapeHtml(r.assumptions)+'</p>'+source+'</div><div class="actions"><button type="button" class="btn" data-molecule-export>下载计算记录</button><button type="button" class="btn" data-molecule-register>整理为语料记录</button></div>';
}
document.addEventListener('input',e=>{if(e.target.matches('[data-molecule-form] textarea'))moleculeClear(e.target.form);});
document.addEventListener('change',async e=>{
  const form=e.target.closest('[data-molecule-form]');if(!form)return;
  const {content,file,source}=form.elements;
  const pdb=source?.value==='pdb';
  if(e.target===source){
    content.value='';file.value='';file.accept=pdb?'.pdb,.ent,.txt':'.txt,.fasta,.faa,.fa';
    form.querySelector('[data-molecule-label]').textContent=pdb?'PDB 原子记录':'氨基酸序列';
    content.placeholder=pdb?'粘贴 PDB 固定列 ATOM 记录':'粘贴一字母代码或单条 FASTA，例 GG';
    form.querySelector('[data-molecule-example]').hidden=pdb;
    moleculeClear(form);
  }
  if(e.target===file&&file.files.length){
    const selected=file.files[0];moleculeClear(form);
    if(selected.size>8*1024*1024){content.value='';form.querySelector('[data-molecule-error]').textContent='文件上限为 8 MiB。';return;}
    try{const txt=await selected.text();if(file.files[0]===selected&&form.isConnected){content.value=txt;moleculeClear(form);}}
    catch{form.querySelector('[data-molecule-error]').textContent='无法读取所选文件。';}
  }
});
document.addEventListener('click',e=>{
  const btn=e.target.closest('[data-molecule-example],[data-molecule-export],[data-molecule-register]');if(!btn)return;
  const form=btn.form;
  if(btn.hasAttribute('data-molecule-example')){form.elements.content.value='>甘氨酰甘氨酸\nGG';moleculeClear(form);form.elements.content.focus();return;}
  if(btn.hasAttribute('data-molecule-register')&&form.moleculeRecord){materialsOfferResult(moleculeModes[form.dataset.moleculeForm],form.moleculeRecord,'本地理化计算 · '+form.moleculeRecord.sourceType);return;}
  if(form.moleculeRecord)downloadJson(moleculeModes[form.dataset.moleculeForm]+'-计算记录.json',form.moleculeRecord);
});
document.addEventListener('submit',e=>{
  const form=e.target.closest('[data-molecule-form]');if(!form)return;e.preventDefault();moleculeClear(form);
  try{
    const r=form.elements.source?.value==='pdb'?moleculePdbRecord(form.elements.content.value):moleculeSequenceRecord(form.elements.content.value);
    r.tool=moleculeModes[form.dataset.moleculeForm];r.calculatedAt=new Date().toISOString();r.atomicWeights=moleculeMass;
    form.moleculeRecord=r;moleculeResults(form,r);
  }catch(error){form.querySelector('[data-molecule-error]').textContent=error.message;}
});
