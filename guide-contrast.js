'use strict';

async function guideContrastOpen(initialIds = []) {
  const [allPairs,runs] = await Promise.all([api('/api/multimodal-pairs'),api('/api/contrast-experiments')]);
  const selected = new Set(initialIds);
  const visible=workScopeRows(allPairs,'catalog');
  const pairs=allPairs.filter(p=>visible.includes(p) || selected.has(p.id));
  if (!selected.size) {
    const seenImages = new Set(), seenBlocks = new Set();
    for (const pair of pairs) {
      if (selected.size >= 8) break;
      if (seenImages.has(pair.image.sha256) || seenBlocks.has(pair.evidence.text)) continue;
      selected.add(pair.id);
      seenImages.add(pair.image.sha256);
      seenBlocks.add(pair.evidence.text);
    }
  }
  const canTrain = workCan('operator');
  const choices = pairs.map(pair=>`<label class="cx-pair"><input type="checkbox" name="pair" value="${exText(pair.id)}"${selected.has(pair.id) ? ' checked' : ''}>
    <span><strong>${exText(pair.image.title)}</strong><small>${exText(pair.text.title)} · ${exText(pair.evidence.location)}</small></span><em>${exText(pair.materialFamily)}</em></label>`).join('');
  const history = runs.map(run=>`<div class="ge-history"><div><strong>${exText(run.id)}</strong><small>${exText(exDate(run.createdAt))} · ${run.pairCount} 组 · ${run.epochs} 轮</small></div>
    <button type="button" class="btn" data-contrast="history" data-id="${exText(run.id)}">查看结果</button></div>`).join('');
  openModal('图文对比预训练',`<div class="cx-desk stack"><div class="ge-heading"><h3>图像与文本配对训练</h3><span>本机 CPU · 双向对比损失</span></div>
    ${canTrain ? `<form class="stack" data-contrast-form>
      <fieldset class="cx-choices"><legend>训练配对 · 选择 2–8 组不同图像和文本证据</legend>${choices || '<p>配对库暂无训练数据</p>'}</fieldset>
      <div class="ge-values"><label class="field">训练轮数<input type="number" name="epochs" min="1" max="80" step="1" value="30" required></label><label class="field">学习率<input type="number" name="rate" min="0.001" max="0.3" step="any" value="0.1" required></label><label class="field">随机种子<input type="number" name="seed" min="0" max="65535" step="1" value="17" required></label></div>
      <div class="ge-footer"><span>8 × 8 RGB 像素 · 字与双字特征 · 线性投影</span><button type="submit" class="btn primary"${pairs.length < 2 ? ' disabled' : ''}>开始训练</button></div>
    </form>` : ''}
    <section class="ge-runs"><h3>实验记录 <span>${runs.length}</span></h3>${history || '<p class="ge-hint">暂无训练记录</p>'}</section>
    <div><button class="btn" type="button" data-contrast="pairs">返回配对库</button></div></div>`);
}

function contrastReport(run) {
  const before = run.curve[0], after = run.curve[run.curve.length-1];
  const stat = (label,first,last) => `<article><small>${label}</small><strong>${last}</strong><span>初始 ${first}</span></article>`;
  const metrics = stat('双向对比损失',before.loss.toFixed(4),after.loss.toFixed(4))
    + stat('图像检索文本命中',before.imageHits+' / '+before.count,after.imageHits+' / '+after.count)
    + stat('文本检索图像命中',before.textHits+' / '+before.count,after.textHits+' / '+after.count);
  const maximum = Math.max(...run.curve.map(step=>step.loss),0.01);
  const curve = run.curve.map(step=>`<tr><td>${step.epoch}</td><td><span class="cx-loss"><i style="width:${100*step.loss/maximum}%"></i></span> ${step.loss.toFixed(4)}</td><td>${step.imageHits}/${step.count}</td><td>${step.textHits}/${step.count}</td></tr>`).join('');
  const retrieval = run.pairs.map((p,i)=>{
    const text = run.pairs[run.imageToText[i]]?.text.title || '并列';
    const image = run.pairs[run.textToImage[i]]?.image.title || '并列';
    return `<tr><td>${exText(p.image.title)}<small>${exText(p.text.title)}</small></td><td>${exText(text)}</td><td>${exText(image)}</td></tr>`;
  }).join('');
  openModal('图文预训练实验结果',`<div class="cx-desk stack"><div class="ge-heading"><h3>训练集检索表现</h3><span>${exText(run.id)}</span></div><p class="ge-hint">${run.pairs.length} 组训练配对 · ${run.epochs} 轮 · 学习率 ${run.learningRate} · 随机种子 ${run.seed}。命中统计仅覆盖本次参与训练的配对。</p>
    <div class="cx-metrics">${metrics}</div><section><h3>训练过程</h3><div class="cx-scroll"><table><thead><tr><th>轮次</th><th>损失</th><th>图→文命中</th><th>文→图命中</th></tr></thead><tbody>${curve}</tbody></table></div></section>
    <details class="ge-question"><summary><strong>逐条检索结果</strong></summary><div class="ge-body cx-scroll"><table><thead><tr><th>原配对</th><th>图像检索到的文本</th><th>文本检索到的图像</th></tr></thead><tbody>${retrieval}</tbody></table></div></details>
    <div class="ge-footer"><button type="button" class="btn" data-contrast="back">返回实验台</button><button type="button" class="btn primary" data-contrast="download" data-id="${exText(run.id)}">导出模型与数据快照</button></div></div>`);
}

document.addEventListener('submit',async event=>{
  const form = event.target.closest('[data-contrast-form]');
  if (!form) return;
  event.preventDefault();
  const button = event.submitter || form.querySelector('[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = '训练中…';
  try {
    const values = new FormData(form), pairIds=values.getAll('pair');
    if (pairIds.length<2 || pairIds.length>8) throw new Error('请选择 2–8 组训练配对');
    const run = await api('/api/contrast-experiments','POST',{pairIds,epochs:Number(values.get('epochs')),
      learningRate:Number(values.get('rate')),seed:Number(values.get('seed'))});
    contrastReport(run);
  } catch(error) {notify(error.message,'error');}
  finally {button.disabled=false;button.textContent='开始训练';}
});

document.addEventListener('click',async event=>{
  const button = event.target.closest('button[data-contrast]');
  if (!button || button.disabled) return;
  button.disabled=true;
  try {
    if (button.dataset.contrast === 'pairs') return await guidePairLibrary();
    if (button.dataset.contrast === 'back') return await guideContrastOpen();
    const run = await api('/api/contrast-experiments/'+encodeURIComponent(button.dataset.id));
    if (button.dataset.contrast === 'history') contrastReport(run);
    if (button.dataset.contrast === 'download') downloadJson(run.id+'.json',run);
  } catch(error) {notify(error.message,'error');}
  finally {button.disabled=false;}
});
