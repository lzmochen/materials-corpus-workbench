'use strict';

(() => {
  // Bonds use one-based indices as in the CTfile connection table.
  const reference = [
    ['乙醇','CCO','C2H6O','C C O',[[1,2,1],[2,3,1]]],
    ['乙酸乙酯','CCOC(=O)C','C4H8O2','C C O C O C',[[1,2,1],[2,3,1],[3,4,1],[4,5,2],[4,6,1]]],
    ['甲醇','CO','CH4O','C O',[[1,2,1]]],
    ['异丙醇','CC(O)C','C3H8O','C C O C',[[1,2,1],[2,3,1],[2,4,1]]],
    ['正丙醇','CCCO','C3H8O','C C C O',[[1,2,1],[2,3,1],[3,4,1]]],
    ['丙酮','CC(=O)C','C3H6O','C C O C',[[1,2,1],[2,3,2],[2,4,1]]],
    ['乙酸','CC(=O)O','C2H4O2','C C O O',[[1,2,1],[2,3,2],[2,4,1]]],
    ['乙二醇','OCCO','C2H6O2','O C C O',[[1,2,1],[2,3,1],[3,4,1]]]
  ].map(([name,smiles,formula,symbols,bonds])=>({name,smiles,formula,atoms:symbols.split(' '),bonds}));
  const elementSet=new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' '));
  const invalid=message=>{throw new Error(message);};
  let state,serial=0;
  const escape=value=>escapeHtml(String(value??''));
  const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
  function parseMol(body) {
    const lines=body.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n');
    if(!/V2000\s*$/.test(lines[3]||''))invalid('请选择 MOL V2000 结构文件，或使用结构图片核对。');
    const count=field=>/^\s*\d+\s*$/.test(field)?Number(field):NaN;
    const n=count(lines[3].slice(0,3)),m=count(lines[3].slice(3,6));
    if(!Number.isInteger(n)||n<1||n>999||!Number.isInteger(m)||m<0||m>999||lines.length<5+n+m)invalid('原子数、键数或结构文件长度不一致。');
    const atoms=[],coords=[],bonds=[],warnings=new Set(),seen=new Set();
    for(let i=0;i<n;i++){
      const l=lines[4+i],symbol=l.slice(31,34).trim();
      if(!elementSet.has(symbol))invalid('原子行 '+(i+1)+' 含未知元素或查询原子。');
      const xy=[l.slice(0,10),l.slice(10,20)].map(v=>v.trim()?Number(v):NaN);
      if(!xy.every(Number.isFinite))invalid('原子行 '+(i+1)+' 的平面坐标无效。');
      if(Number(l.slice(34,36))||Number(l.slice(36,39))||Number(l.slice(39,42))||Number(l.slice(42,45))||Number(l.slice(48,51)))warnings.add('含同位素、电荷、立体或指定价态标记');
      atoms.push(symbol);coords.push(xy);
    }
    for(let i=0;i<m;i++){
      const l=lines[4+n+i],a=count(l.slice(0,3)),b=count(l.slice(3,6)),order=count(l.slice(6,9));
      const key=[a,b].sort((x,y)=>x-y).join('-');
      if(!(a>=1&&a<=n&&b>=1&&b<=n)||a===b||![1,2,3,4].includes(order)||seen.has(key))invalid('第 '+(i+1)+' 条键的端点、键级或重复关系异常。');
      if(Number(l.slice(9,12)))warnings.add('含方向或立体化学键');
      seen.add(key);bonds.push([a,b,order]);
    }
    const end=lines.findIndex((l,i)=>i>=4+n+m&&/^M  END\s*$/.test(l));
    if(end<0)invalid('连接表缺少 M  END 结束标记。');
    if(lines.slice(4+n+m,end).some(l=>l.trim()))warnings.add('含连接表扩展属性');
    return {title:lines[0].trim(),atoms,coords,bonds,warnings:[...warnings]};
  }
  function heavyGraph(mol) {
    const keep=mol.atoms.map((a,i)=>a==='H'?-1:i).filter(i=>i>=0);
    const map=new Map(keep.map((a,j)=>[a,j])),edges=keep.map(()=>[]),hs=keep.map(()=>0);
    const hydrogenDegrees=mol.atoms.map(()=>0);
    for(const [a,b,n] of mol.bonds){
      const x=map.get(a-1),y=map.get(b-1);
      if(x!==undefined&&y!==undefined){edges[x].push([y,n]);edges[y].push([x,n]);}
      else{
        if(x===undefined)hydrogenDegrees[a-1]++;
        if(y===undefined)hydrogenDegrees[b-1]++;
        if((x===undefined&&y===undefined)||n!==1)return null;
        hs[x===undefined?y:x]++;
      }
    }
    if(mol.atoms.some((v,i)=>v==='H'&&hydrogenDegrees[i]!==1))return null;
    const atoms=keep.map(i=>mol.atoms[i]);
    if(atoms.some((s,i)=>['C','O'].includes(s)&&hs[i]+edges[i].reduce((sum,pair)=>sum+pair[1],0)>(s==='C'?4:2)))return null;
    return {atoms,edges};
  }
  function equivalent(a,b) {
    if(!a||!b||a.atoms.length!==b.atoms.length)return false;
    const sig=(g,i)=>[g.atoms[i],...g.edges[i].map(([k,o])=>g.atoms[k]+o).sort()].join(':');
    const choices=a.atoms.map((_,i)=>b.atoms.map((_,k)=>k).filter(k=>sig(a,i)===sig(b,k)));
    const order=a.atoms.map((_,i)=>i).sort((i,j)=>choices[i].length-choices[j].length), map=new Map(),used=new Set();
    function match(depth) {
      if(depth===order.length)return true;
      const i=order[depth];
      for(const k of choices[i]){
        if(used.has(k)||a.edges[i].some(([j,o])=>map.has(j)&&!b.edges[k].some(([v,n])=>v===map.get(j)&&n===o)))continue;
        map.set(i,k);used.add(k);if(match(depth+1))return true;map.delete(i);used.delete(k);
      }
      return false;
    }
    return match(0);
  }
  function identify(mol) {
    if(mol.warnings.length||mol.atoms.length>100)return null;
    const key=heavyGraph(mol);
    return reference.find(r=>equivalent(key,heavyGraph(r)))||null;
  }
  function exampleMol(i) {
    const v=reference[i],xy=i===0?[[0,0],[1.3,.75],[2.6,0]]:[[0,0],[1.3,.75],[2.6,0],[3.9,.75],[3.9,2.25],[5.2,0]];
    const num=v=>String(v).padStart(3);
    return [v.name,'Materials Corpus','',''+num(v.atoms.length)+num(v.bonds.length)+'  0  0  0  0            999 V2000',
      ...v.atoms.map((s,j)=>[...xy[j],0].map(z=>z.toFixed(4).padStart(10)).join('')+' '+s.padEnd(3)+' 0  0  0  0  0  0  0  0  0  0  0  0'),
      ...v.bonds.map(b=>b.map(num).join('')+'  0  0  0  0'),'M  END',''].join('\n');
  }
  // The raster library is deliberately narrow. Use the line arrangement + typography of two reference diagrams.
  function referenceImage(i) {
    const c=canvas(560,240),g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);
    g.lineWidth=4;g.lineCap='round';g.strokeStyle='#152532';g.fillStyle='#152532';g.font='32px Arial';
    function path(points){g.beginPath();for(const [k,p] of points.entries()){if(k)g.lineTo(...p);else g.moveTo(...p);}g.stroke();}
    if(i===0){path([[142,136],[202,99],[255,130]]);g.fillText('OH',261,147);}
    else{path([[56,154],[124,113],[182,147]]);g.fillText('O',189,164);path([[222,149],[280,115],[340,151]]);path([[274,110],[274,66]]);path([[285,110],[285,66]]);g.fillText('O',265,56);}
    return c;
  }
  function fingerprint(im) {
    const iw=im.naturalWidth||im.width,ih=im.naturalHeight||im.height;
    const scale=Math.min(1,640/Math.max(iw,ih));const c=canvas(Math.max(1,Math.round(iw*scale)),Math.max(1,Math.round(ih*scale))),g=c.getContext('2d',{willReadFrequently:true});
    g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
    const d=g.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=-1,b=-1;
    const luminance=(a,i)=>(a[i]*.299+a[i+1]*.587+a[i+2]*.114);
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(luminance(d,4*(y*c.width+x))<165){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y);}}
    if(r-l<5||b-t<3)invalid('图像中没有可辨的结构线条。');
    const a=canvas(112,72),h=a.getContext('2d',{willReadFrequently:true});h.fillStyle='white';h.fillRect(0,0,112,72);
    const w=r-l+1,hh=b-t+1,ratio=Math.min(106/w,66/hh);h.drawImage(c,l,t,w,hh,(112-w*ratio)/2,(72-hh*ratio)/2,w*ratio,hh*ratio);
    const pix=h.getImageData(0,0,112,72).data;
    return Array.from({length:112*72},(_,i)=>luminance(pix,i*4)<185);
  }
  function compare(i,j){let both=0,either=0;for(let n=0;n<i.length;n++){if(i[n]||j[n])either++;if(i[n]&&j[n])both++;}return either?both/either:0;}
  function result(title,rows,why,extra='') {
    state.result={title,rows,source:state.source};
    const html='<div class="document"><h3>'+escape(title)+'</h3>'+svcSummary(Object.entries(rows))+(why?'<p>'+escape(why)+'</p>':'')+extra+
      '<div class="actions"><button type="button" class="btn" data-mol="json">导出结果 JSON</button>'+
      (workCan('operator','lead','admin')?'<button type="button" class="btn primary" data-mol="offer">作为资料登记</button>':'')+'</div></div>';
    document.getElementById('mol-result').innerHTML=html;
  }
  function showRecord(i) {
    const m=parseMol(state.mols[i]),ref=identify(m);
    const count={};for(const a of m.atoms)count[a]=(count[a]||0)+1;
    const counts=Object.keys(count).sort().map(k=>k+' × '+count[k]).join('，');
    const rows={'识别方式':'MOL 连接表解析','记录序号':i+1,'显式原子':counts,'键数':m.bonds.length,'结构对照':ref?ref.name:'未确定'};
    if(ref){rows['对照分子式']=ref.formula;rows['对照 SMILES']=ref.smiles;}
    const first=m.bonds.slice(0,80).map(([a,b,o])=>[a+' '+m.atoms[a-1],b+' '+m.atoms[b-1],['','单键','双键','三键','芳香键'][o]]);
    result(ref?ref.name+' · 连接表匹配':'连接表解析结果',rows,m.warnings.length?m.warnings.join('；')+'。请人工核对结构身份。':ref?'元素、连接关系与键级均匹配中性参考结构；分子式包含常规隐式氢。':'当前参考库没有能确定该物质的结构。','<details><summary>查看键连接表 · '+m.bonds.length+' 条</summary>'+workTable(['原子一','原子二','键级'],first)+(m.bonds.length>80?'<p>显示前 80 条。</p>':'')+'</details>');
  }
  function showFile(src,name) {
    const input=src.replace(/\r\n?/g,'\n').split(/^\$\$\$\$[ \t]*(?:\n|$)/m).filter(i=>i.trim());
    if(!input.length||input.length>500)invalid('一次支持 1 至 500 条 SDF 记录。');
    state={source:name,mols:input,result:null};const area=document.getElementById('mol-preview');
    area.innerHTML=input.length>1?'<label class="field">结构记录<select data-mol-select>'+input.map((s,i)=>'<option value="'+i+'">'+(i+1)+' · '+escape(s.split('\n')[0].slice(0,70)||'未命名')+'</option>').join('')+'</select></label>':'';
    document.getElementById('mol-result').innerHTML='';showRecord(0);
  }
  function showPicture(im,name) {
    state={source:name,result:null};
    const host=document.getElementById('mol-preview');host.innerHTML='';
    const wrap=document.createElement('div');wrap.className='document';const thumb=canvas(560,240);thumb.setAttribute('aria-label','待核对结构原图');thumb.style.cssText='max-width:100%;height:auto;border:1px solid #dde6ed;background:white';const g=thumb.getContext('2d');
    g.fillStyle='white';g.fillRect(0,0,560,240);const w=im.naturalWidth||im.width,h=im.naturalHeight||im.height,z=Math.min(550/w,230/h);g.drawImage(im,(560-w*z)/2,(240-h*z)/2,w*z,h*z);wrap.append(thumb);host.append(wrap);
    const fp=fingerprint(im);const ranked=[0,1].map(i=>[i,compare(fp,fingerprint(referenceImage(i)))]).sort((a,b)=>b[1]-a[1]);
    const [i,score]=ranked[0],match=score>=.85 && score-ranked[1][1]>=.14;
    const rows={'识别方式':match?'标准图样比对':'标准图样比对 · 未匹配','标准图库':'乙醇、乙酸乙酯','图样重合度':(100*score).toFixed(1)+'%','候选名称':match?reference[i].name:'待人工核对'};
    if(match)rows['参考 SMILES']=reference[i].smiles;
    result(match?'图样候选 · '+reference[i].name:'待人工转录',rows,'重合度按对齐后的线条计算。拍摄角度、标注或绘图方式改变时，请核对原图。',
      '<details'+(match?'':' open')+'><summary>对照原图登记人工转录</summary><label class="field">核对名称<input data-mol-name maxlength="100"></label><label class="field">转录 SMILES<input data-mol-smiles maxlength="500" spellcheck="false"></label><button type="button" class="btn" data-mol="manual">确认转录</button></details>');
  }
  function open() {
    serial++;state={source:'',result:null};
    openModal('分子结构识别与核对','<div class="stack" id="molecule-tool"><label class="field">结构文件或结构图片<input type="file" data-mol-file accept=".mol,.sdf,.png,.jpg,.jpeg,.webp"></label><p>支持 MOL V2000、SDF 多记录及 PNG、JPEG、WebP 原图。图片可做标准图样比对和人工转录。</p><div class="actions"><button class="btn" type="button" data-mol="mol">读取乙酸乙酯连接表</button><button class="btn" type="button" data-mol="image">比对乙醇结构图</button></div><div id="mol-preview"></div><div id="mol-result" aria-live="polite"></div></div>');
  }
  document.addEventListener('change',async e=>{
    const el=e.target;if(!el.closest?.('#molecule-tool'))return;
    try{
      if(el.matches('[data-mol-select]')){state.result=null;document.getElementById('mol-result').innerHTML='';showRecord(Number(el.value));return;}
      if(!el.matches('[data-mol-file]')||!el.files[0])return;
      const ticket=++serial,file=el.files[0];state.result=null;document.getElementById('mol-result').innerHTML='';document.getElementById('mol-preview').innerHTML='';
      if(file.size>8*1024*1024)invalid('文件须小于 8 MiB。');
      if(/\.(mol|sdf)$/i.test(file.name)){const src=await file.text();if(ticket===serial&&document.getElementById('mol-preview'))showFile(src,file.name);}
      else if(/\.(png|jpe?g|webp)$/i.test(file.name)){const im=new Image();im.src=await new Promise((ok,no)=>{const f=new FileReader();f.onload=()=>ok(f.result);f.onerror=()=>no(new Error('无法读取结构图片。'));f.readAsDataURL(file);});await im.decode();if(!im.naturalWidth||im.naturalWidth*im.naturalHeight>50000000)invalid('图像尺寸过大。');if(ticket===serial&&document.getElementById('mol-preview'))showPicture(im,file.name);}
      else invalid('文件格式不受支持。');
    }catch(err){notify(err.message,'error');}
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest?.('[data-mol]');if(!button)return;
    try{
      switch(button.dataset.mol){
        case 'mol':serial++;showFile(exampleMol(1),'内置乙酸乙酯中性结构参考.mol');break;
        case 'image':serial++;showPicture(referenceImage(0),'内置乙醇标准线式图.png');break;
        case 'manual':{
          const name=document.querySelector('[data-mol-name]').value.trim(),smiles=document.querySelector('[data-mol-smiles]').value.trim();
          if(!name||!smiles)invalid('请填写核对名称与转录 SMILES。');
          result(name+' · 人工转录',{'识别方式':'人工对照图片转录','核对名称':name,'人工转录 SMILES':smiles},'记录保留操作者输入；SMILES 尚待独立结构验证。');break;
        }
        case 'json':if(state.result)downloadJson('材料结构核对.json',state.result);break;
        case 'offer':if(state.result&&workCan('operator','lead','admin'))materialsOfferResult(state.result.title,state.result.rows,state.result.source);break;
      }
    }catch(err){notify(err.message,'error');}
  });
  window.openStructureReader=open;
})();
