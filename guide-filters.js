'use strict';

const sourceQueueFilters = {
  generation: {family:'', topic:'', selected:''},
  annotations: {family:'', topic:'', selected:''}
};
const queueAnnotationDrafts = new Map();

function sourceQueueView(page, resources, requested) {
  const state = sourceQueueFilters[page];
  const byId = new Map(resources.map(resource=>[resource.id,resource]));
  function classification(id) {
    const resource = byId.get(id) || {};
    const family = guideFamily(resource);
    return {family:guideFamilies.includes(family) ? family : '待归类', topic:guideResourceTopic(resource)};
  }
  // An explicit link or a newly created record takes priority over a previous queue filter.
  if (requested && requested.id!==state.selected) {
    const fields=classification(requested.resourceId);
    for (const key of ['family','topic']) {
      if (state[key] && state[key]!==fields[key]) state[key]='';
    }
  }
  return {
    matches(id) {
      const fields=classification(id);
      return (!state.family || state.family===fields.family) && (!state.topic || state.topic===fields.topic);
    },
    select(record) { state.selected=record?.id || ''; },
    controls(count,total,unit) {
      const select=(label,key,items)=>`<label class="field">${label}<select data-queue-filter="${key}" data-queue-page="${page}">${workSelect([['','全部'],...guideOptions([...items,'待归类'])],state[key])}</select></label>`;
      const active=state.family || state.topic;
      if (page==='annotations') return `<div class="cot-classify" data-source-queue="annotations">${select('材料门类','family',guideFamilies)}${select('语料专题','topic',guideTopics)}</div>`;
      return `<div class="stack" data-source-queue="${page}"><div class="grid-2">${select('材料门类','family',guideFamilies)}${select('语料专题','topic',guideTopics)}</div>
        <div class="split"><span class="muted" role="status">匹配 ${count} / ${total} ${unit}</span>${active?`<button class="btn small link" type="button" data-queue-clear="${page}">清除分类筛选</button>`:''}</div></div>`;
    }
  };
}

function queuedAnnotationBody(detail,sample) {
  const cache=queueAnnotationDrafts.get(detail.id);
  const revision=detail.history?.length || 0;
  sourceQueueFilters.annotations.detailRevision=revision;
  if (!cache) return exAnnotationDetail(detail,sample);
  if (!detail.canEdit || cache.username!==window.workspaceUser?.username) return exAnnotationDetail(detail,sample);
  if (!['draft','returned'].includes(detail.status) || cache.revision!==revision) {
    queueAnnotationDrafts.delete(detail.id);
    return exAnnotationDetail(detail,sample);
  }
  const tpl=document.createElement('template');
  tpl.innerHTML=exAnnotationDetail({...detail,steps:cache.steps,materialCriteria:cache.materialCriteria ?? detail.materialCriteria},sample);
  const status=tpl.content.querySelector('[data-ex-save-state]');
  if(status) status.textContent='有未保存修改';
  return tpl.innerHTML;
}

function keepAnnotationDraft() {
    const editor=wb('form[data-form="ex-annotation-edit"]');
    if (editor?.querySelector('[data-ex-save-state]')?.textContent==='有未保存修改') {
      queueAnnotationDrafts.set(editor.dataset.id,{
        username:window.workspaceUser?.username,revision:sourceQueueFilters.annotations.detailRevision,steps:exStepValues(editor),
        materialCriteria:exCriteriaValues(editor)
      });
    }
}

async function applySourceQueueFilters(el,page,key) {
  const state=sourceQueueFilters[page];
  if (!state) return;
  if (page==='annotations') keepAnnotationDraft();
  if (key) state[key]=el.value;
  else {state.family='';state.topic='';}
  await refresh();
  if (window.workspacePage===page && !wb('#workspace-dialog')?.open) {
    wb(`[data-queue-page="${page}"][data-queue-filter="${key || 'family'}"]`)?.focus({preventScroll:true});
  }
}
document.addEventListener('change',e=>{
  const el=e.target.closest('[data-queue-filter]');
  if (el) void applySourceQueueFilters(el,el.dataset.queuePage,el.dataset.queueFilter);
});
document.addEventListener('click',e=>{
  const el=e.target.closest('button[data-queue-clear]');
  if (el) void applySourceQueueFilters(el,el.dataset.queueClear);
});
