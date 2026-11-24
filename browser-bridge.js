'use strict';
(() => {
  const remoteFetch = window.fetch.bind(window);
  const waiting = new Map();
  let id = 0;
  let worker;
  let role = 'operator';
  try { role=sessionStorage.getItem('materials-current-role') || role; } catch {}

  function activeWorker() {
    if (worker) return worker;
    worker = new Worker('/materials-corpus-workbench/browser-worker.js?v=da9a3a91523f');
    worker.onmessage = event => {
      const packet = event.data;
      const resolve = waiting.get(packet.id);
      if (!resolve) return;
      waiting.delete(packet.id);
      resolve(packet);
    };
    worker.onerror = () => {
      for (const resolve of waiting.values()) resolve({status:503,data:{error:'平台运行组件加载失败。请刷新页面重新打开。'}});
      waiting.clear();
      worker.terminate();
      worker=undefined;
    };
    return worker;
  }

  const jsonResponse = (status, payload) => new Response(JSON.stringify(payload), {
    status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
  });
  window.fetch = async (input, init) => {
    const href = typeof input==='string' || input instanceof URL ? input : input.url;
    const url = new URL(href, location.href);
    if(url.origin!==location.origin || !url.pathname.startsWith('/api/')) return remoteFetch(input, init);
    const req = new Request(input, init);
    if(!['GET','POST'].includes(req.method)) return jsonResponse(405,{error:'不支持此请求方式'});
    if(req.method==='GET' && url.pathname==='/api/training-practice-files') {
      const file=await remoteFetch('/materials-corpus-workbench/practice-files.zip');
      if(!file.ok) return jsonResponse(file.status,{error:'训练操作材料包未能读取'});
      const blob=await file.blob();
      const encoded=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result.split(',')[1]);
        reader.onerror=()=>reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return jsonResponse(200,{filename:'课题一训练操作材料.zip',contentBase64:encoded});
    }
    const body=req.method==='POST'?await req.text():'{}';
    if (body.length>24*1024*1024) return jsonResponse(413,{error:'请求超过 24 MiB'});
    if(req.method==='POST' && url.pathname==='/api/curves/extract'){
      try {
        const {filename,contentBase64}=JSON.parse(body);
        if(!filename || typeof contentBase64!=='string')throw Error('缺少图像名称或数据。');
        const bytes=Uint8Array.from(atob(contentBase64),ch=>ch.charCodeAt(0));
        const result=await window.curveExtractFile(new File([bytes],filename));
        return jsonResponse(200,result);
      } catch(error) { return jsonResponse(422,{error:error.message}); }
    }
    const job=++id;
    const endpoint=activeWorker();
    const packet=await new Promise(resolve => {
      waiting.set(job,resolve);
      endpoint.postMessage({id:job, path:url.pathname.replace(/\/$/,''), method:req.method, body,role});
    });
    if(url.pathname==='/api/meeting/role' && packet.status===200) {
      role=packet.data.username;
      try {sessionStorage.setItem('materials-current-role',role);} catch {}
    }
    return jsonResponse(packet.status,packet.data);
  };
})();
