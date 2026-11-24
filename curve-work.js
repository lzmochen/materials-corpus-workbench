'use strict';
(() => {
  const H = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const copy = x => JSON.parse(JSON.stringify(x));
  const uid = () => globalThis.crypto?.randomUUID?.() || 'p'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  const color = c => /^#[a-f\d]{6}$/i.test(c) ? c : '#046aa8';
  const labels = {draft:'草稿',submitted:'待复核',review:'待复核',pending:'待复核',approved:'已通过',returned:'已退回'};
  const modes = [['point','选点'],['box','框选'],['add','补点'],['pan','平移'],['roi','绘制图区'],['erase','橡皮擦']];
  const tips = {point:'点击选点，拖动可调整位置。方向键微调，Shift 加大步长。',box:'在图中拖出矩形选中多个点。按住 Shift 可追加选择。',add:'点击画布，在当前颜色序列补入数据点。',pan:'拖动画布平移，滚轮以光标为中心缩放。',roi:'沿坐标轴内沿拖出绘图区。已有数据点将按新坐标重新映射。',erase:'拖动擦除网格或污渍。擦除范围内的提取点会同步清理。'};
  const icons = {point:'M5 3l13 9-6 1-2 6z',box:'M3 8V3h5m5 0h5v5m0 5v5h-5m-5 0H3v-5',add:'M10 3v14M3 10h14',pan:'M10 2v16M2 10h16M7 5l3-3 3 3m-6 10 3 3 3-3M5 7l-3 3 3 3m10-6 3 3-3 3',roi:'M3 6h11v11M6 3v11h11',erase:'M3 12l8-9 6 5-8 9H7zM7 8l6 5m-3 4h8',chart:'M2 3v14h16M4 13l4-5 3 3 6-7',fit:'M7 3H3v4m10-4h4v4M3 13v4h4m10-4v4h-4'};
  const icon = key => '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="'+icons[key]+'"/></svg>';
  function button(action,label,options={}) {
    return '<button type="button" data-cw="'+action+'" class="cw-btn '+(options.cls||'')+'"'+(options.disabled?' disabled':'')+(options.title?' title="'+H(options.title)+'"':'')+(options.pressed!=null?' aria-pressed="'+options.pressed+'"':'')+'>'+(options.icon?icon(options.icon):'')+H(label)+'</button>';
  }
  function options(rows,selected){return rows.map(([v,t])=>'<option value="'+H(v)+'"'+(String(selected)===String(v)?' selected':'')+'>'+H(t)+'</option>').join('');}
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  const baseAxes=()=>({x:{min:0,max:1,scale:'linear',label:'X'},y:{min:0,max:1,scale:'linear',label:'Y'},y2:{min:0,max:1,scale:'linear',label:'Y₂'}});
  const fresh=()=>({width:0,height:0,roi:null,axes:baseAxes(),dual:false,confirmed:false,series:[],strokes:[],snapshots:[]});
  const format = v => Number.isFinite(v) ? Number(v.toPrecision(7)).toString() : '';
  const base='/api/curve-records';
  const examples=[['stress','材料应力–应变曲线'],['polarization','电化学极化回线']];
  const statusName=v=>labels[v]||v||'未保存';
  function readBlob(blob) {return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('读取图片失败。'));r.readAsDataURL(blob);});}
  function readImage(data) {return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('无法读取图片。请使用 PNG、JPEG 或 WebP 格式。'));img.src=data;});}
  function imageUrl(filename,base64) {const ext=String(filename).toLowerCase().split('.').pop();return 'data:'+({jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',png:'image/png'}[ext]||'image/png')+';base64,'+base64;}
  function seriesNew(name,c='#066aa7',side='left'){return {id:uid(),name,color:color(c),side,points:[]};}
  function normalizePts(points){return points.map(p=>({id:p.id||uid(),px:Number(p.px),py:Number(p.py),branch:Number(p.branch)||0})).filter(p=>Number.isFinite(p.px)&&Number.isFinite(p.py));}
  class CurveEditor extends HTMLElement {
    connectedCallback(){
      if(this.ready)return;
      this.ready=true;this.model=fresh();this.records=[];this.record=null;this.source=null;this.active='';this.selected=new Set();this.history=[];this.future=[];
      this.mode='point';this.layer='overlay';this.solo=false;this.tab='axes';this.page=0;this.zoom=1;this.offset={x:0,y:0};this.dirty=false;this.busy=false;this.title='';this.note='';this.snapMessage='';this.radius=9;this.clean={removeGrid:true,removeBorder:true,removeLegend:true};
      this.innerHTML='<div class="cw-head"><div class="cw-title">'+icon('chart')+'<div><h1>曲线标注与校核</h1></div></div><div class="cw-files"></div></div><div class="cw-notice" role="status" aria-live="polite"></div><div class="cw-body"><section class="cw-panel cw-plot"><header class="cw-plot-heading"></header><div class="cw-tools"></div><div class="cw-stage"><canvas tabindex="0" aria-label="曲线编辑画布，方向键微调选中点"></canvas></div><div class="cw-foot"></div></section><aside class="cw-panel cw-side"><div class="cw-tabs"></div><div class="cw-settings"></div></aside></div><section class="cw-panel cw-data"></section><dialog class="cw-modal"><div></div></dialog>';
      this.plot=this.querySelector('.cw-stage canvas');this.stage=this.plot.parentElement;this.modal=this.querySelector('dialog');
      this.addEventListener('click',e=>this.click(e));this.addEventListener('change',e=>{try{this.change(e);}catch(error){this.msg(error.message,true);this.data();}});this.addEventListener('keydown',e=>this.keys(e));
      this.addEventListener('focusin',e=>{const id=e.target.dataset.point;if(!id)return;this.selected=new Set([id]);for(const row of this.querySelectorAll('[data-row]')){const active=row.dataset.row===id;row.classList.toggle('cw-picked',active);row.querySelector('input[type=checkbox]').checked=active;}this.paint();});
      this.plot.addEventListener('pointerdown',e=>this.down(e));this.plot.addEventListener('pointermove',e=>this.move(e));this.plot.addEventListener('pointerup',e=>this.up(e));this.plot.addEventListener('pointercancel',e=>this.up(e,true));
      this.plot.addEventListener('wheel',e=>{e.preventDefault();this.zoomAt(this.zoom*Math.exp(-e.deltaY*.0016),this.pointer(e));},{passive:false});
      this.resize=new ResizeObserver(()=>this.paint());this.resize.observe(this.stage);
      this.render();this.start();
    }
    disconnectedCallback(){this.resize?.disconnect();this.ready=false;}
    get me(){return window.workspaceUser||{};}
    get editing(){return !this.busy && (workCan('operator','annotator')) && (!this.record || this.record.canEdit===true);}
    get reviewing(){return !this.busy && this.record?.canReview===true;}
    get current(){return this.model.series.find(s=>s.id===this.active);}
    pixelAxes(){const m=this.model,r=m.roi;if(m.confirmed||!r)return;
      if(m.axes.x.label==='X (px)')Object.assign(m.axes.x,{min:r.left,max:r.right,scale:'linear',reverse:false});
      if(m.axes.y.label==='Y (px)')Object.assign(m.axes.y,{min:r.top,max:r.bottom,scale:'linear',reverse:true});
    }
    msg(s,error=false){this.note=s;let node=this.querySelector('.cw-notice');node.textContent=s;node.classList.toggle('cw-error',error); }
    async action(fn){if(this.busy)return;try{await fn();}catch(e){this.msg(e.message||'操作未完成，请重试。',true);}}
    async block(fn){if(this.busy)return;this.busy=true;this.setAttribute('aria-busy','true');try{return await fn();}finally{this.busy=false;this.removeAttribute('aria-busy');this.render();}}
    async start(){await this.action(async()=>{await this.refreshList();const origin=window.curveOpenSource;delete window.curveOpenSource;
      if(origin)await this.resource(origin.resourceId,origin.versionId);
      else if(workCan('expert')&&this.records.length){const r=this.records.find(r=>['submitted','review','pending'].includes(r.status))||this.records[0];await this.openRecord(r.id);}
      else await this.example('stress');
    });}
    async refreshList(){this.records=await api(base);this.header();}
    async sourceFile(ref){const f=await api('/api/resources/'+encodeURIComponent(ref.resourceId)+'/versions/'+encodeURIComponent(ref.versionId)+'/file');return {filename:f.filename,contentBase64:f.contentBase64};}
    async resource(resourceId,versionId){const source={resourceId,versionId};const f=await this.sourceFile(source);await this.loadImage(f,source,f.filename);}
    async example(id){
      const filename='curve-'+id+'.png';const r=await fetch(filename);if(!r.ok)throw new Error('示例图片未能加载。您也可以导入本地图片。');
      const f={filename,contentBase64:await readBlob(await r.blob())};let meta=window.curveSampleMetadata?.[id]||null;
      if(!meta){try{const res=await fetch('curve-samples.json');if(res.ok){const m=await res.json();meta=Array.isArray(m)?m.find(v=>v.id===id):m[id]||m.samples?.[id]||null;}}catch{}}
      await this.loadImage(f,{...f,example:id,sourceNote:meta?.sourceNote||'科研教学合成示例'},meta?.title||examples.find(x=>x[0]===id)[1],meta);
    }
    async loadImage(f,source,title,meta=null,saved=null){
      const img=await readImage(imageUrl(f.filename,f.contentBase64));
      const original=canvas(img.naturalWidth,img.naturalHeight);original.getContext('2d').drawImage(img,0,0);
      this.original=original;this.source=source;this.title=title;this.record=saved;
      this.model=saved?Object.assign(fresh(),copy(saved.state)):fresh();
      const m=this.model;m.width=original.width;m.height=original.height;
      if(!saved){m.axes=Object.assign(baseAxes(),copy(meta?.axes||{}));m.roi=meta?.roi||{left:0,top:0,right:m.width-1,bottom:m.height-1};m.confirmed=!!meta?.axes;m.dual=!!(meta?.dual||meta?.axes?.y2);m.hints=meta||null;} if(!m.hints && m.series.length===0 && !saved && !meta){m.axes.x={min:0,max:m.width-1,scale:'linear',label:'X (px)'};m.axes.y={min:0,max:m.height-1,scale:'linear',reverse:true,label:'Y (px)'};}
      m.series.forEach(s=>{s.id||=uid();s.points=normalizePts(s.points||[]);s.color=color(s.color);s.side||='left';});
      this.active=m.series[0]?.id||'';this.selected.clear();this.page=0;this.layer='overlay';this.mode='point';this.history=[];this.future=[];this.zoom=1;this.offset={x:0,y:0};this.dirty=false;this.rebuild();this.render();
      this.msg(saved?'已打开标注记录。'+(saved.reviewNote?' 复核意见：'+saved.reviewNote:''):(m.confirmed?'科研教学合成示例，坐标已载入。点击“自动提取”生成数据点。':'图片已载入。可先自动提取，再按原图校准坐标。'));
    }
    async openRecord(id){const r=await api(base+'/'+encodeURIComponent(id));const src=r.source;const f=src.contentBase64?src:await this.sourceFile(src);await this.loadImage(f,src,r.title,null,r);}
    snapshotState(){const {snapshots,hints,...s}=this.model;return copy(s);}
    restore(s){const {snapshots,hints}=this.model;this.model=Object.assign(fresh(),copy(s),{snapshots,hints});if(!this.current)this.active=this.model.series[0]?.id||'';this.selected.clear();this.page=0;this.dirty=true;this.rebuild();this.render();}
    remember(){this.history.push(this.snapshotState());if(this.history.length>14)this.history.shift();this.future=[];this.dirty=true;}
    rebuild(){
      if(!this.original)return;this.cleaned=canvas(this.original.width,this.original.height);const ctx=this.cleaned.getContext('2d',{willReadFrequently:true});ctx.drawImage(this.original,0,0);
      for(const s of this.model.strokes||[])this.drawStroke(ctx,s);
    }
    drawStroke(ctx,s){if(!s.points.length)return;ctx.save();ctx.strokeStyle=ctx.fillStyle=this.model.background||'#ffffff';ctx.lineJoin=ctx.lineCap='round';ctx.lineWidth=s.radius*2;ctx.beginPath();
      s.points.forEach((p,i)=>i?ctx.lineTo(p.px,p.py):ctx.moveTo(p.px,p.py));ctx.stroke();
      const p=s.points[0];ctx.beginPath();ctx.arc(p.px,p.py,s.radius,0,Math.PI*2);ctx.fill();ctx.restore();}
    render(){this.header();this.tools();this.sidebar();this.data();this.paint();}
    header(){
      if(!this.ready)return;this.querySelector('.cw-files').innerHTML=button('sources','图像来源',{icon:'chart'})+button('records','标注记录'+(this.records.length?' · '+this.records.length:''))+ '<span class="cw-divider"></span>'+ (this.editing?button('save','保存草稿',{disabled:!this.original})+button('submit','提交复核',{cls:'cw-primary',disabled:!this.model.series.some(s=>s.points.length)}):this.reviewing?button('return','退回修改')+button('approve','复核通过',{cls:'cw-primary'}):'')+(this.record?.canPublish?button('catalog','结构化结果入库',{cls:'cw-primary'}):'')+button('export','导出 Excel',{disabled:!this.model.series.some(s=>s.points.length)});
      this.querySelector('.cw-plot-heading').innerHTML='<div class="cw-chartname"><h2>'+H(this.title||'曲线图像')+'</h2><span class="cw-status">'+H(statusName(this.record?.status))+(this.dirty?' · 有修改':'')+'</span></div><div class="cw-segment" aria-label="图像图层">'+[['original','原图'],['overlay','叠加'],['cloud','点云']].map(([v,l])=>button('layer-'+v,l,{pressed:this.layer===v})).join('')+'</div>';
    }
    tools(){this.querySelector('.cw-tools').innerHTML='<div class="cw-mode">'+modes.map(([tool,t])=>button('mode-'+tool,t,{icon:tool,title:tips[tool],pressed:this.mode===tool,disabled:!this.original||(!this.editing&&['add','roi','erase'].includes(tool))})).join('')+'</div><div class="cw-zoom">'+button('zoom-out','−',{title:'缩小'})+'<span data-zoom>'+Math.round(this.zoom*100)+'%</span>'+button('zoom-in','＋',{title:'放大'})+button('zoom-fit','',{title:'适应画布',icon:'fit'})+'</div>';
      this.querySelector('.cw-foot').innerHTML='<span>'+H(tips[this.mode])+'</span>'+(this.mode==='erase'?'<label>笔刷半径 <input type="range" min="2" max="45" value="'+this.radius+'" data-radius></label>':'')+'<span data-loc></span>';
    }
    sidebar(){
      this.querySelector('.cw-tabs').innerHTML=[['axes','校准与提取'],['series','曲线序列'],['history','快照']].map(([v,l])=>button('tab-'+v,l,{pressed:this.tab===v})).join('');
      const panel=this.querySelector('.cw-settings');const m=this.model;const locked=!this.editing;
      if(this.tab==='axes'){
        const axis=(key,title)=>{const a=m.axes[key];return '<fieldset class="cw-axis"><legend>'+title+'</legend><input data-axis="'+key+'" data-prop="label" aria-label="'+title+'名称及单位" title="轴名称与单位" value="'+H(a.label||key.toUpperCase())+'"><select data-axis="'+key+'" data-prop="scale" aria-label="'+title+'比例">'+options([['linear','线性'],['log','对数']],a.scale)+'</select><label>'+ (key==='x'?'左端':'下端')+'<input type="number" step="any" data-axis="'+key+'" data-prop="min" value="'+H(a.reverse?a.max:a.min)+'"></label><label>'+(key==='x'?'右端':'上端')+'<input type="number" step="any" data-axis="'+key+'" data-prop="max" value="'+H(a.reverse?a.min:a.max)+'"></label></fieldset>';};
        panel.innerHTML='<div class="cw-sidehead"><h3>绘图区与坐标</h3><span>'+ (m.confirmed?'已校准':'待校准')+'</span></div><fieldset class="cw-fields" '+(locked?' disabled':'')+'>'+axis('x','X 轴')+axis('y','左 Y 轴')+'<label class="cw-check"><input type="checkbox" data-dual '+(m.dual?'checked':'')+'>启用右 Y 轴</label>'+(m.dual?axis('y2','右 Y 轴'):'')+'<div class="cw-pair">'+button('read-labels','读取轴标与图例',{disabled:locked||!this.original})+'<button type="button" class="cw-btn" data-curve-model>模型辅助标定</button></div>'+button('apply-axes','应用坐标校准',{disabled:locked||!this.original})+'</fieldset><div class="cw-extract"><div><h3>自动提取</h3><span>骨架细化 · 多色分层</span></div><fieldset class="cw-clean" '+(locked?' disabled':'')+'>'+[['removeGrid','网格'],['removeBorder','边框'],['removeLegend','图例']].map(([k,l])=>'<label><input type="checkbox" data-clean="'+k+'" '+(this.clean[k]?'checked':'')+'>去'+l+'</label>').join('')+'</fieldset>'+(m.paletteTemplate?'<label class="cw-check cw-solo"><input type="checkbox" data-use-palette '+(m.usePalette?'checked':'')+'>使用模板配色</label>':'')+button('detect','自动提取',{cls:'cw-primary',disabled:locked||!this.original})+'</div>';
      }else if(this.tab==='series'){const s=this.current;
        panel.innerHTML='<div class="cw-sidehead"><h3>图例与序列</h3>'+button('new-series','新增',{disabled:locked||!this.original})+'</div><div class="cw-swatches">'+m.series.map(v=>'<button type="button" data-series="'+H(v.id)+'" aria-pressed="'+(v.id===this.active)+'"><i style="--curve:'+color(v.color)+'"></i>'+H(v.name)+'<small>'+v.points.length+'</small></button>').join('')+'</div>'+(s?'<label class="cw-check cw-solo"><input type="checkbox" data-solo '+(this.solo?'checked':'')+'>仅显示当前曲线</label><fieldset class="cw-fields" '+(locked?' disabled':'')+'><label>图例名称<input data-series-name value="'+H(s.name)+'" maxlength="80"></label><div class="cw-pair"><label>序列颜色<input type="color" data-series-color value="'+color(s.color)+'"></label><label>坐标轴<select data-series-side>'+options(m.dual?[['left','左 Y 轴'],['right','右 Y 轴']]:[['left','左 Y 轴']],s.side)+'</select></label></div><div class="cw-pair">'+button('save-series','应用属性',{disabled:locked})+button('drop-series','删除此序列',{disabled:locked})+'</div>'+(m.series.length>1?'<label>目标序列<select data-target>'+options(m.series.filter(v=>v!==s).map(v=>[v.id,v.name]))+'</select></label><div class="cw-pair">'+button('assign','分配选中点',{disabled:locked||!this.selected.size})+button('merge','合并整条曲线',{disabled:locked})+'</div>':'')+'</fieldset>':'<p class="cw-hint">自动提取或新增序列后，可编辑图例、颜色和轴归属。</p>')+'<details class="cw-process"><summary>数据排序与重采样</summary><fieldset class="cw-fields" '+(locked||!s?' disabled':'')+'><label>排序<select data-order>'+options([['path','沿曲线原始路径'],['nearest','最近邻连接'],['x-asc','X 升序'],['x-desc','X 降序'],['y-asc','Y 升序'],['y-desc','Y 降序']])+'</select></label><label>插值方式<select data-sample>'+options([['raw','仅排序'],['count','目标点数'],['step','等物理步长'],['pixel','等像素间距']])+'</select></label><label>点数或步长<input type="number" data-step value="30" step="any" min="0.000000001"></label>'+button('process','应用到当前序列',{disabled:locked||!s})+'</fieldset></details>';
      }else{const snaps=m.snapshots||[];panel.innerHTML='<div class="cw-sidehead"><h3>历史快照</h3><span>'+snaps.length+' 份</span></div><p class="cw-hint">快照记录当前坐标、图例、擦除痕迹和数据点，随草稿保存。</p><fieldset class="cw-fields" '+(locked?' disabled':'')+'><label>快照名称<input data-snap-name placeholder="如：坐标校准完成" maxlength="60"></label>'+button('snapshot','记录快照',{disabled:locked||!this.original})+'</fieldset><div class="cw-snaps">'+snaps.map((v,i)=>'<div><span>'+H(v.name)+'</span><button data-restore="'+i+'" '+(locked?'disabled':'')+'>回滚</button></div>').join('')+'</div>';}
    }
    pointValue(p,s=this.current){return CurveEngine.calibrate(p,this.model.roi,this.model.axes,s?.side||'left');}
    data(){
      const s=this.current,points=s?.points||[],size=9,max=Math.max(0,Math.ceil(points.length/size)-1);this.page=clamp(this.page,0,max);
      const a=this.model.axes;const lock=!this.editing;
      const rows=points.slice(this.page*size,(this.page+1)*size).map((p,i)=>{const val=this.pointValue(p);
        const cell=key=>'<input aria-label="第'+(this.page*size+i+1)+'点 '+key.toUpperCase()+'" data-point="'+H(p.id)+'" data-col="'+key+'" type="number" step="any" value="'+format(val[key])+'" '+(lock?'readonly':'')+'>';
        return '<tr data-row="'+H(p.id)+'" class="'+(this.selected.has(p.id)?'cw-picked':'')+'"><td><input type="checkbox" data-pick="'+H(p.id)+'" aria-label="选中第'+(this.page*size+i+1)+'点" '+(this.selected.has(p.id)?'checked':'')+'></td><td>'+String(this.page*size+i+1).padStart(2,'0')+'</td><td>'+cell('x')+'</td><td>'+cell('y')+'</td><td>'+format(p.px)+' / '+format(p.py)+'</td></tr>';
      }).join('');
      this.querySelector('.cw-data').innerHTML='<header><div><h2>结构化数据点</h2><small>'+this.model.series.length+' 条曲线 · 共 '+this.model.series.reduce((n,v)=>n+v.points.length,0)+' 点</small></div><div class="cw-actions">'+button('undo','撤销',{disabled:lock||!this.history.length})+button('redo','重做',{disabled:lock||!this.future.length})+button('copy-points','复制',{disabled:lock||!this.selected.size})+button('delete-points','删除',{disabled:lock||!this.selected.size})+'</div></header>'+(this.model.series.length?'<div class="cw-table-tabs">'+this.model.series.map(v=>'<button type="button" data-series="'+H(v.id)+'" aria-pressed="'+(v===s)+'"><i style="--curve:'+color(v.color)+'"></i>'+H(v.name)+' <small>'+v.points.length+'</small></button>').join('')+'</div>':'')+(points.length?'<div class="cw-table-wrap"><table><thead><tr><th>选取</th><th>点号</th><th>'+H(a.x.label||'X')+'</th><th>'+H((s.side==='right'?a.y2:a.y).label||'Y')+'</th><th>原图像素 X / Y</th></tr></thead><tbody>'+rows+'</tbody></table></div><footer><span>已选 '+this.selected.size+' 个点</span><div>'+button('prev','上一页',{disabled:this.page===0})+' <span>'+(this.page+1)+' / '+(max+1)+'</span> '+button('next','下一页',{disabled:this.page>=max})+'</div></footer>':'<div class="cw-empty">'+icon('chart')+'<span>提取曲线或手动补点后，可在此核对物理坐标。</span></div>');
    }
    fit(){
      const w=this.stage.clientWidth||640,h=this.stage.clientHeight||380;const m=this.model;
      const factor=m.width?Math.min((w-24)/m.width,(h-24)/m.height)*this.zoom:1;
      return {w,h,k:factor,dx:(w-m.width*factor)/2+this.offset.x,dy:(h-m.height*factor)/2+this.offset.y};
    }
    pointer(e){const r=this.plot.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
    toImage(v){const {dx,dy,k}=this.fit();return {px:(v.x-dx)/k,py:(v.y-dy)/k};}
    constrain(p){return {px:clamp(p.px,0,this.model.width-1),py:clamp(p.py,0,this.model.height-1)};}
    zoomAt(z,v){if(!this.original)return;const b=this.fit();this.zoom=clamp(z,.5,12);const t=this.fit();this.offset.x+=(v.x-b.dx)*(1-t.k/b.k)+b.dx-t.dx;this.offset.y+=(v.y-b.dy)*(1-t.k/b.k)+b.dy-t.dy;this.tools();this.paint();}
    paint(){
      if(!this.plot)return;const {w,h,dx,dy,k}=this.fit(),dpr=Math.min(window.devicePixelRatio||1,2);
      if(this.plot.width!==Math.round(w*dpr)||this.plot.height!==Math.round(h*dpr)){this.plot.width=Math.round(w*dpr);this.plot.height=Math.round(h*dpr);}
      const c=this.plot.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      if(!this.original)return;
      c.save();c.translate(dx,dy);c.scale(k,k);
      c.fillStyle='white';c.fillRect(0,0,this.model.width,this.model.height);
      if(this.layer!=='cloud'){c.imageSmoothingEnabled=true;c.drawImage(this.layer==='original'?this.original:this.cleaned,0,0);}
      if(this.layer!=='original'){
        const r=this.model.roi;if(r){c.save();c.strokeStyle='rgba(20,105,151,.63)';c.lineWidth=1/k;c.setLineDash([6/k,5/k]);c.strokeRect(r.left,r.top,r.right-r.left,r.bottom-r.top);c.restore();}
        for(const s of this.model.series){
          const active=s.id===this.active;if(this.solo&&!active)continue;c.save();c.strokeStyle=s.color;c.fillStyle=s.color;c.globalAlpha=active?.94:.35;c.lineWidth=(active?1.4:.9)/k;c.beginPath();let prior;
          s.points.forEach((p,i)=>{if(!i||p.branch!==prior)c.moveTo(p.px,p.py);else c.lineTo(p.px,p.py);prior=p.branch;});c.stroke();
          c.beginPath();const radius=(active?2.05:1.35)/k;for(const p of s.points){c.moveTo(p.px+radius,p.py);c.arc(p.px,p.py,radius,0,Math.PI*2);}c.fill();
          if(active){c.lineWidth=1.8/k;c.strokeStyle='#0b243b';c.fillStyle='#fff';for(const p of s.points)if(this.selected.has(p.id)){c.beginPath();c.arc(p.px,p.py,4.2/k,0,Math.PI*2);c.fill();c.stroke();}}c.restore();
        }
      }
      if(this.drag&&['box','roi'].includes(this.drag.kind)){const {start,end}=this.drag;c.strokeStyle='#006ba6';c.fillStyle='rgba(22,122,191,.12)';c.lineWidth=1.5/k;c.setLineDash([5/k,3/k]);c.fillRect(start.px,start.py,end.px-start.px,end.py-start.py);c.strokeRect(start.px,start.py,end.px-start.px,end.py-start.py);}
      if(this.mode==='erase'&&this.hover){c.beginPath();c.setLineDash([]);c.strokeStyle='#de6532';c.lineWidth=1.3/k;c.arc(this.hover.px,this.hover.py,this.radius,0,Math.PI*2);c.stroke();}
      c.restore();this.plot.dataset.mode=this.mode;
    }
    nearest(p){
      let best=null,limit=(8/this.fit().k)**2;
      const scan=this.current?[this.current,...this.model.series.filter(s=>s!==this.current)]:this.model.series;
      for(const s of (this.solo&&this.current?[this.current]:scan))for(const v of s.points){const d=(p.px-v.px)**2+(p.py-v.py)**2;if(d<limit){best={s,v};limit=d;}}
      return best;
    }
    selectedChanged(reveal=false){if(reveal&&this.current&&this.selected.size){const first=this.current.points.findIndex(p=>this.selected.has(p.id));if(first>=0)this.page=Math.floor(first/9);}this.data();if(this.tab==='series')this.sidebar();this.paint();}
    down(e){
      if(!this.original||this.busy)return;const pos=this.pointer(e),p=this.constrain(this.toImage(pos));this.plot.focus({preventScroll:true});
      this.plot.setPointerCapture(e.pointerId);
      if(e.button===1||this.mode==='pan'){e.preventDefault();this.drag={kind:'pan',pos,offset:{...this.offset}};return;}
      if(this.mode==='roi'||this.mode==='box'){if(this.mode==='roi'&&!this.editing)return;this.drag={kind:this.mode,start:p,end:p,append:e.shiftKey};return;}
      if(this.mode==='erase'&&this.editing){this.remember();const stroke={radius:this.radius,points:[p]};this.model.strokes.push(stroke);this.drag={kind:'erase',stroke};this.layer='overlay';this.eraseAt(p,p);return;}
      if(this.mode==='add'&&this.editing){this.remember();if(!this.current){const s=seriesNew('曲线 '+(this.model.series.length+1));this.model.series.push(s);this.active=s.id;}const v={...p,id:uid(),branch:this.current.points.at(-1)?.branch||0};this.current.points.push(v);this.selected=new Set([v.id]);this.render();this.selectedChanged(true);return;}
      const hit=this.nearest(p);if(!hit){if(!e.shiftKey){this.selected.clear();this.selectedChanged();}return;}
      if(hit.s!==this.current){this.active=hit.s.id;this.selected.clear();}
      if(e.shiftKey&&this.selected.has(hit.v.id))this.selected.delete(hit.v.id);
      else {if(!e.shiftKey&&!this.selected.has(hit.v.id))this.selected.clear();this.selected.add(hit.v.id);}
      if(this.editing&&this.selected.has(hit.v.id)){this.drag={kind:'move',start:p,base:this.current.points.filter(pt=>this.selected.has(pt.id)).map(pt=>({pt,px:pt.px,py:pt.py})),saved:false};}
      this.selectedChanged(true);
    }
    eraseAt(a,b){
      const dist=(p)=>{const x=b.px-a.px,y=b.py-a.py,len=x*x+y*y;const q=len?clamp(((p.px-a.px)*x+(p.py-a.py)*y)/len,0,1):0;return Math.hypot(p.px-a.px-q*x,p.py-a.py-q*y);};
      this.drawStroke(this.cleaned.getContext('2d'),{radius:this.radius,points:[a,b]});
      for(const s of this.model.series){
        let branch=0,prevBranch=null,throughGap=false;
        const remaining=[];for(const p of s.points){const originalBranch=p.branch;
          if(dist(p)<=this.radius){this.selected.delete(p.id);throughGap=true;continue;}
          if(remaining.length&&(throughGap||originalBranch!==prevBranch))branch++;
          prevBranch=originalBranch;p.branch=branch;throughGap=false;remaining.push(p);
        }s.points=remaining;
      }
      this.paint();
    }
    move(e){
      if(!this.original)return;const pos=this.pointer(e),p=this.constrain(this.toImage(pos));this.hover=p;const v=this.pointValue(p);const loc=this.querySelector('[data-loc]');if(loc)loc.textContent='X '+format(v.x)+' · Y '+format(v.y);
      const d=this.drag;if(!d){if(this.mode==='erase')this.paint();return;}
      if(d.kind==='pan'){this.offset={x:d.offset.x+pos.x-d.pos.x,y:d.offset.y+pos.y-d.pos.y};}
      if(['box','roi'].includes(d.kind))d.end=p;
      if(d.kind==='move'&&(p.px!==d.start.px||p.py!==d.start.py)){if(!d.saved){this.remember();d.saved=true;}for(const t of d.base)Object.assign(t.pt,this.constrain({px:t.px+p.px-d.start.px,py:t.py+p.py-d.start.py}));this.data();}
      if(d.kind==='erase'){const last=d.stroke.points.at(-1);if(Math.hypot(p.px-last.px,p.py-last.py)>=1){d.stroke.points.push(p);this.eraseAt(last,p);this.data();}}
      this.paint();
    }
    up(e,cancel=false){const d=this.drag;this.drag=null;if(!d)return;
      if(!cancel&&['roi','box'].includes(d.kind)){const a=d.start,b=d.end;const r={left:Math.min(a.px,b.px),right:Math.max(a.px,b.px),top:Math.min(a.py,b.py),bottom:Math.max(a.py,b.py)};
        if(d.kind==='roi'){if(r.right-r.left>3&&r.bottom-r.top>3){this.remember();this.model.roi=r;this.model.manualRoi=true;this.pixelAxes();this.mode='point';this.msg('已更新绘图区，坐标与表格已同步。');}}
        else{if(!d.append)this.selected.clear();for(const p of this.current?.points||[])if(p.px>=r.left&&p.px<=r.right&&p.py>=r.top&&p.py<=r.bottom)this.selected.add(p.id);}
      }
      this.render();if(d.kind==='box')this.selectedChanged(true);
    }
    keys(e){if(this.modal.open||!this.original||['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName))return;if(e.target!==this.plot)return;
      const k=e.key.toLowerCase();if(!this.editing)return;const mod=e.metaKey||e.ctrlKey;
      if(mod&&k==='z'){e.preventDefault();this.command(e.shiftKey?'redo':'undo');return;}
      if((mod&&k==='c')||k==='delete'||k==='backspace'){e.preventDefault();this.command(mod?'copy-points':'delete-points');return;}
      const delta={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1]}[k];if(delta&&this.selected.size){e.preventDefault();this.remember();for(const p of this.current.points)if(this.selected.has(p.id))Object.assign(p,this.constrain({px:p.px+delta[0]*(e.shiftKey?5:1),py:p.py+delta[1]*(e.shiftKey?5:1)}));this.render();}
    }
    show(title,body){
      this.modal.firstElementChild.innerHTML='<header><h2>'+H(title)+'</h2>'+button('close','关闭')+'</header><div class="cw-dialog-body">'+body+'</div>';
      if(!this.modal.open)this.modal.showModal();
    }
    async chooseSource(){
      const rows=await api('/api/resources');const versions=rows.flatMap(r=>(r.versions||[]).filter(v=>/\.(png|jpeg|jpg|webp)$/i.test(v.filename)).map(v=>[r.id+'|'+v.id,r.title+' · V'+v.number+' · '+v.filename]));
      this.show('图像来源','<div class="cw-origin"><h3>材料科研示例</h3>'+examples.map(([id,t])=>button('example-'+id,t)).join('')+'<h3>资源目录</h3>'+(versions.length?'<select data-resource>'+options(versions)+'</select>'+button('load-resource','使用选定版本'):'<p>资料库中尚无可使用的图片版本。</p>')+'<h3>本地图片</h3><label class="cw-upload">选择 PNG、JPEG 或 WebP 图片<input type="file" data-upload accept="image/png,image/jpeg,image/webp"></label><h3>多张曲线图</h3><button type="button" class="cw-btn" data-curve-batch>批量识别与评估</button></div>');
    }
    async chooseRecord(){await this.refreshList();this.show('曲线标注记录',this.records.length?'<div class="cw-records">'+this.records.map(r=>'<button data-record="'+H(r.id)+'"><strong>'+H(r.title)+'</strong><span>'+H(statusName(r.status))+' · '+H(r.owner||'')+'</span></button>').join('')+'</div>':'<p>暂无标注记录。保存当前图像和数据点后，可在此重新打开。</p>');}
    change(e){const t=e.target;
      if(t.matches('[data-upload]')){const f=t.files[0];if(f)this.action(async()=>{if(!await this.allowLeave())return;const input={filename:f.name,contentBase64:await readBlob(f)};await this.loadImage(input,input,f.name);this.modal.close();});}
      if(t.matches('[data-use-palette]')&&this.editing){this.remember();this.model.usePalette=t.checked;this.header();}
      if(t.matches('[data-solo]')){this.solo=t.checked;this.paint();}
      if(t.matches('[data-clean]'))this.clean[t.dataset.clean]=t.checked;
      if(t.matches('[data-dual]')&&this.editing){if(!t.checked&&this.model.series.some(s=>s.side==='right')){t.checked=true;this.msg('请先将右轴序列改到左轴，再关闭右轴。',true);return;}const axes=this.preflightAxes();this.remember();this.model.axes=axes;this.model.dual=t.checked;this.sidebar();this.header();}
      if(t.matches('[data-pick]')){if(t.checked)this.selected.add(t.dataset.pick);else this.selected.delete(t.dataset.pick);this.selectedChanged();}
      if(t.matches('[data-point]')&&this.editing){const pt=this.current?.points.find(p=>p.id===t.dataset.point);if(!pt)return;const value=this.pointValue(pt);value[t.dataset.col]=t.valueAsNumber;
        const projected=CurveEngine.project(value,this.model.roi,this.model.axes,this.current.side);if(!Number.isFinite(projected.px)||!Number.isFinite(projected.py)||projected.px<0||projected.py<0||projected.px>this.model.width-1||projected.py>this.model.height-1){this.msg('数值超出可映射的图像，请检查坐标范围与对数值。',true);this.data();return;}this.remember();pt.px=projected.px;pt.py=projected.py;this.selected=new Set([pt.id]);this.selectedChanged();this.header();}
      if(t.matches('[data-radius]'))this.radius=Number(t.value);
    }
    click(e){const b=e.target.closest('button');if(b&&this.contains(b)&&!b.disabled){this.action(async()=>{
      if(b.dataset.series){this.active=b.dataset.series;this.selected.clear();this.page=0;this.layer='overlay';this.render();return;}
      if(b.dataset.record){if(!await this.allowLeave())return;await this.openRecord(b.dataset.record);this.modal.close();return;}
      if(b.dataset.restore!==undefined&&this.editing){const v=this.model.snapshots[Number(b.dataset.restore)];if(v){this.remember();this.restore(v.state);this.msg('已回滚至“'+v.name+'”。');}return;}
      if(b.dataset.cw)await this.command(b.dataset.cw);
    });return;}
      const row=e.target.closest('[data-row]');if(row&&!e.target.matches('input')){this.selected=new Set([row.dataset.row]);this.selectedChanged();}
    }
    async allowLeave(){return !this.dirty||window.confirm('当前修改尚未保存，是否切换图像？');}
    preflightAxes(){
      const rows=copy(this.model.axes);for(const key of ['x','y',...(this.model.dual?['y2']:[])]){
        const input=k=>this.querySelector('[data-axis="'+key+'"][data-prop="'+k+'"]');const left=input('min').valueAsNumber,right=input('max').valueAsNumber,scale=input('scale').value;
        if(!Number.isFinite(left)||!Number.isFinite(right)||left===right||scale==='log'&&Math.min(left,right)<=0)throw new Error('坐标两端须为不同数值，对数轴的两端须大于零。');
        rows[key]={min:Math.min(left,right),max:Math.max(left,right),reverse:left>right,scale,label:input('label').value.trim()||key.toUpperCase()};
      }return rows;
    }
    grabCanvas(){return this.original||null;}
    applyPaletteTemplate(template){
      if(!this.editing||!this.original)throw new Error('请在可编辑的图像草稿中应用模板。');
      if(!Array.isArray(template?.series)||!template.series.length||template.series.some(v=>!v.name||!/^#[a-f0-9]{6}$/i.test(v.color)))throw new Error('模板缺少有效的图例或颜色。');
      this.remember();this.model.paletteTemplate=copy(template);this.model.usePalette=true;this.tab='axes';this.render();this.msg('模板配色已应用，下次自动提取将按模板识别并命名曲线。');return true;
    }
    applyCalibration({axes,roi,legend}={}){
      if(!this.editing)throw new Error('当前角色或记录状态不允许修改。');
      if(!this.original)throw new Error('请先载入图像。');
      const proposals={};
      for(const key of ['x','y','y2']){
        const a=axes?.[key];if(!a)continue;
        const left=Number(a.min),right=Number(a.max),scale=a.scale==='log'?'log':'linear';
        if(!Number.isFinite(left)||!Number.isFinite(right)||left===right||scale==='log'&&Math.min(left,right)<=0)throw new Error('模型返回的坐标范围无效，请人工核对。');
        proposals[key]={label:String(a.label||key),min:Math.min(left,right),max:Math.max(left,right),scale,reverse:a.reverse??left>right};
      }
      if(roi&&(![roi.left,roi.top,roi.right,roi.bottom].every(Number.isFinite)||roi.left<0||roi.top<0||roi.right>this.model.width||roi.bottom>this.model.height||roi.right<=roi.left||roi.bottom<=roi.top))throw new Error('模型返回的绘图区无效。');
      this.remember();Object.assign(this.model.axes,proposals);if(proposals.y2)this.model.dual=true;
      if(roi){this.model.roi=copy(roi);this.model.manualRoi=true;}
      if(Array.isArray(legend)){this.model.ocrLegends=copy(legend);for(const v of legend){const s=this.model.series.find(x=>x.id===v.seriesId||color(x.color)===color(v.color));if(s&&v.name)s.name=v.name;}}
      this.model.confirmed=false;this.tab='axes';this.render();this.msg('模型候选已填入，请对照原图核验并应用坐标校准。');return true;
    }
    async imageLabels(){
      if(!this.original||!window.CurveLabels)throw new Error('坐标识别工具尚未就绪。');
      this.msg('正在定位图框并读取轴标与图例…');
      const image=this.original.getContext('2d').getImageData(0,0,this.original.width,this.original.height);
      const panels=CurveLabels.detectPanels(image);
      if(!this.model.manualRoi&&panels.length>1){this.panels=panels;this.show('选择要标注的子图','<p>识别到多个图框，请选择本次提取的区域。</p>'+panels.map((p,i)=>button('panel-'+i,'子图 '+(i+1)+' · '+Math.round(p.width)+'×'+Math.round(p.height)+' 像素')).join(''));return;}
      const r=this.model.roi;const rect=this.model.manualRoi||this.model.hints?{x:r.left,y:r.top,width:r.right-r.left,height:r.bottom-r.top}:CurveLabels.detectPlot?.(image)||panels[0]||{x:0,y:0,width:image.width,height:image.height};
      const text=await CurveLabels.readText(this.original,rect);
      if(!this.isConnected)return;const found=CurveLabels.analyze(image,{roi:rect,lines:text.lines||[],series:this.model.series.map(s=>({id:s.id,color:s.color,style:s.style||'solid'}))});
      this.remember();const m=this.model;m.roi={left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height};m.manualRoi=true;
      const foundAxes=[];for(const key of ['x','y','y2']){const a=found.axes?.[key];if(a?.status==='candidate'&&Number.isFinite(a.start)&&Number.isFinite(a.end)&&a.start!==a.end){m.axes[key]={min:Math.min(a.start,a.end),max:Math.max(a.start,a.end),reverse:a.start>a.end,scale:a.scale||'linear',label:a.label||m.axes[key].label};if(key==='y2')m.dual=true;foundAxes.push(key==='y2'?'右 Y':key.toUpperCase());}}
      m.ocrLegends=found.legends||[];m.legendRects=(found.legendBoxes||[]).map(v=>({left:v.x,top:v.y,right:v.x+v.width,bottom:v.y+v.height}));
      for(const s of m.series){const l=m.ocrLegends.find(v=>v.seriesId===s.id);if(l)s.name=l.name;}
      m.confirmed=false;this.render();this.msg((foundAxes.length?'已读取 '+foundAxes.join('、')+' 轴候选刻度。':'未可靠读出轴刻度。')+'请与原图核对后应用校准。'+[text.warning,...(found.warnings||[])].filter(Boolean).map(v=>' '+v).join(''));
    }
    async detect(){if(!window.CurveEngine)throw new Error('曲线提取工具尚未加载。');
      if(this.model.series.some(s=>s.points.length)&&!window.confirm('重新提取会替换当前曲线点。可通过撤销恢复，是否继续？'))return;
      await this.block(async()=>{this.msg('正在提取像素轨迹并分离曲线…');await new Promise(requestAnimationFrame);
        const m=this.model,im=this.cleaned.getContext('2d').getImageData(0,0,m.width,m.height);
        const templ=m.usePalette?m.paletteTemplate?.series||[]:[];const arg={...this.clean};if(templ.length)arg.palette=templ.map(x=>x.color);
        if(m.hints||m.manualRoi)arg.roi=m.roi;
        if(this.clean.removeLegend&&m.legendRects?.length)arg.excludeRects=m.legendRects;
        const res=await CurveEngine.extract(im,arg);
        if(!res.series?.length)throw new Error('当前绘图区未提取到曲线。可重新框定图区、关闭去噪选项，或新增序列后手动补点。');
        this.remember();m.roi=res.roi||m.roi;this.pixelAxes();m.background=res.background||'#ffffff';
        const known=[...templ,...(m.ocrLegends||[]),...(m.hints?.legend||[])];const unused=new Set(known);
        const dist=(x,y)=>{const rgb=v=>[1,3,5].map(k=>parseInt(color(v).slice(k,k+2),16));const q=rgb(x),w=rgb(y);return q.reduce((n,v,i)=>n+(v-w[i])**2,0);};
        m.series=res.series.map((x,i)=>{let l=null,best=10000;for(const c of unused){const d=dist(x.color,c.color);if(d<best){l=c;best=d;}}if(l)unused.delete(l);const s=seriesNew(l?.name||x.name||'曲线 '+(i+1),x.color,l?.side||'left');s.style=x.style||'solid';
          const paths=x.paths?.length?x.paths:[x.points||[]];s.points=normalizePts(paths.flatMap((path,branch)=>path.map(p=>({...p,branch}))));return s;}).filter(s=>s.points.length);
        if(known.length){const rank=v=>{const i=known.findIndex(l=>l.name===v.name);return i<0?known.length:i;};m.series.sort((a,b)=>rank(a)-rank(b));}this.active=m.series[0]?.id||'';this.selected.clear();this.page=0;this.layer='overlay';this.mode='point';this.tab='series';this.msg('已识别 '+m.series.length+' 条曲线，共 '+m.series.reduce((n,s)=>n+s.points.length,0)+' 个点。选择颜色标签可单独核对。');
      });}
    payload(){
      const state=copy(this.model);state.series.forEach(s=>{s.points=s.points.map(p=>({...p,...this.pointValue(p,s)}));});
      return {title:this.title,source:this.source,state,...(this.record?{id:this.record.id,revision:this.record.revision}:{})};
    }
    async persist(announce=true){
      const result=await api(base,'POST',this.payload());this.record=result;this.dirty=false;await this.refreshList();if(announce)this.msg('草稿已保存，可从“标注记录”继续办理。');return result;
    }
    async command(a){
      const m=this.model,s=this.current,get=q=>this.querySelector(q);
      if(a==='close'){this.modal.close();return;}
      if(a==='sources'){await this.chooseSource();return;}
      if(a==='records'){await this.chooseRecord();return;}
      if(a.startsWith('example-')){if(!await this.allowLeave())return;await this.example(a.slice(8));this.modal.close();return;}
      if(a==='load-resource'){if(!await this.allowLeave())return;const [rid,vid]=get('[data-resource]').value.split('|');await this.resource(rid,vid);this.modal.close();return;}
      if(a.startsWith('layer-')){this.layer=a.slice(6);this.header();this.paint();return;}
      if(a.startsWith('tab-')){this.tab=a.slice(4);this.sidebar();return;}
      if(a.startsWith('mode-')){this.mode=a.slice(5);if(this.mode==='erase')this.layer='overlay';this.tools();this.header();this.paint();return;}
      if(a.startsWith('zoom-')){if(a==='zoom-fit'){this.zoom=1;this.offset={x:0,y:0};this.tools();this.paint();}else this.zoomAt(a==='zoom-in'?this.zoom*1.3:this.zoom/1.3,{x:this.stage.clientWidth/2,y:this.stage.clientHeight/2});return;}
      if(a==='prev'||a==='next'){this.page+=a==='next'?1:-1;this.data();return;}
      if(a==='export'){const result=await api('/api/curve-export','POST',this.payload());const b=Uint8Array.from(atob(result.contentBase64),ch=>ch.charCodeAt(0));workDownload(result.filename,new Blob([b],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));this.msg('Excel 文件已导出。');return;}
      if(a==='approve'||a==='return'){if(!this.reviewing)return;this.show(a==='approve'?'复核通过':'退回修改','<label>复核意见<textarea data-opinion rows="3" maxlength="500" placeholder="'+(a==='return'?'请写明需要修改的内容':'可补充核验结果')+'"></textarea></label><footer>'+button('finish-'+a,'确认'+(a==='approve'?'通过':'退回'),{cls:'cw-primary'})+'</footer>');return;}
      if(a.startsWith('finish-')){if(!this.reviewing)return;const approve=a==='finish-approve',note=get('[data-opinion]').value.trim();if(!approve&&!note)throw new Error('请填写退回理由。');const r=await api(base+'/'+encodeURIComponent(this.record.id)+'/review','POST',{revision:this.record.revision,decision:approve?'approve':'return',note});this.record=r;this.modal.close();await this.refreshList();this.render();this.msg(approve?'标注记录已通过复核。':'标注记录已退回修改。');return;}
      if(a==='catalog'){if(!this.record?.canPublish)return;const x=await api(base+'/'+encodeURIComponent(this.record.id)+'/catalog','POST',{});this.msg('结构化结果已写入资源目录。');if(typeof resourceOpen==='function'){await navigate('resources');await resourceOpen(x.resourceId,x.versionId);}return;}
      if(!this.editing)return;
      if(a==='detect'){await this.detect();return;}
      if(a==='read-labels'){await this.imageLabels();return;}
      if(a.startsWith('panel-')){const panel=this.panels?.[Number(a.slice(6))];if(panel){const img=this.original.getContext('2d').getImageData(0,0,m.width,m.height);const r=CurveLabels.detectPlot?.(img,panel)||panel;this.remember();m.roi={left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height};m.manualRoi=true;this.modal.close();await this.imageLabels();}return;}
      if(a==='save'){await this.block(()=>this.persist());return;}
      if(a==='submit'){if(!m.confirmed)throw new Error('提交前，请在“校准与提取”中核对数值并应用坐标校准。');if(!m.series.some(v=>v.points.length))throw new Error('请添加或提取数据点后再提交。');await this.block(async()=>{const current=!this.record||this.dirty?await this.persist(false):this.record;this.record=await api(base+'/'+encodeURIComponent(current.id)+'/submit','POST',{revision:current.revision});await this.refreshList();this.msg('已提交评审专家复核。');});return;}
      if(a==='apply-axes'){const axes=this.preflightAxes();this.remember();m.axes=axes;m.confirmed=true;this.msg('坐标已校准，所有物理坐标值已重新计算。');}
      else if(a==='new-series'){this.remember();const palette=['#066aa7','#d56b38','#6b5fb6','#166c68','#9b4491'];const v=seriesNew('曲线 '+(m.series.length+1),palette[m.series.length%palette.length]);m.series.push(v);this.active=v.id;this.selected.clear();this.mode='add';this.layer='overlay';this.msg('已新增序列。点击曲线补点，或在右侧修改图例名称。');}
      else if(a==='save-series'&&s){const name=get('[data-series-name]').value.trim();if(!name)throw new Error('请填写图例名称。');this.remember();s.name=name;s.color=color(get('[data-series-color]').value);s.side=get('[data-series-side]').value;this.msg('图例、颜色和轴归属已更新。');}
      else if(a==='drop-series'&&s){if(!window.confirm('删除“'+s.name+'”及其数据点？'))return;this.remember();m.series=m.series.filter(v=>v!==s);this.active=m.series[0]?.id||'';this.selected.clear();this.page=0;}
      else if((a==='assign'||a==='merge')&&s){const dest=m.series.find(v=>v.id===get('[data-target]')?.value);if(!dest)return;this.remember();const transferred=a==='merge'?s.points:s.points.filter(p=>this.selected.has(p.id));const baseBranch=dest.points.reduce((n,p)=>Math.max(n,p.branch),-1)+1;for(const p of transferred)dest.points.push({...p,branch:baseBranch+p.branch});if(a==='merge')m.series=m.series.filter(v=>v!==s);else s.points=s.points.filter(v=>!this.selected.has(v.id));this.selected=new Set(transferred.map(p=>p.id));this.active=dest.id;this.msg('已将 '+transferred.length+' 个点分配至“'+dest.name+'”。');}
      else if(a==='process'&&s){const order=get('[data-order]').value,mode=get('[data-sample]').value,value=get('[data-step]').valueAsNumber;if(mode!=='raw'&&(!Number.isFinite(value)||value<=0||mode==='count'&&(!Number.isInteger(value)||value<2)))throw new Error('目标点数须为不小于 2 的整数，步长必须为正数。');
        const groups=order==='path'?[...new Set(s.points.map(p=>p.branch))].map(b=>s.points.filter(p=>p.branch===b)):[s.points];
        const result=groups.flatMap((pts,branch)=>CurveEngine.process(pts,m.roi,m.axes,{side:s.side,order,mode,value}).map(p=>({...p,branch})));if(!result.length)throw new Error('当前序列没有可处理的数据点。');
        this.remember();s.points=normalizePts(result);this.selected.clear();this.page=0;this.msg('序列处理完成，现有 '+s.points.length+' 个数据点。');}
      else if((a==='copy-points'||a==='delete-points')&&s&&this.selected.size){this.remember();const chosen=s.points.filter(p=>this.selected.has(p.id));if(a==='copy-points'){const dup=chosen.map(p=>({...p,id:uid()}));s.points.push(...dup);this.selected=new Set(dup.map(p=>p.id));this.msg('已复制到相同像素位置。可用方向键移动，或在“曲线序列”中分配至另一序列。');}else{s.points=s.points.filter(p=>!this.selected.has(p.id));this.selected.clear();this.msg('已删除 '+chosen.length+' 个选中点。');}}
      else if(a==='undo'&&this.history.length){this.future.push(this.snapshotState());this.restore(this.history.pop());return;}
      else if(a==='redo'&&this.future.length){this.history.push(this.snapshotState());this.restore(this.future.pop());return;}
      else if(a==='snapshot'){const name=get('[data-snap-name]').value.trim()||'快照 '+(m.snapshots.length+1);m.snapshots.push({name,state:this.snapshotState()});this.dirty=true;this.msg('已记录“'+name+'”。保存草稿后可再次打开。');}
      this.render();
    }
  }
  if(!customElements.get('ustb-curve-editor'))customElements.define('ustb-curve-editor',CurveEditor);
  function render(){return '<ustb-curve-editor class="cw"></ustb-curve-editor>';}
  function mount(host){if(host&&!host.matches?.('ustb-curve-editor')&&!host.querySelector('ustb-curve-editor'))host.innerHTML=render();}
  window.curveWorkbench={render,mount,open({host,resourceId,versionId}={}){if(resourceId)window.curveOpenSource={resourceId,versionId};if(host){host.innerHTML=render();return;}return navigate('curve-work');}};
})();
