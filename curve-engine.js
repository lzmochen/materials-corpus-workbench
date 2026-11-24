/* Pixel-space curve tracing and reversible axis calibration. No network or model dependency. */
(function (global) {
  'use strict';

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(n, hi));
  const rgbHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const luminance = c => .299 * c[0] + .587 * c[1] + .114 * c[2];
  function parseColor(hex) {
    if (Array.isArray(hex) && hex.length === 3 && hex.every(Number.isFinite)) return hex.slice();
    let t = String(hex || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(t)) t = '#' + [...t.slice(1)].map(c => c + c).join('');
    return /^#[0-9a-f]{6}$/i.test(t) ? [1, 3, 5].map(i => parseInt(t.slice(i, i + 2), 16)) : null;
  }
  function boundedRect(r, w, h) {
    const values = [r.left, r.top, r.right, r.bottom].map(Number);
    if (!values.every(Number.isFinite)) throw new RangeError('绘图区边界需要有效的像素坐标');
    const [x0, y0, x1, y1] = values;
    return {left: clamp(Math.round(Math.min(x0, x1)), 0, w - 1), top: clamp(Math.round(Math.min(y0, y1)), 0, h - 1), right: clamp(Math.round(Math.max(x0, x1)), 0, w - 1), bottom: clamp(Math.round(Math.max(y0, y1)), 0, h - 1)};
  }
  function background(rgb, w, roi) {
    const bins = new Map();
    const step = Math.max(1, Math.floor(Math.sqrt((roi.right - roi.left + 1) * (roi.bottom - roi.top + 1) / 60000)));
    for (let y = roi.top; y <= roi.bottom; y += step) for (let x = roi.left; x <= roi.right; x += step) {
      const k = (y * w + x) * 3;
      const r = rgb[k], g = rgb[k + 1], b = rgb[k + 2];
      const key = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
      let bin = bins.get(key);
      if (!bin) { bin = [0, 0, 0, 0]; bins.set(key, bin); }
      bin[0]++; bin[1] += r; bin[2] += g; bin[3] += b;
    }
    const best = [...bins.values()].sort((a, b) => b[0] - a[0])[0];
    return best.slice(1).map(n => Math.round(n / best[0]));
  }
  function planes(img) {
    const {width: w, height: h, data} = img;
    const rgb = new Uint8Array(w * h * 3);
    for (let p = 0, k = 0, j = 0; p < w * h; p++, k += 4, j += 3) {
      const a = data[k + 3] / 255, white = 255 * (1 - a);
      rgb[j] = data[k] * a + white; rgb[j + 1] = data[k + 1] * a + white; rgb[j + 2] = data[k + 2] * a + white;
    }
    return rgb;
  }
  function longestStripe(mask, offset, step, length) {
    let start = -1, last = -1, first = 0, end = -1;
    for (let n = 0; n <= length + 2; n++) {
      if (n < length && mask[offset + n * step]) {
        if (start < 0) start = n;
        last = n;
      } else if (start >= 0 && n - last >= 3) {
        if (last - start > end - first) { first = start; end = last; }
        start = -1;
      }
    }
    return {first, end, length: end - first + 1};
  }
  function detectFrame(rgb, w, h, bg) {
    const bgL = luminance(bg), mask = new Uint8Array(w * h);
    let inkLeft = w, inkTop = h, inkRight = -1, inkBottom = -1;
    for (let j = 0, k = 0; j < w * h; j++, k += 3) {
      const r = rgb[k], g = rgb[k + 1], b = rgb[k + 2];
      const c = Math.max(r, g, b) - Math.min(r, g, b);
      const contrast = Math.abs(.299 * r + .587 * g + .114 * b - bgL);
      if (c <= 45 && contrast > 76) mask[j] = 1;
      if (c > 36 && Math.max(Math.abs(r-bg[0]),Math.abs(g-bg[1]),Math.abs(b-bg[2]))>45) {
        const y = Math.floor(j / w), x = j - y * w;
        inkLeft = Math.min(x, inkLeft); inkTop = Math.min(y, inkTop); inkRight = Math.max(x, inkRight); inkBottom = Math.max(y, inkBottom);
      }
    }
    const rows = [], cols = [];
    for (let y = 0; y < h; y++) { const line = longestStripe(mask, y * w, 1, w); if (line.length >= Math.max(12, w * .27)) rows.push({...line, at: y}); }
    for (let x = 0; x < w; x++) { const line = longestStripe(mask, x, w, h); if (line.length >= Math.max(12, h * .25)) cols.push({...line, at: x}); }
    let best, bestScore = -1;
    for (const row of rows) for (const col of cols) {
      // A drawing border or an axis pair meets near the end of both long strokes.
      const dx = Math.min(Math.abs(col.at-row.first), Math.abs(col.at-row.end));
      const dy = Math.min(Math.abs(row.at-col.first), Math.abs(row.at-col.end));
      if (dx > Math.max(7, w*.025) || dy > Math.max(7, h*.03)) continue;
      const score = (row.length / w) * (col.length / h) * (1 - .3 * dx / row.length - .3 * dy / col.length);
      if (score > bestScore) { bestScore = score; best = {left: row.first, right: row.end, top: col.first, bottom: col.end}; }
    }
    if (best) {
      // Tick strokes can project a few pixels past the true crossing.
      const near = (lines, v, span) => {
        const hits = lines.filter(s => Math.abs(s.at-v)<=Math.max(6,span*.018));
        if (!hits.length) return v;
        const longest = Math.max(...hits.map(s=>s.length));
        const similar=hits.filter(s=>s.length>=longest*.95).map(s=>s.at).sort((a,b)=>a-b);
        return similar[Math.floor(similar.length/2)];
      };
      best.left=near(cols,best.left,w);best.right=near(cols,best.right,w);
      best.top=near(rows,best.top,h);best.bottom=near(rows,best.bottom,h);
      return {roi:boundedRect(best,w,h),method:'axes'};
    }
    if (inkRight-inkLeft>w*.18 && inkBottom-inkTop>h*.13) {
      const rect = {left:inkLeft-2,right:inkRight+2,top:inkTop-2,bottom:inkBottom+2};
      return {roi:boundedRect(rect,w,h),method:'ink'};
    }
    // On a borderless grayscale plot, long connected strokes survive this test, unlike labels and isolated specks.
    const queue=new Int32Array(mask.length);
    let region=null;
    for(let i=0;i<mask.length;i++){
      if(!mask[i])continue;
      let head=0,end=1;queue[0]=i;mask[i]=0;
      let l=w,r=0,t=h,b=0;
      while(head<end){
        const p=queue[head++],y=Math.floor(p/w),x=p-y*w;
        l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
        for(let yy=Math.max(0,y-1);yy<=Math.min(h-1,y+1);yy++){
          for(let xx=Math.max(0,x-1);xx<=Math.min(w-1,x+1);xx++){
            const k=yy*w+xx;
            if(mask[k]){mask[k]=0;queue[end++]=k;}
          }
        }
      }
      if((r-l>w*.16&&b-t>h*.03)||(b-t>h*.17&&r-l>w*.035)){
        if(!region)region={left:l,right:r,top:t,bottom:b};
        else {region.left=Math.min(region.left,l);region.right=Math.max(region.right,r);region.top=Math.min(region.top,t);region.bottom=Math.max(region.bottom,b);}
      }
    }
    if(region)return {roi:boundedRect({left:region.left-2,top:region.top-2,right:region.right+2,bottom:region.bottom+2},w,h),method:'ink'};
    return {roi:{left:0,top:0,right:w-1,bottom:h-1},method:'image'};
  }
  function inkColor(r,g,b,bg) {
    // Relative chroma keeps affinity stable on anti-aliased edges and tinted paper.
    const dr=r-bg[0],dg=g-bg[1],db=b-bg[2];
    const max=Math.max(dr,dg,db),min=Math.min(dr,dg,db),span=max-min;
    let hue=0;
    if (span) {
      if (max===dr) hue=(dg-db)/span+(dg<db?6:0);
      else if (max===dg) hue=(db-dr)/span+2;
      else hue=(dr-dg)/span+4;
    }
    return {h:hue*60,c:span,v:Math.max(Math.abs(dr),Math.abs(dg),Math.abs(db)),l:.299*r+.587*g+.114*b};
  }
  const hueDist=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b));
  function paletteFor(rgb,w,r,bg,excluded,minPixels) {
    const bins=new Map(),gray=new Uint32Array(256);
    for(let y=r.top;y<=r.bottom;y++) for(let x=r.left;x<=r.right;x++) {
      const p=y*w+x;
      if(excluded[p])continue;
      const k=p*3,a=rgb[k],b=rgb[k+1],c=rgb[k+2],d=inkColor(a,b,c,bg);
      if(d.v<29)continue;
      if(d.c<26){gray[Math.round(d.l)]++;continue;}
      const key=(a>>4)<<8|(b>>4)<<4|(c>>4);
      let bin=bins.get(key);
      if(!bin){bin={n:0,sum:[0,0,0]};bins.set(key,bin);}
      bin.n++;bin.sum[0]+=a;bin.sum[1]+=b;bin.sum[2]+=c;
    }
    const result=[];
    const sorted=[...bins.values()].sort((a,b)=>b.n-a.n);
    for(const bin of sorted) {
      if(bin.n<Math.max(3,Math.min(18,minPixels*.30)))break;
      const c=bin.sum.map(q=>Math.round(q/bin.n)), d=inkColor(...c,bg);
      if(d.c<32 || result.some(p=>hueDist(p.h,d.h)<15))continue;
      result.push({...d,rgb:c});if(result.length===12)break;
    }
    const peaks=Array.from(gray,(n,v)=>({n,v})).filter(p=>p.n>=Math.max(4,minPixels*.38)).sort((a,b)=>b.n-a.n);
    const bgL=luminance(bg);
    for(const peak of peaks) {
      if(Math.abs(peak.v-bgL)<37 || result.some(q=>q.c<26 && Math.abs(q.l-peak.v)<39)) continue;
      if(result.filter(q=>q.c<26).length===4)break;
      const c=[peak.v,peak.v,peak.v];
      result.push({...inkColor(...c,bg),rgb:c});
    }
    return result;
  }
  function noiseLines(rgb,w,r,bg,mask,opts) {
    const bgL=luminance(bg),rw=r.right-r.left+1,rh=r.bottom-r.top+1;
    function measure(horizontal) {
      const n=horizontal?rh:rw,length=horizontal?rw:rh;
      const start=r.top*w+r.left,outer=horizontal?w:1,inner=horizontal?1:w;
      const rows=[];
      for(let i=0;i<n;i++){
        const hist=new Uint32Array(32);
        for(let j=0,p=start+i*outer;j<length;j++,p+=inner){
          const k=p*3,a=rgb[k],b=rgb[k+1],c=rgb[k+2];
          if(Math.max(a,b,c)-Math.min(a,b,c)>52)continue;
          const l=(a+b+c)/3;
          if(Math.abs(l-bgL)>18)hist[Math.min(31,l>>3)]++;
        }
        let bin=0;for(let b=1;b<32;b++)if(hist[b]>hist[bin])bin=b;
        const count=hist[bin]+(hist[bin-1]||0)+(hist[bin+1]||0);
        if(count>=length*.48)rows.push({i,bin,near:i<Math.max(3,n*.009)||n-1-i<Math.max(3,n*.009)});
      }
      const groups=[];
      for(const line of rows) {
        const prev=groups.at(-1);
        if(prev&&line.i-prev.at(-1).i===1&&Math.abs(line.bin-prev[0].bin)<=2)prev.push(line);
        else groups.push([line]);
      }
      let count=0;
      for(const group of groups){
        const rec=group[Math.floor(group.length/2)];
        const border=opts.removeBorder!==false&&group.some(q=>q.near);
        const grid=opts.removeGrid!==false&&Math.abs(rec.bin*8+4-bgL)<155&&groups.filter(g=>Math.abs(g[0].bin-rec.bin)<=2).length>=3;
        if(!border&&!grid) continue;
        count+=group.length;
        for(const row of group)for(let j=0,p=start+row.i*outer;j<length;j++,p+=inner){
          const k=p*3,a=rgb[k],b=rgb[k+1],c=rgb[k+2],l=(a+b+c)/3;
          if(Math.max(a,b,c)-Math.min(a,b,c)<=52&&Math.abs(l-(rec.bin*8+4)) < (border?49:22))mask[p]=1;
        }
      }
      return count;
    }
    return measure(true)+measure(false);
  }
  function markExcluded(mask,w,h,rects) {
    for(const input of rects||[]) {
      const b=boundedRect(input,w,h);
      for(let y=b.top;y<=b.bottom;y++)mask.fill(1,y*w+b.left,y*w+b.right+1);
    }
  }
  function classify(rgb,w,roi,bg,excluded,colors) {
    const pw=roi.right-roi.left+3,ph=roi.bottom-roi.top+3;
    const tags=new Uint8Array(pw*ph),freq = new Uint32Array(colors.length);
    let count=0;
    for(let y=roi.top;y<=roi.bottom;y++)for(let x=roi.left;x<=roi.right;x++) {
      const i=y*w+x;if(excluded[i])continue;
      const k=i*3,r=rgb[k],g=rgb[k+1],b=rgb[k+2],c=inkColor(r,g,b,bg);
      if(c.v<24)continue;
      let best=-1,score=Infinity;
      for(let j=0;j<colors.length;j++){
        const pal=colors[j];let delta;
        if(pal.c>=26){
          if(c.c<22)continue;
          if(c.c/Math.max(1,c.v)<.35*pal.c/Math.max(1,pal.v))continue;
          const angle=hueDist(c.h,pal.h);
          if(angle>25)continue;
          delta=angle+.035*Math.abs(c.l-pal.l)+.022*Math.abs(c.c-pal.c);
        }else{
          if(c.c>=24||c.v<33)continue;
          delta=Math.abs(c.l-pal.l);if(delta>33)continue;
        }
        if(delta<score){best=j;score=delta;}
      }
      if(best>=0){
        const p=(y-roi.top+1)*pw+x-roi.left+1;
        tags[p]=best+1;freq[best]++;count++;
      }
    }
    const gray=colors.map(c=>c.c<26),contrast=colors.map(c=>Math.abs(c.l-luminance(bg)));
    if(gray.filter(Boolean).length>1){
      // Anti-aliased edges of dark strokes can have exactly the same RGB value as a separate gray series.
      // Resolve only immediate edge pixels against their local core. Stand-alone light traces keep their label.
      const original=tags.slice();
      for(let p=pw+1;p<tags.length-pw-1;p++){
        const j=original[p]-1;if(j<0||!gray[j])continue;
        let best=j;
        for(const n of [p-1,p+1,p-pw,p+pw]){
          const k=original[n]-1;
          if(k>=0&&gray[k]&&contrast[k]>contrast[best]+23)best=k;
        }
        if(best!==j){tags[p]=best+1;freq[j]--;freq[best]++;}
      }
    }
    return {tags,pw,ph,freq,count};
  }
  function thin(mask,ink,w) {
    // Zhang–Suen subiterations delete only simple boundary pixels and protect endpoints.
    const deleted=[];
    for(let iter=0;iter<300;iter++){
      let changes=0;
      for(let pass=0;pass<2;pass++){
        deleted.length=0;
        for(const p of ink) {
          if(!mask[p])continue;
          const a=mask[p-w],b=mask[p-w+1],c=mask[p+1],d=mask[p+w+1],e=mask[p+w],f=mask[p+w-1],g=mask[p-1],h=mask[p-w-1];
          const total=a+b+c+d+e+f+g+h;
          if(total<2||total>6)continue;
          const crossings=(!a&&b)+(!b&&c)+(!c&&d)+(!d&&e)+(!e&&f)+(!f&&g)+(!g&&h)+(!h&&a);
          if(crossings!==1)continue;
          if(pass===0?(a*c*e||c*e*g):(a*c*g||a*e*g))continue;
          deleted.push(p);
        }
        for(const p of deleted)mask[p]=0;
        changes+=deleted.length;
      }
      if(!changes)break;
    }
  }
  function trace(mask,ink,w,roi) {
    const offsets=[1,w+1,w,w-1,-1,-w-1,-w,-w+1];
    const dx=[1,1,0,-1,-1,-1,0,1],dy=[0,1,1,1,0,-1,-1,-1];
    const adj=new Uint8Array(mask.length), used=new Uint8Array(mask.length);
    const pixels=ink.filter(p=>mask[p]);
    const xy=p=>({px:roi.left+(p%w)-1,py:roi.top+Math.floor(p/w)-1});
    for(const p of pixels)for(let k=0;k<8;k++) {
      if(!mask[p+offsets[k]])continue;
      if(k%2 && (mask[p+offsets[(k+7)%8]]||mask[p+offsets[(k+1)%8]]))continue;
      adj[p]|=1<<k;
    }
    const paths=[];
    function walk(start) {
      let p=start,prev=-1;const line=[xy(p)];
      while(adj[p]&~used[p]) {
        let next=-1,best=-2;
        const candidates=adj[p]&~used[p];
        for(let k=0;k<8;k++) {
          if(!(candidates&1<<k))continue;
          const align=prev<0?1:(dx[k]*dx[prev]+dy[k]*dy[prev])/((k%2?Math.SQRT2:1)*(prev%2?Math.SQRT2:1));
          if(align>best){best=align;next=k;}
        }
        used[p]|=1<<next;p+=offsets[next];used[p]|=1<<((next+4)%8);
        line.push(xy(p));prev=next;if(p===start)break;
      }
      return line;
    }
    for(const p of pixels) if(adj[p] && !(adj[p]&(adj[p]-1)) && adj[p]!==used[p]) paths.push(walk(p));
    for(const p of pixels){
      if(!adj[p])paths.push([xy(p)]);
      while(adj[p]!==used[p])paths.push(walk(p));
    }
    return paths;
  }
  function bounds(path) {
    let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;
    for(const p of path){l=Math.min(l,p.px);r=Math.max(r,p.px);t=Math.min(t,p.py);b=Math.max(b,p.py);}
    return {l,r,t,b,w:r-l+1,h:b-t+1};
  }
  function legendSample(box,rgb,w,roi,bg) {
    const rw=roi.right-roi.left+1,rh=roi.bottom-roi.top+1;
    if(box.w<9||box.w>Math.max(24,rw*.19)||box.h>Math.max(4,box.w*.11)||box.w<3*box.h)return false;
    if(box.t>roi.top+rh*.46 && box.b<roi.bottom-rh*.20)return false;
    const x0=box.r+3,x1=Math.min(roi.right,x0+Math.max(20,Math.round(rw*.12)));
    const y0=Math.max(roi.top,Math.round((box.t+box.b)/2)-6),y1=Math.min(roi.bottom,y0+13);
    let occupied=0,transitions=0,previous=false;
    for(let x=x0;x<=x1;x++){
      let count=0;
      for(let y=y0;y<=y1;y++){const k=3*(y*w+x),a=rgb[k],b=rgb[k+1],c=rgb[k+2];if(Math.max(a,b,c)-Math.min(a,b,c)<23 && Math.abs((a+b+c)/3-luminance(bg))>75)count++;}
      const marked=count>=2;
      if(marked){occupied++;if(!previous)transitions++;}
      previous=marked;
    }
    return transitions>=2&&occupied>=5;
  }
  function bridgePaths(paths,limit) {
    const ends=[],cells=new Map(),links=new Map(),pairs=[];
    const key=(x,y)=>x+','+y;
    const distance=(a,b)=>Math.hypot(a.px-b.px,a.py-b.py);
    for(let i=0;i<paths.length;i++){
      const path=paths[i];
      if(path.length<4||distance(path[0],path.at(-1))<.5)continue;
      for(let e=0;e<2;e++){
        const p=e?path.at(-1):path[0],off=Math.min(5,path.length-1),q=e?path[path.length-1-off]:path[off];
        const d=distance(p,q)||1;
        ends.push({id:i*2+e,p,dx:(p.px-q.px)/d,dy:(p.py-q.py)/d});
      }
    }
    for(const end of ends){
      const x=Math.floor(end.p.px/limit),y=Math.floor(end.p.py/limit);
      for(let a=x-1;a<=x+1;a++)for(let b=y-1;b<=y+1;b++)for(const other of cells.get(key(a,b))||[]){
        const d=distance(end.p,other.p);
        if(d>limit||(!d&&(other.id>>1)===(end.id>>1)))continue;
        const vx=(other.p.px-end.p.px)/(d||1),vy=(other.p.py-end.p.py)/(d||1);
        const align=d?Math.min(end.dx*vx+end.dy*vy,-other.dx*vx-other.dy*vy):-(end.dx*other.dx+end.dy*other.dy);
        if(align<.44||((other.id>>1)===(end.id>>1)&&paths[end.id>>1].length<limit*2))continue;
        pairs.push({a:end.id,b:other.id,cost:d*(1.4-.4*align)});
      }
      const cell=key(x,y);if(!cells.has(cell))cells.set(cell,[]);cells.get(cell).push(end);
    }
    pairs.sort((a,b)=>a.cost-b.cost);
    for(const p of pairs)if(!links.has(p.a)&&!links.has(p.b)){links.set(p.a,p.b);links.set(p.b,p.a);}
    const seen=new Set(),stitched=[];
    function follow(index,entry){
      const result=[];let id=index*2+entry;
      while(!seen.has(id>>1)){
        const part=paths[id>>1];seen.add(id>>1);
        if(id%2)for(let j=part.length-1;j>=0;j--)result.push(part[j]);else for(const p of part)result.push(p);
        const next=links.get(id^1);
        if(next===undefined)break;
        id=next;
        if((id>>1)===index){result.push(result[0]);break;}
      }
      stitched.push(result);
    }
    for(let i=0;i<paths.length;i++)if(!seen.has(i)){
      if(!links.has(i*2))follow(i,0);
      else if(!links.has(i*2+1))follow(i,1);
    }
    for(let i=0;i<paths.length;i++)if(!seen.has(i))follow(i,0);
    return stitched;
  }
  function isolatedMarks(mask,ink,w,roi) {
    const seen=new Uint8Array(mask.length),queue=[],blobs=[];
    const rw=roi.right-roi.left+1,rh=roi.bottom-roi.top+1;
    const maxSize=clamp(Math.min(rw,rh)*.045,6,20);
    let compactArea=0;
    for(const start of ink){
      if(seen[start])continue;
      queue.length=0;queue.push(start);seen[start]=1;
      let l=Infinity,r=0,t=Infinity,b=0,sx=0,sy=0;
      for(let i=0;i<queue.length;i++){
        const p=queue[i],x=p%w,y=Math.floor(p/w);
        l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);sx+=x;sy+=y;
        for(const d of [-w-1,-w,-w+1,-1,1,w-1,w,w+1]){
          const n=p+d;if(mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}
        }
      }
      const bw=r-l+1,bh=b-t+1,area=queue.length;
      if(bw>maxSize||bh>maxSize||bw/bh<.53||bw/bh>1.9||area<bw*bh*.43)continue;
      compactArea+=area;blobs.push({px:roi.left-1+sx/area,py:roi.top-1+sy/area,area});
    }
    if(blobs.length<4||blobs.length>5000||compactArea<ink.length*.72)return null;
    const areas=blobs.map(b=>b.area).sort((a,b)=>a-b),median=areas[areas.length>>1];
    const uniform=blobs.filter(b=>b.area>=Math.max(1,median*.44)&&b.area<=median*2.15);
    if(uniform.length<4||uniform.length<blobs.length*.70)return null;
    const spread=bounds(uniform);
    if(spread.w<rw*.22&&spread.h<rh*.22)return null;
    return uniform.map(({px,py})=>({px,py})).sort((a,b)=>a.px-b.px||a.py-b.py);
  }
  function styleOf(pathGroups) {
    let gaps=0,length=0;
    for(const p of pathGroups)for(let i=1;i<p.length;i++){
      const d=Math.hypot(p[i].px-p[i-1].px,p[i].py-p[i-1].py);
      length+=d;if(d>2.5)gaps++;
    }
    return gaps>=3 && gaps>=length/100 ? 'dashed' : 'solid';
  }
  function distinguishTracks(paths,roi) {
    // Only split same-color traces when both span much of the graph and remain separated,
    // including near their ends. Return and outward branches of hysteresis stay in one layer.
    const rw=roi.right-roi.left+1,rh=roi.bottom-roi.top+1;
    const tracks=paths.map(path=>({path,box:bounds(path)}));
    const long=tracks.filter(t=>t.box.w>=rw*.53);
    if(long.length<2||long.length>12)return [paths];
    function profile(t){
      const sums=new Float64Array(12),counts=new Uint32Array(12);
      for(const p of t.path){const k=clamp(Math.floor((p.px-roi.left)*12/rw),0,11);sums[k]+=p.py;counts[k]++;}
      return Array.from(sums,(v,k)=>counts[k]?v/counts[k]:NaN);
    }
    long.forEach(t=>{t.profile=profile(t);});
    for(let i=0;i<long.length;i++)for(let j=i+1;j<long.length;j++){
      const a=long[i].profile,b=long[j].profile;
      const diff=a.map((v,k)=>v-b[k]).filter(Number.isFinite);
      if(diff.length<5||Math.min(...diff.map(Math.abs))<Math.max(9,rh*.095) || diff.some(v=>v*diff[0]<0))return [paths];
    }
    const groups=long.map(t=>[t.path]);
    for(const t of tracks)if(!long.includes(t)){
      const mid=t.path[t.path.length>>1],k=clamp(Math.floor((mid.px-roi.left)*12/rw),0,11);
      let best=0,distance=Infinity;
      long.forEach((v,j)=>{const reference=Number.isFinite(v.profile[k])?v.profile[k]:(v.box.t+v.box.b)/2;const d=Math.abs(reference-mid.py);if(d<distance){distance=d;best=j;}});
      groups[best].push(t.path);
    }
    return groups;
  }
  function finalizeSeries(layer,color,pw,roi,rgb,w,bg,opts,minLength) {
    const mask=new Uint8Array(layer.length),ink=[];
    for(let p=0;p<layer.length;p++)if(layer[p]){mask[p]=1;ink.push(p);}
    if(ink.length<minLength)return null;
    const marks=isolatedMarks(mask,ink,pw,roi);
    if(marks)return [{paths:marks.map(p=>[p]),points:marks,style:'dotted'}];
    thin(mask,ink,pw);
    const paths=trace(mask,ink,pw,roi);
    const boxed=paths.map(path=>({path,box:bounds(path)}));
    const longest=boxed.reduce((n,v)=>Math.max(n,v.path.length),0);
    const base=Math.max(5,Math.min(16,minLength*.7));
    const rw=roi.right-roi.left+1,rh=roi.bottom-roi.top+1;
    const minimumSpan=Math.max(8,Math.min(rw,rh)*.08);
    const isColored=color.c>=26;
    const shortStrokes=boxed.filter(v=>v.path.length>=4&&v.path.length<=base*1.8&&Math.max(v.box.w,v.box.h)>=4);
    const distributed=shortStrokes.length>=4?bounds(shortStrokes.map(v=>v.path[v.path.length>>1])):null;
    const isDashed=distributed && (distributed.w>rw*.3||distributed.h>rh*.3) && shortStrokes.length>=boxed.length*.4;
    // A family of compact, similarly sized colored marks is a scatter series.
    const dots=boxed.filter(v=>v.path.length<base && v.box.w<=base && v.box.h<=base);
    const isScatter=isColored&&longest<minimumSpan&&dots.length>=4&&dots.length<1800;
    let kept=boxed.filter(v=>{
      if(opts.removeLegend!==false && legendSample(v.box,rgb,w,roi,bg))return false;
      if(isScatter)return true;
      if(v.path.length<(isDashed?4:base))return false;
      // With monochrome plots, compact letter strokes can otherwise become false curves.
      if(!isColored && !isDashed && Math.max(v.box.w,v.box.h)<minimumSpan)return false;
      return true;
    });
    if(!kept.length)return null;
    if(isScatter){
      const points=kept.map(v=>({px:(v.box.l+v.box.r)/2,py:(v.box.t+v.box.b)/2}));
      return [{paths:points.map(p=>[p]),points,style:'dotted'}];
    }
    kept.sort((a,b)=>a.box.l-b.box.l||a.box.t-b.box.t);
    const joinDistance=isDashed?clamp(base*1.4,7,17):clamp(Math.min(rw,rh)*.030,4,13);
    const clean=bridgePaths(kept.map(v=>v.path),joinDistance);
    if(!isColored && !isDashed && kept.every(v=>Math.max(v.box.w,v.box.h)<Math.min(rw,rh)*.14))return null;
    return distinguishTracks(clean,roi).map(paths=>{
      const style=isDashed && paths.filter(path=>path.length<=base*2).length>=3?'dashed':styleOf(paths);
      return {paths,points:paths.flat(),style};
    });
  }
  function extract(image,opts={}) {
    const w=Number(image&&image.width),h=Number(image&&image.height);
    if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||!image.data||image.data.length<w*h*4)throw new TypeError('需要有效的 RGBA 图像像素');
    if(w*h>2800000)return extractLarge(image,opts);
    const rgb=planes(image);
    const full={left:0,top:0,right:w-1,bottom:h-1},outerBg=background(rgb,w,full);
    const frame=opts.roi?{roi:boundedRect(opts.roi,w,h),method:'manual'}:detectFrame(rgb,w,h,outerBg);
    const r=frame.roi;
    if(r.right<=r.left||r.bottom<=r.top)throw new RangeError('绘图区宽度和高度均须大于零');
    const bg=background(rgb,w,r),excluded=new Uint8Array(w*h);
    markExcluded(excluded,w,h,opts.excludeRects);
    const removed=noiseLines(rgb,w,r,bg,excluded,opts);
    const minPixels=Math.max(3,Number(opts.minPixels)||Math.round(Math.min(r.right-r.left+1,r.bottom-r.top+1)*.09));
    const palette=(opts.palette||[]).map(v=>parseColor(v&&v.color||v)).filter(Boolean);
    const colors=palette.length?palette.map(c=>({...inkColor(...c,bg),rgb:c})):paletteFor(rgb,w,r,bg,excluded,minPixels);
    const classified=classify(rgb,w,r,bg,excluded,colors),series=[];
    const layer=new Uint8Array(classified.tags.length);
    for(let j=0;j<colors.length;j++){
      if(classified.freq[j]<minPixels)continue;
      for(let p=0;p<layer.length;p++)layer[p]=classified.tags[p]===j+1?1:0;
      const s=finalizeSeries(layer,colors[j],classified.pw,r,rgb,w,bg,opts,minPixels);
      if(!s)continue;
      for(const data of s){
        const n=series.length+1;
        series.push({id:'curve-'+n,name:'曲线 '+n,color:rgbHex(colors[j].rgb),...data});
      }
    }
    return {roi:r,background:rgbHex(bg),series,diagnostics:{roiMethod:frame.method,removedLines:removed,candidatePixels:classified.count,axisCalibration:'required'}};
  }
  function extractLarge(image,opts) {
    const {width:w,height:h,data}=image;
    const area=opts.roi?boundedRect(opts.roi,w,h):{left:0,top:0,right:w-1,bottom:h-1};
    const cw=area.right-area.left+1,ch=area.bottom-area.top+1;
    if(cw<3||ch<3)throw new RangeError('绘图区像素不足');
    const scale=Math.min(1,Math.sqrt(2400000/(cw*ch)));
    const rw=Math.max(3,Math.floor(cw*scale)),rh=Math.max(3,Math.floor(ch*scale));
    const reduced=new Uint8ClampedArray(rw*rh*4);
    const samples=[];
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      const xx=area.left+Math.floor((x+.5)*cw/32),yy=area.top+Math.floor((y+.5)*ch/32);
      const k=(yy*w+xx)*4,a=data[k+3]/255;
      samples.push(data[k]*a+255*(1-a),data[k+1]*a+255*(1-a),data[k+2]*a+255*(1-a));
    }
    const bg=background(samples,32,{left:0,right:31,top:0,bottom:31});
    // Select the clearest observed ink pixel within a bin. Nearest-neighbor downsampling
    // can entirely miss one-pixel curves in high-resolution scans.
    for(let yy=0;yy<rh;yy++){
      const top=area.top+Math.floor(yy*ch/rh),bottom=area.top+Math.floor((yy+1)*ch/rh);
      for(let xx=0;xx<rw;xx++){
        const left=area.left+Math.floor(xx*cw/rw),right=area.left+Math.floor((xx+1)*cw/rw);
        let best=-1,selected=(top*w+left)*4;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          const p=(y*w+x)*4,a=data[p+3]/255,white=255*(1-a);
          const d=Math.max(Math.abs(data[p]*a+white-bg[0]),Math.abs(data[p+1]*a+white-bg[1]),Math.abs(data[p+2]*a+white-bg[2]));
          if(d>best){best=d;selected=p;}
        }
        const k=4*(yy*rw+xx);for(let i=0;i<4;i++)reduced[k+i]=data[selected+i];
      }
    }
    const sx=(cw-1)/(rw-1),sy=(ch-1)/(rh-1);
    const boxes=(opts.excludeRects||[]).filter(q=>q.right>=area.left&&q.left<=area.right&&q.bottom>=area.top&&q.top<=area.bottom).map(q=>({left:(q.left-area.left)/sx,right:(q.right-area.left)/sx,top:(q.top-area.top)/sy,bottom:(q.bottom-area.top)/sy}));
    const sub=extract({width:rw,height:rh,data:reduced},{...opts,roi:opts.roi?{left:0,top:0,right:rw-1,bottom:rh-1}:undefined,excludeRects:boxes,minPixels:opts.minPixels?opts.minPixels*scale:undefined});
    const projectPixel=p=>({px:area.left+p.px*sx,py:area.top+p.py*sy});
    for(const s of sub.series){s.paths=s.paths.map(line=>line.map(projectPixel));s.points=s.paths.flat();}
    const r=sub.roi;
    sub.roi=opts.roi?area:boundedRect({left:area.left+r.left*sx,right:area.left+r.right*sx,top:area.top+r.top*sy,bottom:area.top+r.bottom*sy},w,h);
    sub.diagnostics.workingResolution={width:rw,height:rh};return sub;
  }
  function axisPair(axes,side) {
    if(!axes || !axes.x || !(side==='right'?axes.y2:axes.y))throw new RangeError('请先标定横轴及所选纵轴');
    return [axes.x,side==='right'?axes.y2:axes.y].map(a=>{
      const min=Number(a.min),max=Number(a.max),log=a.scale==='log'||a.scale==='log10';
      if(!Number.isFinite(min)||!Number.isFinite(max)||min===max||(log&&(min<=0||max<=0)))throw new RangeError('坐标范围无效；对数坐标的两个端点均须为正数');
      const start=log?Math.log(min):min,end=log?Math.log(max):max;
      return {start,end,log,reverse:!!a.reverse};
    });
  }
  function mapping(roi,axes,side) {
    const w=Number(roi.right)-Number(roi.left),h=Number(roi.bottom)-Number(roi.top);
    if(!(w>0&&h>0))throw new RangeError('坐标标定需要有效绘图区');
    const [ax,ay]=axisPair(axes,side);
    function value(t,a){
      const z=a.start+(a.reverse?1-t:t)*(a.end-a.start);
      return a.log?Math.exp(z):z;
    }
    function position(v,a){
      if(!Number.isFinite(v)||(a.log&&v<=0))throw new RangeError('数据点超出对数坐标的有效定义域');
      const t=((a.log?Math.log(v):v)-a.start)/(a.end-a.start);
      return a.reverse?1-t:t;
    }
    return {
      data(p){const px=Number(p.px),py=Number(p.py);if(!Number.isFinite(px)||!Number.isFinite(py))throw new RangeError('无效的像素点');
        return {...p,px,py,x:value((px-roi.left)/w,ax),y:value((roi.bottom-py)/h,ay)};},
      pixel(p){const x=Number(p.x),y=Number(p.y);return {...p,x,y,px:Number(roi.left)+w*position(x,ax),py:Number(roi.bottom)-h*position(y,ay)};}
    };
  }
  function calibrate(p,roi,axes,side='left'){return mapping(roi,axes,side).data(p);}
  function project(p,roi,axes,side='left'){return mapping(roi,axes,side).pixel(p);}
  function nearestPath(input) {
    if(input.length<3)return input.slice();
    const box=bounds(input),size=Math.max(1,Math.sqrt(box.w*box.h/input.length)*2);
    const grid=new Map();
    const cell=p=>[Math.floor((p.px-box.l)/size),Math.floor((p.py-box.t)/size)];
    const key=(x,y)=>x+','+y;
    const coords=input.map(cell);
    coords.forEach(([x,y],i)=>{const k=key(x,y);if(!grid.has(k))grid.set(k,new Set());grid.get(k).add(i);});
    const nx=Math.ceil(box.w/size),ny=Math.ceil(box.h/size);
    let idx=0;const result=[];
    while(result.length<input.length){
      const p=input[idx];result.push(p);
      const [x,y]=coords[idx],own=grid.get(key(x,y));own.delete(idx);if(!own.size)grid.delete(key(x,y));
      if(!grid.size)break;
      let best=-1,d2=Infinity;
      function inspect(cx,cy){
        const values=grid.get(key(cx,cy));if(!values)return;
        for(const j of values){const q=input[j],d=(p.px-q.px)**2+(p.py-q.py)**2;if(d<d2){d2=d;best=j;}}
      }
      const maxRadius=Math.max(nx,ny);
      for(let radius=0;radius<=maxRadius;radius++){
        if(radius===0)inspect(x,y);
        else{
          const xa=Math.max(0,x-radius),xb=Math.min(nx,x+radius),ya=Math.max(0,y-radius),yb=Math.min(ny,y+radius);
          if(y-radius>=0)for(let cx=xa;cx<=xb;cx++)inspect(cx,y-radius);
          if(y+radius<=ny)for(let cx=xa;cx<=xb;cx++)inspect(cx,y+radius);
          if(x-radius>=0)for(let cy=ya;cy<=yb;cy++)if(Math.abs(cy-y)!==radius)inspect(x-radius,cy);
          if(x+radius<=nx)for(let cy=ya;cy<=yb;cy++)if(Math.abs(cy-y)!==radius)inspect(x+radius,cy);
        }
        if(best>=0&&d2<=radius*radius*size*size)break;
      }
      if(best<0)throw new Error('最近邻排序未能定位下一个数据点');
      idx=best;
    }
    return result;
  }
  function process(points,roi,axes,options={}) {
    const cv=mapping(roi,axes,options.side||'left');
    let rows=Array.from(points||[],p=>Number.isFinite(p.px)&&Number.isFinite(p.py)?cv.data(p):cv.pixel(p));
    const order=options.order||'path',mode=options.mode||'raw';
    const orderKey={'x-asc':['x',1],'x-desc':['x',-1],'y-asc':['y',1],'y-desc':['y',-1]}[order];
    if(orderKey)rows.sort((a,b)=>(a[orderKey[0]]-b[orderKey[0]])*orderKey[1]);
    else if(order==='nearest')rows=nearestPath(rows);
    else if(order!=='path')throw new RangeError('不支持的曲线排序方式');
    if(mode==='raw'||rows.length<2)return rows;
    const amount=Number(options.value);
    if(!Number.isFinite(amount)||amount<=0)throw new RangeError('重采样数量或步长须为正数');
    if(mode!=='count'&&mode!=='step'&&mode!=='pixel')throw new RangeError('不支持的重采样方式');
    if(mode==='count'&&(!Number.isInteger(amount)||amount<2||amount>50000))throw new RangeError('目标点数应为 2 至 50000 的整数');
    // A physical step on a sorted axis is measured in that axis' units. Otherwise use arc length.
    const physical=mode==='step';
    const cumulative=[0],knots=[rows[0]];
    for(let i=1;i<rows.length;i++){
      const p=knots.at(-1),q=rows[i];
      const d=physical?(orderKey?Math.abs(q[orderKey[0]]-p[orderKey[0]]):Math.hypot(q.x-p.x,q.y-p.y)):Math.hypot(q.px-p.px,q.py-p.py);
      if(d>0){knots.push(q);cumulative.push(cumulative.at(-1)+d);}
    }
    if(knots.length<2)return [rows[0]];
    const total=cumulative.at(-1),step=mode==='count'?total/(amount-1):amount;
    if(total/step>50000)throw new RangeError('步长过小，单条曲线最多支持约五万个采样点');
    const samples=[],eps=total*1e-12;
    let idx=1;
    for(let j=0;j<50001;j++){
      const d=mode==='count'&&j===amount-1?total:j*step;
      if(d>=total-eps){samples.push({...knots.at(-1)});break;}
      while(idx<cumulative.length-1&&cumulative[idx]<d)idx++;
      const u=(d-cumulative[idx-1])/(cumulative[idx]-cumulative[idx-1]),p=knots[idx-1],q=knots[idx];
      if(physical)samples.push(cv.pixel({x:p.x+u*(q.x-p.x),y:p.y+u*(q.y-p.y)}));
      else samples.push(cv.data({px:p.px+u*(q.px-p.px),py:p.py+u*(q.py-p.py)}));
    }
    return samples;
  }
  const api={extract,calibrate,project,process};
  global.CurveEngine=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
