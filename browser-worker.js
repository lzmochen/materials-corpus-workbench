'use strict';

const DB_PATH = '/visitor.sqlite3';
const STORE_NAME = 'workspace';
const DB_NAME = 'materials-workbench-public-v1';
let runtime;
let storage;
let seedBytes;
let revision = -1;
let pythonRequest;
let prepared;
let queueTail = Promise.resolve();
let jobScheduled = false;

async function asset(url, type = 'arrayBuffer') {
  const response = await fetch(url, {credentials: 'same-origin'});
  if (!response.ok) throw Error('无法读取平台组件 ' + url.split('/').pop());
  return response[type]();
}

function openStorage() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readEntry(key) {
  return new Promise((resolve, reject) => {
    const tx = storage.transaction(STORE_NAME);
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

class StaleCopy extends Error {}

function commitSnapshot(bytes, expected) {
  return new Promise((resolve, reject) => {
    const tx = storage.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const read = store.get('revision');
    let stale = false;
    read.onsuccess = () => {
      if ((read.result || 0) !== expected) {
        stale = true;
        tx.abort();
        return;
      }
      store.put(bytes, 'sqlite');
      store.put(expected + 1, 'revision');
    };
    tx.oncomplete = () => resolve(expected + 1);
    tx.onabort = () => reject(stale ? new StaleCopy() : tx.error || Error('浏览器存储事务已中止'));
    tx.onerror = () => {};
  });
}

async function syncDatabase() {
  const latest = (await readEntry('revision')) || 0;
  if (revision === latest) return;
  // Read both keys in a single transaction if another tab has committed a new revision.
  const state = await new Promise((resolve, reject) => {
    const tx = storage.transaction(STORE_NAME);
    const store = tx.objectStore(STORE_NAME);
    const rev = store.get('revision'), data = store.get('sqlite');
    tx.oncomplete = () => resolve({revision: rev.result || 0, data: data.result});
    tx.onabort = () => reject(tx.error);
  });
  if (!state.data && !seedBytes) seedBytes = new Uint8Array(await asset('/materials-corpus-workbench/seed.sqlite3'));
  runtime.FS.writeFile(DB_PATH, state.data || seedBytes);
  runtime.runPython('setup_database()');
  revision = state.revision;
}

function nativeBytes(value) {
  return typeof value.toJs === 'function' ? value.toJs() : value;
}

async function bitmap(bytes) {
  const image = await createImageBitmap(new Blob([bytes]));
  if (image.width * image.height > 16000000) {
    image.close();
    throw Error('图像像素过多，请裁剪至 1600 万像素以内。');
  }
  return image;
}

async function imagePixels(raw) {
  const img = await bitmap(nativeBytes(raw));
  try {
    const canvas = new OffscreenCanvas(8, 8);
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.fillStyle = 'white';
    ctx.fillRect(0,0,8,8);
    ctx.drawImage(img, 0, 0, 8, 8);
    const rgba = ctx.getImageData(0,0,8,8).data;
    const rgb = [];
    for (let i=0; i<rgba.length; i+=4) rgb.push(rgba[i]/255, rgba[i+1]/255, rgba[i+2]/255);
    return JSON.stringify(rgb);
  } finally {
    img.close();
  }
}

async function recognize(raw) {
  let engine;
  try {
    const bytes = nativeBytes(raw);
    const img = await bitmap(bytes);
    const width=img.width, height=img.height;
    img.close();
    const base = new URL('/materials-corpus-workbench/runtime/ocr/', self.location).href;
    if (!self.Tesseract) importScripts(base+'tesseract.min.js');
    engine = await self.Tesseract.createWorker('chi_sim+eng', 1, {
      workerPath: base+'worker.min.js', corePath: base+'tesseract-core-lstm.wasm.js',
      langPath: base, workerBlobURL: false
    });
    const result = await engine.recognize(bytes);
    const lines = (result.data.lines || []).filter(line => String(line.text || '').trim()).map(line => {
      const rect=line.bbox;
      return {text:line.text.trim(), confidence:Math.max(0,Math.min(1,line.confidence/100)),
        bbox:{x:rect.x0/width, y:rect.y0/height, width:(rect.x1-rect.x0)/width, height:(rect.y1-rect.y0)/height}};
    });
    return JSON.stringify({engine:'Tesseract LSTM', lines});
  } catch {
    return JSON.stringify({error:'图像识别组件未能读取原件，请确认网络连接并使用清晰的 PNG 或 JPEG 后重试。'});
  } finally {
    if (engine) await engine.terminate();
  }
}

async function boot() {
  const base = new URL('/materials-corpus-workbench/runtime/', self.location).href;
  importScripts(base+'pyodide.js');
  const results = await Promise.all([
    loadPyodide({indexURL:base}), asset('/materials-corpus-workbench/business.zip?v=50179e2bda67'), asset('/materials-corpus-workbench/browser_api.py','text'), openStorage()
  ]);
  runtime=results[0];
  storage=results[3];
  await runtime.loadPackage(['sqlite3','hashlib','pyyaml']);
  runtime.registerJsModule('browser_media', {recognize, imagePixels});
  runtime.FS.mkdirTree('/app');
  runtime.unpackArchive(results[1], 'zip', {extractDir:'/app'});
  runtime.FS.writeFile('/app/browser_api.py', results[2], {encoding:'utf8'});
  runtime.runPython("import sys\nsys.path.insert(0, '/app')\nfrom browser_api import execute_request, setup_database");
  pythonRequest=runtime.globals.get('execute_request');
}

function scheduleJob() {
  if (jobScheduled) return;
  jobScheduled = true;
  setTimeout(() => {
    jobScheduled=false;
    enqueue({method:'QUEUE', path:'', role:'operator', body:'{}'});
  }, 0);
}

async function execute(message) {
  if (!prepared) prepared=boot().catch(err => {prepared=undefined; throw err;});
  await prepared;
  // No browser transaction spans a Python calculation. CAS handles races across tabs,
  // while the per-worker promise queue serializes requests from the current tab.
  for (let attempt=0; attempt<3; attempt++) {
    await syncDatabase();
    try {
      const result=JSON.parse(await pythonRequest(message.method, message.path, message.role, message.body));
      if (result.changed) revision=await commitSnapshot(runtime.FS.readFile(DB_PATH), revision);
      if (result.queued) scheduleJob();
      return result;
    } catch (err) {
      revision=-1;
      if (err instanceof StaleCopy && attempt<2) continue;
      if (err instanceof StaleCopy) return {status:409,data:{error:'另一标签页正在更新资料，请重新打开记录后提交。'}};
      throw err;
    }
  }
}

function enqueue(message) {
  const run = async () => {
    try {
      const result = await execute(message);
      if (message.id) self.postMessage({id:message.id, status:result.status, data:result.data});
    } catch (err) {
      console.error('Workbench runtime',err);
      if (message.id) self.postMessage({id:message.id,status:503,data:{error:
        err?.name==='QuotaExceededError' ? '浏览器存储空间不足，本次更改未保存。请释放空间后重试。' :
        '浏览器工作区未能完成加载或保存。请检查网络连接、站点存储权限并刷新。'}});
    }
  };
  queueTail=queueTail.then(run,run);
}

self.onmessage=e=>enqueue(e.data);
