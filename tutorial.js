'use strict';

const movie = document.querySelector('#movie');
const panel = document.querySelector('#load-panel');
const label = document.querySelector('#load-label');
const value = document.querySelector('#load-value');
const progress = document.querySelector('#load-progress');
const retry = document.querySelector('#retry');
const chapters = Array.from(document.querySelectorAll('.chapters button'));
let source = '';
let desiredTime = linkTime();
let playWhenReady = false;

function linkTime() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const raw = hash.get('t') ?? query.get('t') ?? '';
  return /^\d+(?:\.\d+)?$/.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

function activeChapter(time) {
  let current = chapters[0];
  for (const item of chapters) {
    if (Number(item.dataset.time) <= time) current = item;
  }
  for (const item of chapters) {
    if (item === current) item.setAttribute('aria-current', 'location');
    else item.removeAttribute('aria-current');
  }
}

function position() {
  if (!source || !Number.isFinite(movie.duration)) return;
  const target = Math.max(0, Math.min(desiredTime, movie.duration - 0.05));
  if (Math.abs(movie.currentTime - target) > 0.02) movie.currentTime = target;
  activeChapter(target);
  if (playWhenReady) {
    playWhenReady = false;
    movie.play().catch(() => movie.focus());
  }
}

for (const item of chapters) {
  item.addEventListener('click', () => {
    desiredTime = Number(item.dataset.time);
    playWhenReady = true;
    const url = new URL(location.href);
    url.searchParams.delete('t');
    url.hash = 't=' + desiredTime;
    history.replaceState(null, '', url);
    activeChapter(desiredTime);
    position();
  });
}

window.addEventListener('hashchange', () => {
  desiredTime = linkTime();
  activeChapter(desiredTime);
  position();
});

function loadingError() {
  label.textContent = '视频载入失败，请重试或下载视频。';
  value.textContent = '';
  progress.hidden = true;
  retry.hidden = false;
  panel.hidden = false;
}

function setProgress(bytes, total) {
  if (total > 0) {
    const percent = Math.min(100, Math.round(bytes * 100 / total));
    progress.value = percent;
    value.textContent = percent + '%';
  } else {
    progress.removeAttribute('value');
    value.textContent = bytes ? (bytes / 1048576).toFixed(1) + ' MiB' : '';
  }
}

async function loadVideo() {
  panel.hidden = false;
  retry.hidden = true;
  progress.hidden = false;
  label.textContent = '正在载入视频';
  setProgress(0, 0);
  if (source) {
    movie.removeAttribute('src');
    movie.load();
    URL.revokeObjectURL(source);
    source = '';
  }
  try {
    const response = await fetch(movie.dataset.src || '/materials-corpus-workbench/crystal-walkthrough.mp4');
    if (!response.ok) throw new Error('video download failed');
    const total = Number(response.headers.get('Content-Length')) || 0;
    let blob;
    if (response.body) {
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const {done, value:chunk} = await reader.read();
        if (done) break;
        chunks.push(chunk);
        bytes += chunk.byteLength;
        setProgress(bytes, total);
      }
      if (!bytes) throw new Error('empty file');
      blob = new Blob(chunks, {type:'video/mp4'});
    } else {
      blob = await response.blob();
    }
    source = URL.createObjectURL(blob);
    movie.src = source;
    label.textContent = '正在打开视频';
    movie.load();
  } catch {
    loadingError();
  }
}

retry.addEventListener('click', loadVideo);
movie.addEventListener('loadedmetadata', () => {
  panel.hidden = true;
  position();
});
movie.addEventListener('timeupdate', () => {
  if (!movie.seeking && movie.readyState >= HTMLMediaElement.HAVE_METADATA) activeChapter(movie.currentTime);
});
movie.addEventListener('error', () => { if (source) loadingError(); });
window.addEventListener('pagehide', event => {
  if (!event.persisted && source) URL.revokeObjectURL(source);
});
activeChapter(desiredTime);
loadVideo();
