'use strict';

const tplPath = '/api/luoshu/configs';
const tplCanWrite = () => workCan('operator');
function tplFieldRow(value='',enabled=true) {
  return `<div class="tpl-field-row"><input aria-label="字段名称" name="field" value="${escapeHtml(value)}" maxlength="60" required>
    <label><input type="checkbox" aria-label="启用字段" ${enabled?'checked':''}> 启用</label>
    ${workBtn('移除','tpl-remove','','small quiet')}</div>`;
}
async function templateList() {
  const [custom,builtins] = await Promise.all([api(tplPath),api('/api/luoshu/templates')]);
  const rows = [...custom,...builtins.filter(t=>t.fields.length)].map(t=>{
    const system = !t.revision;
    return [`<strong>${escapeHtml(t.name)}</strong>`, system?'系统模板':'自建模板',
      escapeHtml(t.fields.join('、')),system?'—':`v${t.revision}`,
      workBtn(system || !tplCanWrite()?'查看':'编辑','tpl-open',t.id,'small')];
  });
  openModal('抽取模板',`<div class="stack">${tplCanWrite()?`<div class="actions">${workBtn('导入 YAML','tpl-import')}${workBtn('新建模板','tpl-new','','primary','plus')}</div>`:''}
    ${workTable(['模板名称','类型','启用字段','版本','操作'],rows)}</div>`);
}
function tplEditor(record={},create=false) {
  const editing=tplCanWrite() && (create || !!record.revision);
  if (!editing) {
    openModal('模板详情',`<div class="stack"><h3>${escapeHtml(record.name)}</h3><div class="tag-list">${record.fields.map(f=>`<span class="chip">${escapeHtml(f)}</span>`).join('')}</div>
    <div class="actions">${workBtn('返回列表','ls-config')}${workBtn('导出 YAML','tpl-export',record.id)}${tplCanWrite()?workBtn('复制为新模板','tpl-copy',record.id,'primary'):''}</div></div>`);
    return;
  }
  openModal(create?'新建抽取模板':'编辑抽取模板',`<form data-form="tpl-save" class="stack" data-id="${create?'':escapeHtml(record.id)}" data-rev="${create?0:record.revision}">
    ${workField('模板名称','name',{value:record.name??'',max:80})}
    <label class="field">标签<input name="tags" value="${escapeHtml((record.tags||[]).join('，'))}" placeholder="多个标签用逗号分隔"></label>
    <label class="field">模板说明<textarea name="description" maxlength="500" rows="2">${escapeHtml(record.description||'')}</textarea></label>
    <fieldset class="tpl-fieldset"><legend>抽取字段</legend><div id="tpl-fields">
    ${(record.fields?.length?record.fields:['']).map(f=>tplFieldRow(f)).join('')}${(record.disabledFields||[]).map(f=>tplFieldRow(f,false)).join('')}</div>
    ${workBtn('添加字段','tpl-add','','small','plus')}</fieldset><div class="actions">${workBtn('返回列表','ls-config')}
    ${create?'':workBtn('导出已存版本','tpl-export',record.id)}<button class="btn primary" type="submit">保存模板</button></div></form>`);
}
async function tplGet(id) {
  if (/^TPL-/.test(id)) return api(tplPath+'/'+encodeURIComponent(id));
  const system=(await api('/api/luoshu/templates')).find(t=>t.id===id);
  if (!system) throw Error('找不到该模板。');
  return system;
}
function templateYaml(record) {
  const yamlScalar=v=>JSON.stringify(String(v));
  const out=['name: '+yamlScalar(record.name),'description: '+yamlScalar(record.description||'')];
  for (const key of ['tags','fields','disabledFields']) {
    const values=record[key]||[];
    out.push(values.length?key+':':key+': []',...values.map(v=>'  - '+yamlScalar(v)));
  }
  return out.join('\n')+'\n';
}
async function templateAction(action,el) {
  const id=el.dataset.id;
  if(action==='ls-config') return templateList();
  if(action==='tpl-new') return tplEditor({},true);
  if(action==='tpl-open') return tplEditor(await tplGet(id));
  if(action==='tpl-copy') {const t=await tplGet(id);return tplEditor({...t,name:t.name+' 副本'},true);}
  if(action==='tpl-add') {if(wb('#tpl-fields').children.length>=32) throw Error('最多 32 个字段。'); wb('#tpl-fields').insertAdjacentHTML('beforeend',tplFieldRow());return wb('#tpl-fields').lastElementChild.querySelector('input').focus();}
  if(action==='tpl-remove') {el.closest('.tpl-field-row').remove();return;}
  if(action==='tpl-import') return openModal('导入模板',workModalForm('tpl-import','<label class="field">YAML 文件<input type="file" name="file" accept=".yaml,.yml" required><small>最大 64 KiB</small></label>','读取字段'));
  if(action==='tpl-export') {const t=await tplGet(id);return workDownload(t.name+'.yaml',new Blob([templateYaml(t)],{type:'application/yaml;charset=utf-8'}));}
}
async function templateSubmit(form) {
  const values=new FormData(form);
  if(form.dataset.form==='tpl-import') {
    const file=values.get('file');
    if(!file || !file.size || file.size>65536) throw Error('请选择 64 KiB 以内的模板文件。');
    const result=await api(tplPath+'/import-preview','POST',{yaml:await file.text()});
    return tplEditor(result,true);
  }
  const fields=[], disabledFields=[];
  for(const row of form.querySelectorAll('.tpl-field-row')) {
    (row.querySelector('[type=checkbox]').checked?fields:disabledFields).push(row.querySelector('[name=field]').value.trim());
  }
  const id=form.dataset.id;
  const record=await api(id?tplPath+'/'+encodeURIComponent(id):tplPath,'POST',{name:values.get('name'),description:values.get('description'),
    tags:values.get('tags').split(/[,，、]/).map(x=>x.trim()).filter(Boolean),fields,disabledFields,revision:Number(form.dataset.rev)});
  await templateList();notify('模板已保存 · '+record.name);
}
async function showDrawing(source) {
  const [id,version,blockId]=source.split('|');
  const doc=await api('/api/luoshu/preview/'+encodeURIComponent(id)+'/'+encodeURIComponent(version));
  const overlay=(doc.blocks||[]).filter(b=>b.bbox).map(b=>{
    const box=b.bbox;
    const pos=['x','y','width','height'].map(k=>Math.min(100,Math.max(0, Number(box[k])*100||0)));
    return `<button type="button" class="drawing-box" style="left:${pos[0]}%;top:${pos[1]}%;width:${pos[2]}%;height:${pos[3]}%" data-action="drawing-line" data-id="${escapeHtml(b.id)}" aria-label="${escapeHtml(b.location)}"></button>`;
  }).join('');
  openModal('图纸原文',`<div class="stack"><strong>${escapeHtml(doc.filename)}</strong><div class="drawing-board"><div class="drawing-sheet"><img alt="图纸原件" src="data:${escapeHtml(doc.mime)};base64,${doc.contentBase64}">${overlay}</div></div>
   <div class="drawing-lines" id="drawing-lines">${doc.blocks.map(b=>`<div data-block="${escapeHtml(b.id)}"><strong>${escapeHtml(b.location)}</strong> ${escapeHtml(b.text)}</div>`).join('')}</div>
   <div class="actions">${workBtn('查看资源版本','resource-open',id+'|'+version)}</div></div>`);
  if (blockId) showDrawingLine(blockId,false);
}
function showDrawingLine(id,scroll=true) {
  const row=Array.from(wb('#drawing-lines').children).find(el=>el.dataset.block===id);
  if (!row) return;
  for(const el of row.parentElement.children) el.classList.toggle('selected',el===row);
  for(const box of wb('.drawing-sheet').querySelectorAll('button')) box.classList.toggle('selected',box.dataset.id===id);
  if (scroll) row.scrollIntoView({block:'nearest'});
}
