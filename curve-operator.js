'use strict';
(() => {
  const isNumber = Number.isFinite;
  function axisFromOCR(a) {
    if (!a || a.status!=='candidate' || ![a.start,a.end].every(isNumber) || a.start===a.end) return null;
    return {min:Math.min(a.start,a.end),max:Math.max(a.start,a.end),reverse:a.end<a.start,scale:a.scale,label:a.label||''};
  }
  function extract(image, ocr, filename){
    const first=CurveEngine.extract(image,{});
    const {left,top,right,bottom}=first.roi;
    const box={x:left,y:top,width:right-left,height:bottom-top};
    
    const labels=CurveLabels.analyze(image,{roi:box,lines:ocr.lines||[],series:first.series});
    const axes={x:axisFromOCR(labels.axes.x),y:axisFromOCR(labels.axes.y)};
    const rightAxis=axisFromOCR(labels.axes.y2);
    if(rightAxis)axes.y2=rightAxis;
    const excluded=labels.legendBoxes.map(r=>({left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height}));
    const extracted=excluded.length?CurveEngine.extract(image,{roi:first.roi,excludeRects:excluded}):first;
    const series=extracted.series.map(s=>{
      const legend=labels.legends.find(l=>first.series.find(t=>t.id===l.seriesId)?.color===s.color);
      // Without an explicit series-to-axis association, dual-axis values need review.
      const points=s.points.map(p=>axes.x&&axes.y&&!rightAxis?{...p,...CurveEngine.calibrate(p,first.roi,axes)}:{px:p.px,py:p.py});
      return {id:s.id,name:legend?.name||'',color:s.color,style:legend?.style||'',points};
    });
    return {filename,width:image.width,height:image.height,roi:first.roi,axes,series,warnings:[ocr.warning,...labels.warnings,rightAxis?'识读到双纵轴，请在工作台将曲线分配至左轴或右轴后导出物理坐标。':''].filter(Boolean)};
  }
  globalThis.CurveOperator = {extract};
})();
