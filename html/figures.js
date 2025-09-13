
// ===== equations =====
function nFromP(C, p){ const c=C/100; return Math.ceil(Math.log(1-c)/Math.log(1-p)); }
function pFromN(C, n){ const c=C/100; return 1 - Math.exp(Math.log(1-c)/n); }
function nForAtLeastO(C, p, O, nMax=2000){
  const target = 1 - C/100;
  for (let n=O; n<=nMax; n++){
    let pmf = Math.pow(1-p, n), cdf = pmf;   // k=0
    for (let k=0; k<O-1; k++){
      pmf = pmf * (n-k)/(k+1) * (p/(1-p));   // recurrence
      cdf += pmf;
    }
    if (cdf <= target) return n;
  }
  return NaN;
}

// ===== log helpers & tickers =====
const log10 = x => Math.log(x)/Math.LN10;
const pow10 = x => Math.pow(10, x);

// log ticks
const pTicks = [0.01,0.02,0.05,0.1,0.2,0.4];
const nTicks = [1,3,6,10,20,30,60,100,200,300];

function logTickerFromValues(vals){
  return function(min, max){
    return vals
      .map(v => ({ v: Math.log(v)/Math.LN10, label: (v>=1? String(Math.round(v)) : v.toString()) }))
      .filter(t => t.v >= min-1e-9 && t.v <= max+1e-9);
  };
}
const logAxisFormat = v => {
  const real = Math.pow(10, v);
  return (real >= 1) ? String(Math.round(real)) : real.toPrecision(real < 0.1 ? 2 : 2);
};

// generic renderer where you provide the tick lists per axis
function renderLogLog(el, csv, xlabel, ylabel, xTickVals, yTickVals) {
  return new Dygraph(el, csv, {
    legend: 'always',
    labelsSeparateLines: true,
    axes: {
      x: { ticker: logTickerFromValues(xTickVals), axisLabelFormatter: logAxisFormat, valueFormatter: logAxisFormat },
      y: { ticker: logTickerFromValues(yTickVals), axisLabelFormatter: logAxisFormat, valueFormatter: logAxisFormat }
    },
    drawGrid: true,
    xlabel, ylabel
  });
}
function makeLegendFormatter(xLabel, xFormatFn) {
  return function legendFormatter(data) {
    // No hover → stacked series labels only (so the non-hover legend is visible)
    if (data.x == null) {
      return data.series.map(s =>
        `<div><span style="color:${s.color};font-weight:bold;">■</span> ${s.labelHTML}</div>`
      ).join('');
    }
    // Hover → first line is the x coordinate, then per-series lines with values
    const xLine = `<div><strong>${xLabel}:</strong> ${xFormatFn(data.x)}</div>`;
    const rows = data.series
      .filter(s => s.y != null)
      .map(s =>
        `<div><span style="color:${s.color};font-weight:bold;">■</span> ${s.labelHTML}: ${s.yHTML}</div>`
      );
    return [xLine, ...rows].join('');
  };
}

function multilineLegendFormatter(data) {
  // When not hovering, show labels only (stacked, wrapped by CSS)
  if (data.x == null) {
    return data.series.map(s =>
      `<div><span style="color:${s.color};font-weight:bold;">■</span> ${s.labelHTML}</div>`
    ).join('');
  }
  // On hover, show current values per series
  const rows = data.series
    .filter(s => s.y != null)
    .map(s =>
      `<div><span style="color:${s.color};font-weight:bold;">■</span> ${s.labelHTML}: ${s.yHTML}</div>`
    );
  return rows.join('');
}
function asCSV(labels, rows){
  const fmt = x => (Number.isFinite(x) ? x : '');
  return [labels.join(','), ...rows.map(r => r.map(fmt).join(','))].join('\n');
}


// ===== data builders =====
function buildFig1Multi(confList=[90,95,99], pMin=0.01, pMax=0.40, step=0.002){
  const labels = ['log10(p)', ...confList.map(c=>`C=${c}%`)];
  const rows = [];
  for (let p=pMin; p<=pMax+1e-12; p+=step){
    const ns = confList.map(c => nFromP(c, p));
    rows.push([log10(p), ...ns.map(n => n>0 ? log10(n) : NaN)]);
  }
  return {labels, rows};
}

function buildFig2Multi(confList=[90,95,99], nMin=1, nMax=300){
  const labels = ['log10(n)', ...confList.map(c=>`C=${c}%`)];
  const rows = [];
  for (let n=nMin; n<=nMax; n++){
    const ps = confList.map(c => pFromN(c, n));
    rows.push([log10(n), ...ps.map(p => (p>0 ? log10(p) : NaN))]);
  }
  return {labels, rows};
}

function buildFig3_O123_C95(pMin=0.01, pMax=0.40, step=0.002){
  const C = 95;
  const Ovals = [1,2,3];
  const labels = ['log10(p)', 'O=1', 'O=2', 'O=3']; // <- only O labels
  const rows = [];
  for (let p=pMin; p<=pMax+1e-12; p+=step){
    const n1 = nFromP(C,p);
    const n2 = nForAtLeastO(C,p,2,2000);
    const n3 = nForAtLeastO(C,p,3,2000);
    rows.push([log10(p),
      n1>0 ? log10(n1) : NaN,
      n2>0 ? log10(n2) : NaN,
      n3>0 ? log10(n3) : NaN
    ]);
  }
  return {labels, rows};
}

// ===== SVG export (vector) =====
// We rebuild a tidy line-chart SVG from the plotted data and dygraph ranges.
function download(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'image/svg+xml'}));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}

function downloadFile(filename, blob){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

/**
 * Build a *padded* SVG from a Dygraph (axes, ticks, grid, series, titles, legend)
 * Padding & titleGap affect exports only; on-screen chart is unchanged.
 *
 * @param {Dygraph} g
 * @param {{padding?:{top:number,right:number,bottom:number,left:number}, titleGap?:number}} opts
 * @returns {{svg: string, width: number, height: number}}
 */
// function buildDygraphSVG(g, opts = {}){
//   // const PAD = Object.assign({top: 10, right: 28, bottom: 38, left: 800}, opts.padding || {});
//   const PAD = Object.assign({top: 10, right: 28, bottom: 38, left: 38}, opts.padding || {});
//   const TITLE_GAP = (typeof opts.titleGap === 'number') ? opts.titleGap : 10;
//
//   // Base geometry from live chart
//   const baseArea = g.getArea();      // live plotting rect (inside canvas)
//   const baseW = g.width_, baseH = g.height_;
//
//   // Output canvas is padded around the whole chart
//   const OUT_W = baseW + PAD.left + PAD.right;
//   const OUT_H = baseH + PAD.top  + PAD.bottom;
//
//   // Shift the plotting rect by padding
//   // const area = {
//   //   x: baseArea.x + PAD.left,
//   //   y: baseArea.y + PAD.top,
//   //   w: baseArea.w,
//   //   h: baseArea.h
//   // };
//   const area = {
//     x: PAD.left,
//     y: PAD.top,
//     w: baseArea.w,
//     h: baseArea.h
//   };
//   // Ranges (log space)
//   const [xmin, xmax] = g.xAxisRange();
//   const [ymin, ymax] = g.yAxisRange();
//   const toX = xv => area.x + ((xv - xmin) / (xmax - xmin)) * area.w;
//   const toY = yv => area.y + area.h - ((yv - ymin) / (ymax - ymin)) * area.h;
//
//   // Fonts from page so SVG matches on-screen typography
//   const host = g.maindiv_ || g.graphDiv || (g.canvas_ && g.canvas_.parentNode) || document.body;
//   const cs = window.getComputedStyle(host);
//   const fontFamily = (cs.fontFamily && cs.fontFamily.trim()) ||
//     "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
//   const fontSizePx = parseFloat(cs.fontSize) || 13;
//   const TICK_FS  = Math.round(fontSizePx);
//   const TITLE_FS = Math.round(fontSizePx * 1.1);
//   const ffCSS = fontFamily.replace(/"/g, "'");
//
//   // Ticks & grid (use current tickers)
//   const ax = g.getOption('axes') || {};
//   const xTicker = ax.x && typeof ax.x.ticker === 'function' ? ax.x.ticker : (()=>[]);
//   const yTicker = ax.y && typeof ax.y.ticker === 'function' ? ax.y.ticker : (()=>[]);
//   const xticks = xTicker(xmin, xmax);
//   const yticks = yTicker(ymin, ymax);
//
//   const gridSVG = [
//     ...xticks.map(t => `<line x1="${toX(t.v)}" y1="${area.y}" x2="${toX(t.v)}" y2="${area.y+area.h}" stroke="#e9ecef"/>`),
//     ...yticks.map(t => `<line x1="${area.x}" y1="${toY(t.v)}" x2="${area.x+area.w}" y2="${toY(t.v)}" stroke="#e9ecef"/>`)
//   ].join('');
//
//   // Series paths + point markers respecting per-series styles
//   const labels = g.getLabels();
//   const colors = g.getColors();
//   const vis    = g.visibility();
//   const sets   = (g.layout_ && g.layout_.points) ? g.layout_.points : [];
//
//   function seriesToSVG() {
//     const pieces = [];
//
//     // Offsets to convert Dygraphs canvas coords → our SVG coords
//     const cx0 = baseArea.x;  // inner-plot origin in the live canvas
//     const cy0 = baseArea.y;
//
//     function toCX(canvasx) { return area.x + (canvasx - cx0); }
//     function toCY(canvasy) { return area.y + (canvasy - cy0); }
//
//     for (let s = 1; s < labels.length; s++) {
//       if (!vis[s - 1]) continue;
//
//       const seriesName  = labels[s];
//       const color       = colors[s - 1];
//
//       // Per-series options with global fallbacks (and sane defaults)
//       let strokeWidth = g.getOption('strokeWidth', seriesName);
//       if (!Number.isFinite(strokeWidth)) strokeWidth = g.getOption('strokeWidth');
//       if (!Number.isFinite(strokeWidth)) strokeWidth = 0;
//
//       let drawPoints = g.getOption('drawPoints', seriesName);
//       if (typeof drawPoints !== 'boolean') drawPoints = !!g.getOption('drawPoints');
//
//       let pointSize = g.getOption('pointSize', seriesName);
//       if (!Number.isFinite(pointSize)) pointSize = g.getOption('pointSize');
//       if (!Number.isFinite(pointSize)) pointSize = 2; // safe default if unset
//
//       const pts = sets[s - 1] || [];
//       const seg = [];
//
//       // 1) Line path (only if strokeWidth > 0)
//       if (strokeWidth > 0) {
//         let started = false;
//         let d = '';
//         for (const p of pts) {
//           if (p.canvasy == null || !Number.isFinite(p.canvasy)) continue;
//           const X = toCX(p.canvasx);
//           const Y = toCY(p.canvasy);
//           if (!started) { d += `M ${X} ${Y}`; started = true; }
//           else          { d += ` L ${X} ${Y}`; }
//         }
//         if (started) {
//           seg.push(
//             `<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`
//           );
//         }
//       }
//
//       // 2) Dots (only if drawPoints)
//       if (drawPoints && pointSize > 0) {
//         for (const p of pts) {
//           if (p.canvasy == null || !Number.isFinite(p.canvasy)) continue;
//           const X = toCX(p.canvasx);
//           const Y = toCY(p.canvasy);
//           seg.push(`<circle cx="${X}" cy="${Y}" r="${pointSize}" fill="${color}" />`);
//         }
//       }
//
//       pieces.push(seg.join(''));
//     }
//
//     return pieces.join('\n');
//   }
//   const seriesSVG = seriesToSVG();
//
//   // Tick marks + tick labels
//   function ticksSVG(ticks, isX){
//     return ticks.map(t=>{
//       const pos = isX ? toX(t.v) : toY(t.v);
//       const x1 = isX ? pos : area.x - 8, y1 = isX ? area.y + area.h : pos;
//       const x2 = isX ? pos : area.x,     y2 = isX ? area.y + area.h + 6 : pos;
//       const tx = isX ? pos : area.x - 12,
//             ty = isX ? area.y + area.h + 22 : pos + 4;
//       return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888"/>
//               <text x="${tx}" y="${ty}" font-size="${TICK_FS}" text-anchor="${isX?'middle':'end'}" fill="#333">${t.label}</text>`;
//     }).join('');
//   }
//
//   // measure tick label widths in the export font
//   const measCanvas = document.createElement('canvas');
//   const mctx = measCanvas.getContext('2d');
//   mctx.font = `${TICK_FS}px ${ffCSS}`;
//
//   const maxTickW = Math.max(0, ...yticks.map(t => mctx.measureText(t.label).width));
//   // put y-axis title just left of the widest tick, with 12px gap
//   // const yTitleX = area.x - maxTickW - 12;
//   // keep the title just left of the widest tick, but never off-canvas
//   const yTitleX = Math.max(12, area.x - maxTickW - 12);
//
//   // Axis titles
//   const xlabel = g.getOption('xlabel') || '';
//   const ylabel = g.getOption('ylabel') || '';
//   const axisTitles = `
//     <text class="axis-title" x="${area.x + area.w/2}" y="${OUT_H - Math.max(10, PAD.bottom - TITLE_GAP)}"
//           font-size="${TITLE_FS}" text-anchor="middle" fill="#333">${xlabel}</text>
//     <text class="axis-title" x="${yTitleX}" y="${area.y + area.h/2}"
//           font-size="${TITLE_FS}" text-anchor="middle" fill="#333"
//           transform="rotate(-90,${yTitleX},${area.y + area.h/2})">${ylabel}</text>
//   `;
//   // Compact legend in top-right
//   const legendItems = [];
//   for (let s = 1; s < labels.length; s++) {
//     if (vis[s-1]) legendItems.push({ name: labels[s], color: colors[s-1] });
//   }
//
//   // const measCanvas = document.createElement('canvas');
//   // const mctx = measCanvas.getContext('2d');
//   // mctx.font = `${TICK_FS}px ${ffCSS}`;
//
//   const rx = area.x + area.w - 12;
//   const top = area.y + 12;
//   const gapY = 16;
//   const sw = 18;
//   const swTextGap = 10;
//
//   const legendSVG = legendItems.map((it, i) => {
//     const y = top + i * gapY;
//     const w = Math.ceil(mctx.measureText(it.name).width);
//     const textRight = rx;
//     const textLeft  = rx - w;
//     const swR = textLeft - swTextGap;
//     const swL = swR - sw;
//     return `
//       <line x1="${swL}" y1="${y}" x2="${swR}" y2="${y}"
//             stroke="${it.color}" stroke-width="3"/>
//       <text x="${textRight}" y="${y+4}" font-size="${TICK_FS}"
//             text-anchor="end" fill="#333">${it.name}</text>
//     `;
//   }).join('');
//
//   const svg = `<?xml version="1.0" encoding="UTF-8"?>
// <svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">
//   <defs>
//     <style type="text/css"><![CDATA[
//       text { font-family: ${ffCSS}; font-size: ${TICK_FS}px; text-rendering: optimizeLegibility; }
//       path, line { shape-rendering: crispEdges; }
//     ]]></style>
//   </defs>
//   <rect width="100%" height="100%" fill="white"/>
//   <rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="#888"/>
//   ${gridSVG}
//   ${ticksSVG(xticks, true)}
//   ${ticksSVG(yticks, false)}
//   ${seriesSVG}   <!-- was seriesSVG.join('\\n') -->
//   ${axisTitles}
//   ${legendSVG}
// </svg>`;
//
//   return { svg, width: OUT_W, height: OUT_H };
// }
function buildDygraphSVG(g, opts = {}){
  const PAD = Object.assign({top: 10, right: 28, bottom: 38, left: 38}, opts.padding || {});
  const TITLE_GAP = (typeof opts.titleGap === 'number') ? opts.titleGap : 10;

  // Base geometry from live chart
  const baseArea = g.getArea();      // inner plotting rect (canvas)
  const baseW = g.width_, baseH = g.height_;

  // Fonts (match on-screen)
  const host = g.maindiv_ || g.graphDiv || (g.canvas_ && g.canvas_.parentNode) || document.body;
  const cs = window.getComputedStyle(host);
  const fontFamily = (cs.fontFamily && cs.fontFamily.trim()) ||
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const fontSizePx = parseFloat(cs.fontSize) || 13;
  const TICK_FS  = Math.round(fontSizePx);
  const TITLE_FS = Math.round(fontSizePx * 1.1);
  const ffCSS = fontFamily.replace(/"/g, "'");

  // Axis ranges (data space)
  const [xmin, xmax] = g.xAxisRange();
  const [ymin, ymax] = g.yAxisRange();

  // Current tickers → ticks (do this BEFORE laying out area)
  const ax = g.getOption('axes') || {};
  const xTicker = ax.x && typeof ax.x.ticker === 'function' ? ax.x.ticker : (()=>[]);
  const yTicker = ax.y && typeof ax.y.ticker === 'function' ? ax.y.ticker : (()=>[]);
  const xticks = xTicker(xmin, xmax);
  const yticks = yTicker(ymin, ymax);

  // Measure widest y-tick for left margin calculation
  const measCanvas = document.createElement('canvas');
  const mctx = measCanvas.getContext('2d');
  mctx.font = `${TICK_FS}px ${ffCSS}`;
  const maxTickW = Math.max(0, ...yticks.map(t => mctx.measureText(t.label).width));

  // Required left margin: tick width + tick/text gap (12) + tick mark (~6)
  const Y_TITLE_GAP = 16; // px separation between tick labels and y-axis title
  const LEFT_NEEDED = Math.ceil(maxTickW + 12 /*tick gap*/ + 6 /*tick mark*/ + Y_TITLE_GAP);
  const LEFT_PAD    = Math.max(PAD.left, LEFT_NEEDED);

  // Output canvas size with adjusted left margin
  const OUT_W = baseW + LEFT_PAD + PAD.right;
  const OUT_H = baseH + PAD.top  + PAD.bottom;

  // Plotting area anchored at our padding origin
  const area = {
    x: LEFT_PAD,
    y: PAD.top,
    w: baseArea.w,
    h: baseArea.h
  };
  const TICK_TEXT_X = area.x - 12;            // where tick labels are right-anchored
  //const yTitleX     = TICK_TEXT_X - Y_TITLE_GAP;  // push title left by the gap


  // Data→SVG coordinate transforms
  const toX = xv => area.x + ((xv - xmin) / (xmax - xmin)) * area.w;
  const toY = yv => area.y + area.h - ((yv - ymin) / (ymax - ymin)) * area.h;

  // Grid lines
  const gridSVG = [
    ...xticks.map(t => `<line x1="${toX(t.v)}" y1="${area.y}" x2="${toX(t.v)}" y2="${area.y+area.h}" stroke="#e9ecef"/>`),
    ...yticks.map(t => `<line x1="${area.x}" y1="${toY(t.v)}" x2="${area.x+area.w}" y2="${toY(t.v)}" stroke="#e9ecef"/>`)
  ].join('');

  // Series (lines & dots) — use Dygraphs' canvas coords to avoid scaling quirks
  const labels = g.getLabels();
  const colors = g.getColors();
  const vis    = g.visibility();
  const sets   = (g.layout_ && g.layout_.points) ? g.layout_.points : [];

  function seriesToSVG() {
    const pieces = [];
    // offsets: canvas → our SVG
    const cx0 = baseArea.x, cy0 = baseArea.y;
    const toCX = canvasx => area.x + (canvasx - cx0);
    const toCY = canvasy => area.y + (canvasy - cy0);

    for (let s = 1; s < labels.length; s++) {
      if (!vis[s - 1]) continue;

      const seriesName  = labels[s];
      const color       = colors[s - 1];

      let strokeWidth = g.getOption('strokeWidth', seriesName);
      if (!Number.isFinite(strokeWidth)) strokeWidth = g.getOption('strokeWidth');
      if (!Number.isFinite(strokeWidth)) strokeWidth = 0;

      let drawPoints = g.getOption('drawPoints', seriesName);
      if (typeof drawPoints !== 'boolean') drawPoints = !!g.getOption('drawPoints');

      let pointSize = g.getOption('pointSize', seriesName);
      if (!Number.isFinite(pointSize)) pointSize = g.getOption('pointSize');
      if (!Number.isFinite(pointSize)) pointSize = 2;

      const pts = sets[s - 1] || [];
      const seg = [];

      // Path (only if strokeWidth > 0)
      if (strokeWidth > 0) {
        let d = '', started = false;
        for (const p of pts) {
          if (p.canvasy == null || !Number.isFinite(p.canvasy)) continue;
          const X = toCX(p.canvasx), Y = toCY(p.canvasy);
          if (!started) { d += `M ${X} ${Y}`; started = true; }
          else          { d += ` L ${X} ${Y}`; }
        }
        if (started) seg.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`);
      }

      // ================================================================
      // Custom Bars
      // ================================================================

      // --- shaded band for the theory series using DATA triples (robust) ---
      const customBarsOn = !!g.getOption('customBars');
      let fillAlpha = g.getOption('fillAlpha', seriesName);
      if (!Number.isFinite(fillAlpha)) fillAlpha = g.getOption('fillAlpha') ?? 0.18; // a bit stronger

      if (customBarsOn && fillAlpha > 0 && seriesName === 'Th R (R±SE)') {
        const labels = g.getLabels();
        const sIdx = labels.indexOf(seriesName);
        const rowCount = g.numRows ? g.numRows() : 0;

        const tops = [], bots = [];
        for (let r = 0; r < rowCount; r++) {
          // idx 0 = x (log10(n)); sIdx = [lo, mid, hi]
          const xData = g.getValue(r, 0);
          const yBar  = g.getValue(r, sIdx);
          if (!Array.isArray(yBar) || yBar.length < 3 || !Number.isFinite(xData)) continue;
          const [lo, , hi] = yBar;
          tops.push(`${toX(xData)} ${toY(hi)}`);
          bots.push(`${toX(xData)} ${toY(lo)}`);
        }

        if (tops.length > 1) {
          const poly = tops.join(' L ') + ' L ' + bots.reverse().join(' L ');
          // draw band *under* the line for this series
          seg.unshift(`<path d="M ${poly} Z" fill="${color}" fill-opacity="${fillAlpha}" stroke="none"/>`);
        }
      }

      // ================================================================
      // end Custom Bars
      // ================================================================


      // Dots (only if drawPoints)
      if (drawPoints && pointSize > 0) {
        for (const p of pts) {
          if (p.canvasy == null || !Number.isFinite(p.canvasy)) continue;
          const X = toCX(p.canvasx), Y = toCY(p.canvasy);
          seg.push(`<circle cx="${X}" cy="${Y}" r="${pointSize}" fill="${color}" />`);
        }
      }

      pieces.push(seg.join(''));
    }
    return pieces.join('\n');
  }
  const seriesSVG = seriesToSVG();

  // Ticks + tick labels
  function ticksSVG(ticks, isX){
    return ticks.map(t=>{
      const pos = isX ? toX(t.v) : toY(t.v);
      const x1 = isX ? pos : area.x - 8, y1 = isX ? area.y + area.h : pos;
      const x2 = isX ? pos : area.x,     y2 = isX ? area.y + area.h + 6 : pos;
      const tx = isX ? pos : area.x - 12,
            ty = isX ? area.y + area.h + 22 : pos + 4;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888"/>
              <text x="${tx}" y="${ty}" font-size="${TICK_FS}" text-anchor="${isX?'middle':'end'}" fill="#333">${t.label}</text>`;
    }).join('');
  }

  // Axis titles (y-title sits 12px left of the tick labels, guaranteed in-frame)
  const xlabel = g.getOption('xlabel') || '';
  const ylabel = g.getOption('ylabel') || '';
  const yTitleX = area.x - maxTickW - 20;

  const axisTitles = `
    <text class="axis-title" x="${area.x + area.w/2}" y="${OUT_H - Math.max(10, PAD.bottom - TITLE_GAP)}"
          font-size="${TITLE_FS}" text-anchor="middle" fill="#333">${xlabel}</text>
    <text class="axis-title" x="${yTitleX}" y="${area.y + area.h/2}"
          font-size="${TITLE_FS}" text-anchor="middle" fill="#333"
          transform="rotate(-90,${yTitleX},${area.y + area.h/2})">${ylabel}</text>
  `;
  // Legend (compact, right aligned)
  const legendItems = [];
  for (let s = 1; s < labels.length; s++) if (vis[s-1]) legendItems.push({ name: labels[s], color: colors[s-1] });

  const rx = area.x + area.w - 12;
  const top = area.y + 12;
  const gapY = 16, sw = 18, swTextGap = 10;

  const legendSVG = legendItems.map((it, i) => {
    const y = top + i * gapY;
    const w = Math.ceil(mctx.measureText(it.name).width);
    const textRight = rx, textLeft = rx - w;
    const swR = textLeft - swTextGap, swL = swR - sw;
    return `
      <line x1="${swL}" y1="${y}" x2="${swR}" y2="${y}" stroke="${it.color}" stroke-width="3"/>
      <text x="${textRight}" y="${y+4}" font-size="${TICK_FS}" text-anchor="end" fill="#333">${it.name}</text>
    `;
  }).join('');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${OUT_W}" height="${OUT_H}" viewBox="0 0 ${OUT_W} ${OUT_H}">
  <defs>
    <style type="text/css"><![CDATA[
      text { font-family: ${ffCSS}; font-size: ${TICK_FS}px; text-rendering: optimizeLegibility; }
      path, line { shape-rendering: crispEdges; }
    ]]></style>
  </defs>
  <rect width="100%" height="100%" fill="white"/>
  <rect x="${area.x}" y="${area.y}" width="${area.w}" height="${area.h}" fill="none" stroke="#888"/>
  ${gridSVG}
  ${ticksSVG(xticks, true)}
  ${ticksSVG(yticks, false)}
  ${seriesSVG}
  ${axisTitles}
  ${legendSVG}
</svg>`;

  return { svg, width: OUT_W, height: OUT_H };
}
function exportDygraphToSVG(g, filename){
  const { svg } = buildDygraphSVG(g, {
    padding: { top: 12, right: 34, bottom: 44, left: 44 }, // generous margins
    titleGap: 12
  });
  downloadFile(filename, new Blob([svg], {type:'image/svg+xml'}));
}

function exportDygraphToPNG(g, filename, scale=3){
  const { svg, width, height } = buildDygraphSVG(g, {
    padding: { top: 12, right: 34, bottom: 44, left: 44 },
    titleGap: 12
  });
  const blob = new Blob([svg], {type:'image/svg+xml'});
  const url  = URL.createObjectURL(blob);

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(width  * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob)=>{
      downloadFile(filename, pngBlob);
    }, 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); };
  img.src = url;
}

// ===================== Monte Carlo (finite-population) — stand-alone figs ======================
// Empirical quantile (C in percent, e.g., 95) on a numeric array (no NaNs)
function quantile(arr, C){
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x,y)=>x-y);
  const p = Math.min(1, Math.max(0, C/100));
  const idx = Math.max(0, Math.ceil(p * a.length) - 1);
  return a[idx];
}

// Coverage at (n, p) using finite-population multiverse
function coverageAt_n_p(n, p, E, POP){
  let ok = 0;
  for (let e=0; e<E; e++){
    const carriers = mcBuildCarriers(POP, p);
    const order = new Uint32Array(POP);
    for (let i=0;i<POP;i++) order[i]=i;
    mcShuffle(order);
    // count until n (early break on first hit)
    let hit = 0;
    const lim = Math.min(n, POP);
    for (let i=0;i<lim; i++){
      if (carriers[ order[i] ]) { hit = 1; break; }
    }
    if (hit) ok++;
  }
  return ok / E; // empirical Pr(≥1 by n)
}

// Find empirical minimal n for given (p, C) by bracketing around theory n*
function empirical_n_from_p_S1(p, C, opts){
  const { POP, E, NMAX } = opts;
  const target = C/100;
  let nTheory = nFromP(C, p);
  if (!Number.isFinite(nTheory) || nTheory < 1) nTheory = 1;

  let lo = 1;
  let hi = Math.min(NMAX, Math.max(3, Math.ceil(nTheory)));
  let cov = coverageAt_n_p(hi, p, E, POP);
  while (cov < target && hi < NMAX){
    lo = hi + 1;
    hi = Math.min(NMAX, Math.ceil(hi * 2));
    cov = coverageAt_n_p(hi, p, E, POP);
  }
  if (cov < target) return NaN;

  while (lo < hi){
    const mid = Math.floor((lo + hi) / 2);
    const c = coverageAt_n_p(mid, p, E, POP);
    if (c >= target) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// Pretty formatters to show *values* on log axes
function fmtPow10(x){
  const v = Math.pow(10, x);
  if (v >= 1000) return Math.round(v).toString();
  if (v >= 1)    return v.toFixed(0);
  if (v >= 0.1)  return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

// Minimum n to reach >= O successes for a given carriers+order (no rebuilds)
function minN_for_O_givenOrder(carriers, order, O, NMAX){
  const POP = carriers.length;
  let hits = 0;
  const lim = Math.min(NMAX, POP);
  for (let n = 1; n <= lim; n++){
    hits += carriers[ order[n-1] ];
    if (hits >= O) return n;
  }
  return NaN; // not reached
}
const NUMERIC_X_OPTS = {
  // Force numeric X (no date parsing)
  xValueParser: function(x) { return parseFloat(x); },
  axes: {
    x: {
      valueFormatter: function(x){ return x.toFixed(3); },   // tooltip
      //axisLabelFormatter: function(x){ return x.toFixed(1); } // axis ticks
    },
    y: {
      valueFormatter: function(y){ return y.toFixed(3); },
      //axisLabelFormatter: function(y){ return y.toFixed(1); }
    }
  }
};
function initDygraphNumeric(el, labels, csvOrRows, extraOpts={}) {
  // Make a stub row with the correct column count
  const stub = makeStub(labels); // from snippet above
  const opts = Object.assign({ labels }, NUMERIC_X_OPTS, extraOpts);
  const g = new Dygraph(el, stub, opts);

  // If you’re passing CSV, ensure it includes a header OR pass labels here too
  if (typeof csvOrRows === 'string') {
    g.updateOptions({ file: csvOrRows, labels });  // CSV path
  } else {
    // rows array-of-arrays: make sure x is numeric
    const rows = csvOrRows.map(r => [ +r[0], ...r.slice(1) ]);
    g.updateOptions({ file: rows, labels });
  }
  return g;
}
function makeStub(labels) {
  // one row; x=0, all y=0; column count == labels.length
  const row = [0];
  for (let i = 1; i < labels.length; i++) row.push(0);
  return [row];
}
// Sanitize rows: numeric x, null for non-finite y’s (Dygraphs will skip those points)
function sanitizeRows(rows) {
  return rows.map(r => {
    const x = +r[0];
    const y = r.slice(1).map(v => (Number.isFinite(v) ? v : null));
    return [x, ...y];
  });
}
const MC = {
  POP: 1000,     // population size per experiment
  E:  1000,       // experiments per grid point
  STEP_P: 0.01,   // coarse p grid (fast, good enough for overlays)
  NMAX: 2000,     // cap n search
  CONF_LIST: [90,95,99],
  O_LIST: [1,2,3],
};
const C_COLORS = {
  "90":  "#2ca02c", // green
  "95":  "#ff00ff", // magenta
  "99":  "#17becf"  // cyan
};

// fast shuffle
function mcShuffle(a){
  for (let i=a.length-1;i>0;i--){
    const j = (Math.random()*(i+1))|0;
    const t=a[i]; a[i]=a[j]; a[j]=t;
  }
  return a;
}

// build carrier flags for a theme with true population frequency p
function mcBuildCarriers(POP, p){
  const k = Math.max(0, Math.min(POP, Math.floor(p*POP)));
  const order = new Uint32Array(POP);
  for (let i=0;i<POP;i++) order[i]=i;
  mcShuffle(order);
  const carriers = new Uint8Array(POP);
  for (let i=0;i<k;i++) carriers[ order[i] ] = 1;
  return carriers;
}

// minimum n to get >= O successes in a random sample order
function mcMinNforAtLeastO_oneExp(carriers, O, NMAX){
  const POP = carriers.length;
  const order = new Uint32Array(POP);
  for (let i=0;i<POP;i++) order[i]=i;
  mcShuffle(order);
  let hits = 0;
  for (let n=1;n<=Math.min(NMAX, POP);n++){
    hits += carriers[ order[n-1] ];
    if (hits >= O) return n;
  }
  return NaN;
}
// S1/S2 — color & point/line style by C (expects labels like "MC C=90%" / "Th C=90%")
// S1/S2 — MC dots + Th lines; colors by C using your C_COLORS map
function stylesForS1(labels){
  const colors = [];
  const seriesOpts = {};
  labels.slice(1).forEach(lab => {
    // robust parse: accept "MC C=90%" or "MC  C=90%" etc.
    const isMC = lab.startsWith('MC ');
    const isTh = lab.startsWith('Th ');
    const m = lab.match(/C=(\d+)%/);
    const C = m ? m[1] : null;
    const color = (C && C_COLORS[C]) ? C_COLORS[C] : '#888';

    colors.push(color);
    seriesOpts[lab] = {
      drawPoints: !!isMC,
      pointSize:  isMC ? 3 : 0,
      strokeWidth: isTh ? 2 : 0,
      highlightCircleSize: 4
    };
  });
  return { colors, seriesOpts };
}
function showLoading(chartId, text){
  const el = document.getElementById(chartId + '-loading');
  if (!el) return;
  if (text) el.textContent = text;
  el.classList.remove('hidden');
  el.style.display = 'flex';
}

function hideLoading(chartId){
  const el = document.getElementById(chartId + '-loading');
  if (!el) return;
  // let the fade finish; then fully remove so exports capture cleanly
  el.classList.add('hidden');
  setTimeout(() => { el.style.display = 'none'; }, 200);
}
// yield to the browser so it can paint (and keep UI responsive)
function tick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}
// ===================== FIG 1 (MC): n from p, C ======================
// ---- Fig 1 / S1 (x = p, y = n), both log-10 axes ----
const X1_TICKS_P  = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4];
const Y1_TICKS_N  = [6, 10, 20, 30, 60, 100, 200, 300, 600];

const X1_RANGE_LOG = [log10(0.01), log10(0.401)];
const Y1_RANGE_LOG = [log10(6),    log10(600)];

function makeFixedLogTicker(realVals){
  const pts = realVals.map(v => ({ v: log10(v), label: String(v) }));
  return (min,max) => pts.filter(p => p.v >= min && p.v <= max);
}
function fixedAxesConfigFig1(){
  return {
    x: { valueFormatter:v=>fmtPow10(v), axisLabelFormatter:v=>fmtPow10(v),
         ticker: makeFixedLogTicker(X1_TICKS_P) },
    y: { valueFormatter:v=>fmtPow10(v), axisLabelFormatter:v=>fmtPow10(v),
         ticker: makeFixedLogTicker(Y1_TICKS_N) }
  };
}

function buildFig1MC_CSV(){
  // Labels: log10(p), then for each C → "MC C=..%", "Th C=..%"
  const labels = ['log10(p)'];
  MC.CONF_LIST.forEach(c => { labels.push(`MC C=${c}%`); labels.push(`Th C=${c}%`); });

  const rows = [];
  // Use the same p’s you tick on the x-axis to guarantee alignment
  const pList = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4];

  for (const p of pList){
    const row = [ log10(p) ];
    for (const C of MC.CONF_LIST){
      const nEmp = empirical_n_from_p_S1(p, C, MC);        // <-- REAL p
      const nTh  = nFromP(C, p);                         // <-- REAL p
      row.push(Number.isFinite(nEmp) ? log10(nEmp) : null);
      row.push(Number.isFinite(nTh)  ? log10(nTh)  : null);
    }
    rows.push(row);
  }
  return { labels, rows };
}
async function renderFig1MC(){
  const chartId = 'fig1mc';
  showLoading(chartId, '⏳ Rendering Monte Carlo… 0%');

  // Build label order: MC & Theory pairs per C (unchanged)
  const labels = ['log10(p)'];
  MC.CONF_LIST.forEach(c => { labels.push(`MC C=${c}%`); labels.push(`Th C=${c}%`); });

  // Style: MC = points-only; Th = lines-only; color-match by C
  const { colors, seriesOpts } = stylesForS1(labels);

  const el = document.getElementById(chartId);
  const opts = {
    ...NUMERIC_X_OPTS,
    xlabel: "Probability (p)",
    ylabel: "Trials Needed (n)",
    labels,
    legend: 'always',
    legendFormatter: makeLegendFormatter('p', v => fmtPow10(v)),
    colors,
    series: seriesOpts,
    axes: fixedAxesConfigFig1(),
    dateWindow: X1_RANGE_LOG,
    valueRange: Y1_RANGE_LOG,
  };

  // Init graph with a stub so Dygraphs is ready before compute
  const g = new Dygraph(el, makeStub(labels), opts);

  // Build p grid and run compute in batches so the UI stays responsive
  const rows = [];
  const pGrid = [];
  for (let p=0.01; p<=0.40+1e-12; p+=MC.STEP_P) pGrid.push(+p.toFixed(4));

  const total = pGrid.length;
  const BATCH = 3; // update UI every few points; adjust as you like

  // Yield once so the overlay paints before we start the heavy work
  await tick();

  for (let idx = 0; idx < total; idx++){
    const p = pGrid[idx];
    const row = [ Math.log10(p) ];

    for (const C of MC.CONF_LIST){
      const nEmp = empirical_n_from_p_S1(p, C, MC); // batched compute inside S1
      const nTh  = nFromP(C, p);
      row.push(Number.isFinite(nEmp) ? Math.log10(nEmp) : null);
      row.push(Number.isFinite(nTh)  ? Math.log10(nTh)  : null);
    }

    rows.push(row);

    // Update the chart every BATCH rows to show progress
    if ((idx+1) % BATCH === 0 || idx === total-1){
      g.updateOptions({ file: sanitizeRows(rows), labels });
      await new Promise(r => setTimeout(r, 0));
      const pct = Math.round(((idx+1)/total)*100);
      showLoading(chartId, `⏳ Rendering Monte Carlo… ${pct}%`);
      // Yield so the browser can paint the updated graph & overlay
      await tick();
    }
  }

  hideLoading(chartId);
  return g;
}
// ===================== FIG 2 (MC): p from n, C ======================
// Find empirical minimal p for given (n, C) by bracketing around theory p*
function empirical_p_from_n(n, C, opts){
  const { POP, E } = opts;
  const target = C/100;
  // start near theory p*
  let pTh = pFromN(C, n);
  if (!Number.isFinite(pTh) || pTh <= 0) pTh = 1e-4;

  // helper: empirical coverage at (n,p)
  function cov(n, p){
    let ok = 0;
    for (let e=0; e<E; e++){
      const carriers = mcBuildCarriers(POP, p);
      const order = new Uint32Array(POP);
      for (let i=0;i<POP;i++) order[i]=i;
      mcShuffle(order);
      // is ≥1 hit within n?
      let hit = 0;
      const lim = Math.min(n, POP);
      for (let i=0;i<lim; i++){
        if (carriers[ order[i] ]) { hit = 1; break; }
      }
      if (hit) ok++;
    }
    return ok/E;
  }

  // bracket: find lo with cov < target, hi with cov >= target
  let lo = Math.max(1e-4, pTh/2), hi = Math.min(0.40, Math.max(pTh, 0.002));
  let cHi = cov(n, hi);
  while (cHi < target && hi < 0.40){
    lo = hi;
    hi = Math.min(0.40, hi * 1.8 + 1e-4);
    cHi = cov(n, hi);
  }
  if (cHi < target) return NaN; // not reached in range

  // binary search for minimal p (tighten until ~1e-4 in p)
  for (let it=0; it<20 && (hi - lo) > 1e-4; it++){
    const mid = (lo + hi)/2;
    const c = cov(n, mid);
    if (c >= target) hi = mid; else lo = mid;
  }
  return hi;
}
function buildFig2MC_CSV(){
  // Labels: log10(n), then for each C → "MC C=..%", "Th C=..%"
  const labels = ['log10(n)'];
  MC.CONF_LIST.forEach(c => { labels.push(`MC C=${c}%`); labels.push(`Th C=${c}%`); });

  const rows = [];
  const nGrid = []; for (let n=1; n<=300; n+=5) nGrid.push(n);

  for (const n of nGrid){
    const row = [ log10(n) ];
    for (const C of MC.CONF_LIST){
      const pEmp = empirical_p_from_n(n, C, MC);
      const pTh  = pFromN(C, n);

      row.push(Number.isFinite(pEmp) ? log10(pEmp) : null);
      row.push(Number.isFinite(pTh)  ? log10(pTh)  : null);
    }
    rows.push(row);
  }
  return { labels, rows };
}
// ----- Fixed ticks & ranges we want across all figs -----
const X_TICKS_REAL = [1, 3, 5, 10, 20, 30, 60, 100, 200, 300];
const Y_TICKS_REAL = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 1];

const X_RANGE_LOG = [log10(1), log10(300)];
const Y_RANGE_LOG = [log10(0.01), log10(1)];

// Create a Dygraphs ticker for fixed real values on a log-10 axis.
function makeFixedLogTicker(realVals) {
  const pts = realVals.map(v => ({ v: log10(v), label: String(v) }));
  return function(min, max) {
    return pts.filter(p => p.v >= min && p.v <= max);
  };
}

// Axes config shared by all figs: log scales with fixed ticks & pretty labels
function fixedAxesConfig() {
  return {
    x: {
      valueFormatter: v => fmtPow10(v),     // tooltip formatting
      axisLabelFormatter: v => fmtPow10(v), // axis label formatting
      ticker: makeFixedLogTicker(X_TICKS_REAL)
    },
    y: {
      valueFormatter: v => fmtPow10(v),
      axisLabelFormatter: v => fmtPow10(v),
      ticker: makeFixedLogTicker(Y_TICKS_REAL)
    }
  };
}
async function renderFig2MC(){
  const chartId = 'fig2mc';
  showLoading(chartId, '⏳ Rendering Monte Carlo… 0%');

  // Paired labels (MC + Th per C), styled like S1
  const labels = ['log10(n)'];
  MC.CONF_LIST.forEach(c => { labels.push(`MC C=${c}%`); labels.push(`Th C=${c}%`); });
  const { colors, seriesOpts } = stylesForS1(labels);

  const el = document.getElementById(chartId);
const opts = {
  ...NUMERIC_X_OPTS,
  xlabel: "Trials (n)",
  ylabel: "Minimum Probability (p)",
  labels,
  legend: 'always',
  legendFormatter: makeLegendFormatter('n', v => fmtPow10(v)),
  colors,
  series: seriesOpts,
  axes: fixedAxesConfig(),          // <<— fixed ticks
  dateWindow: X_RANGE_LOG,          // <<— x-range: 1 … 200
  valueRange: Y_RANGE_LOG           // <<— y-range: 0.01 … 0.4
};
  const g = new Dygraph(el, makeStub(labels), opts);
  await tick(); // let overlay paint

  const rows = [];
  const nGrid = []; for (let n=1; n<=300; n+=5) nGrid.push(n);
  const total = nGrid.length;
  const BATCH = 2;

  for (let idx=0; idx<total; idx++){
    const n = nGrid[idx];
    const row = [ log10(n) ];
    for (const C of MC.CONF_LIST){
      const pEmp = empirical_p_from_n(n, C, MC);
      const pTh  = pFromN(C, n);
      row.push(Number.isFinite(pEmp) ? log10(pEmp) : null);
      row.push(Number.isFinite(pTh)  ? log10(pTh)  : null);
    }
    rows.push(row);

    if ((idx+1)%BATCH===0 || idx===total-1){
      g.updateOptions({ file: sanitizeRows(rows), labels });
      const pct = Math.round(((idx+1)/total)*100);
      showLoading(chartId, `⏳ Rendering Monte Carlo… ${pct}%`);
      await tick();
    }
  }

  hideLoading(chartId);
  return g;
}
// ===================== FIG 3 (MC): n for ≥O at C=95% ======================
// ---- Fig S3 (x = p, y = n), both log-10 axes ----
const X3_TICKS_P  = [0.01, 0.02, 0.05, 0.1, 0.2, 0.4];
const Y3_TICKS_N  = [6, 10, 20, 30, 60, 100, 200, 300, 800];

const X3_RANGE_LOG = [log10(0.01), log10(0.41)];
const Y3_RANGE_LOG = [log10(6),    log10(800)];

function makeFixedLogTicker(vals){
  const pts = vals.map(v => ({ v: log10(v), label: String(v) }));
  return (min,max) => pts.filter(p => p.v >= min && p.v <= max);
}

function fixedAxesConfigFig3(){
  return {
    x: { valueFormatter:v=>fmtPow10(v), axisLabelFormatter:v=>fmtPow10(v),
         ticker: makeFixedLogTicker(X3_TICKS_P) },
    y: { valueFormatter:v=>fmtPow10(v), axisLabelFormatter:v=>fmtPow10(v),
         ticker: makeFixedLogTicker(Y3_TICKS_N) }
  };
}
// Empirical minimal n s.t. Pr(>=O hits by n) >= C, using finite population MC
// Wrapper for O=1 (S1 use-case)
function empirical_n1_from_p(p, C=95, opts=MC){
  return empirical_n_from_p(p, 1, C, opts);
}
function empirical_n_from_p_S3(p, O, C=95, opts=MC){
  const { POP, E } = opts;
  const target = C/100;

  // coverage helper for a candidate n
  function cov(n){
    let ok = 0;
    for (let e=0; e<E; e++){
      const carriers = mcBuildCarriers(POP, p);     // mark POP*p "carriers"
      const order = new Uint32Array(POP);
      for (let i=0;i<POP;i++) order[i]=i;
      mcShuffle(order);
      let hits = 0;
      const lim = Math.min(n, POP);
      for (let i=0;i<lim; i++){
        if (carriers[ order[i] ]) { hits++; if (hits>=O) break; }
      }
      if (hits>=O) ok++;
    }
    return ok/E;
  }

  // start near theory n* (cap by POP)
  let nTh = nForAtLeastO(C, p, O, POP); // you already use this in Fig 3 theory
  if (!Number.isFinite(nTh) || nTh < 1) nTh = 1;
  if (nTh > POP) nTh = POP;

  // bracket: lo fails, hi passes
  let lo = Math.max(1, Math.floor(nTh/2));
  let hi = Math.min(POP, Math.max(1, Math.ceil(nTh)));
  let cHi = cov(hi);
  while (cHi < target && hi < POP){
    lo = hi;
    hi = Math.min(POP, Math.ceil(hi * 1.7) + 1);
    cHi = cov(hi);
  }
  if (cHi < target) return NaN; // not attainable in POP

  // binary search on integers
  while (lo + 1 < hi){
    const mid = Math.floor((lo + hi)/2);
    (cov(mid) >= target ? hi = mid : lo = mid);
  }
  return hi;
}
const CO_COLORS = {
  1:  "#2ca02c", // green
  2:  "#ff00ff", // magenta
  3:  "#17becf"  // cyan
};
// S3 — color & point/line style by O (O=1→C=90, O=2→C=95, O=3→C=99)
function stylesForS3(labels){
  const colors = [];
  const seriesOpts = {};
  const O_TO_C = { 1: "90", 2: "95", 3: "99" };
  labels.slice(1).forEach(lab => {
    const m = lab.match(/^(MC|Th)\s+O=(\d)$/);
    if (m){
      const kind = m[1];
      const O    = parseInt(m[2],10);
      const color = C_COLORS[ O_TO_C[O] ];
      colors.push(color);
      seriesOpts[lab] = {
        drawPoints: (kind === 'MC'),
        strokeWidth: (kind === 'Th') ? 2 : 0,
        pointSize: (kind === 'MC') ? 3 : 0,
        highlightCircleSize: 4
      };
    } else {
      colors.push('#888');
      seriesOpts[lab] = {};
    }
  });
  return { colors, seriesOpts };
}

function buildFig3MC_O123_C95(){
  const C = 95;
  const labels = ['log10(p)'];
  [1,2,3].forEach(O => {
    labels.push(`MC O=${O}`);
    labels.push(`Th O=${O}`);
  });

  const rows = [];
  const pGrid = X3_TICKS_P.slice(); // ensures exact tick p's
  for (const p of pGrid){
    const row = [ log10(p) ];
    for (const O of [1,2,3]){
      const nEmp = empirical_n_from_p_S3(p, O, C, MC);
      const nTh  = nForAtLeastO(C, p, O, MC.POP);
      row.push(Number.isFinite(nEmp) ? log10(nEmp) : null);
      row.push(Number.isFinite(nTh)  ? log10(nTh)  : null);
    }
    rows.push(row);
  }
  return { labels, rows };
}
function buildFig3MC_CSV(){
  const labels = ['log10(p)', ...MC.O_LIST.map(o=>`MC O=${o}`)];
  const rows = [];
  const pGrid = []; for (let p=0.01; p<=0.40+1e-12; p+=MC.STEP_P) pGrid.push(+p.toFixed(4));
  const C = 95;

  for (const p of pGrid){
    // precompute per-experiment min-n for O=1,2,3 in one pass (reuse order)
    const nminsByO = MC.O_LIST.map(()=>[]);
    for (let e=0; e<MC.E; e++){
      const carriers = mcBuildCarriers(MC.POP, p);
      const order = new Uint32Array(MC.POP);
      for (let i=0;i<MC.POP;i++) order[i]=i;
      mcShuffle(order);
      for (let idx=0; idx<MC.O_LIST.length; idx++){
        const O = MC.O_LIST[idx];
        const nmin = minN_for_O_givenOrder(carriers, order, O, MC.NMAX);
        if (Number.isFinite(nmin)) nminsByO[idx].push(nmin);
      }
    }
    const yvals = nminsByO.map(arr => {
      const nC = quantile(arr, C);
      return Number.isFinite(nC) ? log10(nC) : null;
    });
    rows.push([log10(p), ...yvals]);
  }
  return { labels, rows };
}
async function renderFig3MC(){
  const chartId = 'fig3mc';
  showLoading(chartId, '⏳ Rendering Monte Carlo… 0%');

  const { labels } = buildFig3MC_O123_C95();
  const { colors, seriesOpts } = stylesForS3(labels);

  const el = document.getElementById(chartId);
  const opts = {
    ...NUMERIC_X_OPTS,
    xlabel: "Theme Probability (p)",
    ylabel: "Trials Needed (n)",
    labels,
    legend: 'always',
    legendFormatter: makeLegendFormatter('p', v => fmtPow10(v)),
    colors,
    series: seriesOpts,
    axes: fixedAxesConfigFig3(),
    dateWindow: X3_RANGE_LOG,
    valueRange: Y3_RANGE_LOG
  };
  const g = new Dygraph(el, makeStub(labels), opts);
  await tick();

  const rows = [];
  const pList = X3_TICKS_P.slice(); // ensures we hit your tick p's exactly
  // You can densify the grid if you want smoother curves:
  // for (let p=0.01; p<=0.4+1e-12; p+=0.005) pList.push(p);

  const total = pList.length;
  for (let i=0; i<total; i++){
    const p = pList[i];
    const row = [ log10(p) ];
    for (const O of [1,2,3]){
      const nEmp = empirical_n_from_p_S3(p, O, 95, MC);
      const nTh  = nForAtLeastO(95, p, O, MC.POP);
      row.push(Number.isFinite(nEmp) ? log10(nEmp) : null);
      row.push(Number.isFinite(nTh)  ? log10(nTh)  : null);
    }
    rows.push(row);
    if ((i+1)%1===0 || i===total-1){
      g.updateOptions({ file: sanitizeRows(rows) });
      showLoading(chartId, `⏳ Rendering Monte Carlo… ${Math.round(((i+1)/total)*100)}%`);
      await tick();
    }
  }

  hideLoading(chartId);
  return g;
}
// ===================== Fig 4 ======================
// ---- Eq 4–6 helpers (Good–Turing, per step n)
// Good–Turing at step n: f1 = #singletons so far; m = #tokens observed so far
function gt_R_hat_and_SE(f1, m) {
  const Rhat = (m > 0) ? (f1 / m) : 0;
  const SE   = (m > 0) ? (Math.sqrt(Math.max(0, f1)) / m) : 0;
  return { Rhat, SE };
}
// z for 90/95/99 if you want C-selectable
const Z_BY_C = { 90: 1.6448536269514722, 95: 1.959963984540054, 99: 2.5758293035489004 };

// ---- MC engine for missing mass (one experiment, one pass of n=1..Ntrials)
function runMissingMassExperiment(pop, drawOrder, nMax, C=95) {
  const N = pop.totalTokens; // population total tokens (for "true" R only)

  const seenCount = new Map();
  let f1 = 0;
  let unseenTotal = N;
  let mObs = 0;              // <-- tokens observed so far

  const z = Z_BY_C[String(C)] || 1.959963984540054;
  const rows = [];  // [n, R_true, Rhat, Rlo, Rhi]

  for (let step = 1; step <= nMax; step++) {
    const interviewIdx = drawOrder[step - 1];
    const themes = pop.interviewThemes[interviewIdx];

    // accumulate tokens and update f1 / unseenTotal
    mObs += themes.length;   // <-- count tokens observed so far

    for (const t of themes) {
      const prev = seenCount.get(t) || 0;
      const next = prev + 1;
      seenCount.set(t, next);

      if (prev === 0) {
        unseenTotal -= pop.themeTotals.get(t);
        f1 += 1;
      } else if (prev === 1) {
        f1 -= 1;
      }
    }

    const { Rhat, SE } = gt_R_hat_and_SE(f1, mObs);  // <-- use mObs (not N)
    const Rlo = Math.max(0, Rhat - z * SE);
    const Rhi = Math.min(1, Rhat + z * SE);
    // const Rtrue = unseenTotal / N;
    const Rtrue = (N > mObs) ? (unseenTotal / (N - mObs)) : 0;  // next-draw probability (no-replacement)

    rows.push([step, Rtrue, Rhat, Rlo, Rhi]);
  }
  return rows;
}
// ---- Aggregation across experiments
function aggregateMissingMass(popFactory, POP, E, nMax, C=95) {
  const sums = Array.from({length: nMax}, () => ({Rtrue:0, Rhat:0, Rlo:0, Rhi:0}));
  for (let e=0; e<E; e++) {
    const pop = popFactory();                    // new theme population each experiment
    const order = new Uint32Array(POP);
    for (let i=0;i<POP;i++) order[i]=i;
    mcShuffle(order);                            // your existing no-replacement shuffle
    const rows = runMissingMassExperiment(pop, order, nMax, C);
    for (let i=0; i<nMax; i++) {
      sums[i].Rtrue += rows[i][1];
      sums[i].Rhat  += rows[i][2];
      sums[i].Rlo   += rows[i][3];
      sums[i].Rhi   += rows[i][4];
    }
  }
  // average
  const avg = [];
  for (let i=0;i<nMax;i++){
    const k = E;
    avg.push([ i+1,
      sums[i].Rtrue/k, sums[i].Rhat/k, sums[i].Rlo/k, sums[i].Rhi/k
    ]);
  }
  return avg; // [ [n, mean_Rtrue, mean_Rhat, mean_Rlo, mean_Rhi], ... ]
}
function buildS4Rows(popFactory, POP, E, nMax, C=95){
  const agg = aggregateMissingMass(popFactory, POP, E, nMax, C);
  // labels: x, MC mean (as triple), Theory mean±SE band (as triple)
  const labels = ['log10(n)', 'MC R_true', 'Th R (R±SE)'];

  const rows = agg.map(([n, Rtrue, Rhat, Rlo, Rhi]) => ([
    Math.log10(n),
    [Rtrue, Rtrue, Rtrue],   // <= MC as a degenerate band so customBars works cleanly
    [Rlo,   Rhat,  Rhi]
  ]));

  // compute a sensible y ceiling so early points aren't clipped
  const ymax = Math.min(1, Math.max(
    0.01,
    ...rows.flatMap(r => [ r[1][2], r[2][2] ]) // MC high (=Rtrue), Theory high (=Rhi)
  ));
  return { labels, rows, ymax };
}
// --------- Missing Mass: population generator --------------------------------

// Build a function that returns a fresh population per experiment.
// It creates POP interviews; each interview emits ~meanTokens tokens.
// Theme probabilities follow a Zipf-like heavy tail (p_t ∝ 1/(t^s)).
function makePopFactory({
  POP          = (window.MC && MC.POP) || 200,   // interviews per experiment
  T            = 500,                             // number of distinct themes
  meanTokens   = 20,                              // avg tokens per interview
  zipfS        = 1.05                             // heaviness of the tail
} = {}) {

  // Precompute the Zipf probabilities once (shared across experiments)
  const weights = new Float64Array(T);
  for (let t = 0; t < T; t++) weights[t] = 1 / Math.pow(t + 1, zipfS);
  const W = weights.reduce((a,b)=>a+b, 0);
  const probs = new Float64Array(T);
  for (let t = 0; t < T; t++) probs[t] = weights[t] / W;

  // CDF for fast inverse sampling
  const cdf = new Float64Array(T);
  let acc = 0;
  for (let t = 0; t < T; t++) { acc += probs[t]; cdf[t] = acc; }
  cdf[T-1] = 1.0; // safety

  // Sample a theme index via inverse CDF
  function sampleTheme(u){
    // binary search
    let lo = 0, hi = T - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (u <= cdf[mid]) hi = mid; else lo = mid + 1;
    }
    return lo; // 0..T-1
  }

  // Poisson sampler (Knuth) for small means; good enough for per-interview tokens
  function poisson(mean){
    const L = Math.exp(-mean);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  // The factory returned to S4 for each experiment:
  return function popFactory(){
    const interviewThemes = Array.from({length: POP}, () => []);
    const themeTotalsArr  = new Uint32Array(T);
    let totalTokens = 0;

    for (let i = 0; i < POP; i++){
      const k = Math.max(0, poisson(meanTokens));  // tokens in interview i
      totalTokens += k;
      const arr = interviewThemes[i];
      for (let j = 0; j < k; j++){
        const t = sampleTheme(Math.random());
        arr.push(t);
        themeTotalsArr[t] += 1;
      }
    }

    // Build the Map<themeId, totalCount> S4 expects
    const themeTotals = new Map();
    for (let t = 0; t < T; t++) {
      const ct = themeTotalsArr[t];
      if (ct > 0) themeTotals.set(t, ct);
    }

    return {
      interviewThemes,    // Array< Array<themeId> >
      themeTotals,        // Map(themeId -> total token count)
      totalTokens         // sum over all interviews/tokens in this experiment
    };
  };
}

// Make it available globally for renderFigS4()
window.popFactory = makePopFactory({
  POP: (window.MC && MC.POP) || 200,  // keep in sync with your other figs
  T: 800,                              // adjust to taste; higher => rarer tail
  meanTokens: 20,                      // tokens per interview on average
  zipfS: 1.05                          // tail heaviness
});

async function renderFigS4(){
  const chartId = 'fig4mc';
  const overlay = document.getElementById('fig4mc-loading');
  const el = document.getElementById(chartId);
  const show = msg => { if (overlay){ overlay.textContent = msg; overlay.style.display='block'; } };
  const hide = () => { if (overlay){ overlay.style.display='none'; } };

  try {
    if (!el) throw new Error(`#${chartId} not found in HTML`);
    if (typeof window.popFactory !== 'function') throw new Error('popFactory() is undefined.');
    if (typeof window.aggregateMissingMass !== 'function') throw new Error('aggregateMissingMass(...) is not defined.');

    show('⏳ Rendering Monte Carlo…');

    const POP  = (window.MC && MC.POP) || 200;
    const E    = (window.MC && MC.E)   || 1000;   // you said 1000 experiments
    const nMax = Math.min(200, POP);
    const C    = 95;

    const { labels, rows, ymax } = buildS4Rows(popFactory, POP, E, nMax, C);

    const g = new Dygraph(el, rows, {
      ...NUMERIC_X_OPTS,
      labels,
      legend: 'always',
      legendFormatter: makeLegendFormatter('n', v => fmtPow10(v)),
      xlabel: 'Trials (n)',
      ylabel: 'Missing mass (R)',

      customBars: true,
      fillAlpha: 0.14,

      // MC = dots-only; Theory = line+band
      series: {
        'MC R_true':   { drawPoints: true,  strokeWidth: 0, pointSize: 3 },
        'Th R (R±SE)': { drawPoints: false, strokeWidth: 2 }
      },
      colors: [ '#17becf', '#9c27b0' ],

      // log-x like S2; linear y with auto ceiling
      axes: {
        x: { valueFormatter: v => fmtPow10(v),
             axisLabelFormatter: v => fmtPow10(v),
             ticker: makeFixedLogTicker([1,3,5,10,20,30,60,100,200]) },
        y: { valueFormatter: y => y.toFixed(3).replace(/\.?0+$/,''),
             axisLabelFormatter: y => y.toFixed(2).replace(/\.?0+$/,''),
             ticker: (min,max) => {
               const vals = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].filter(v => v>=min && v<=max);
               return vals.map(v => ({ v, label: String(v) }));
             } }
      },
      valueRange: [0, Math.max(0.4, Math.ceil(ymax*100)/100)],
      dateWindow: [Math.log10(1), Math.log10(200)]
    });
    // debugging hack
    window.g4mc = g;
    g.ready(() => console.log('S4 ready; points:', (g.layout_ && g.layout_.points) ? g.layout_.points.length : 'none'));

    hide();
    return g;

  } catch (err) {
    console.error('renderFigS4 error:', err);
    show('⚠️ Fig S4 error: ' + (err && err.message ? err.message : String(err)));
  }
}




// ===================== INIT & SAVE HOOKS ======================
let g1mc, g2mc, g3mc; // keep refs for exports

function initMonteCarloFigs(){
  renderFig1MC().then(g => {
    g1mc = g;
    document.getElementById('save1mc')
      .addEventListener('click', ()=> exportDygraphToSVG(g1mc, 'fig1-mc.svg'));
    document.getElementById('save1mcpng')
      .addEventListener('click', ()=> exportDygraphToPNG(g1mc, 'fig1-mc.png', 3));
  });

  renderFig2MC().then(g => {
    g2mc = g;
    document.getElementById('save2mc')
      .addEventListener('click', ()=> exportDygraphToSVG(g2mc, 'fig2-mc.svg'));
    document.getElementById('save2mcpng')
      .addEventListener('click', ()=> exportDygraphToPNG(g2mc, 'fig2-mc.png', 3));
  });

  renderFig3MC().then(g => {
    g3mc = g;
    document.getElementById('save3mc')
      .addEventListener('click', ()=> exportDygraphToSVG(g3mc, 'fig3-mc.svg'));
    document.getElementById('save3mcpng')
      .addEventListener('click', ()=> exportDygraphToPNG(g3mc, 'fig3-mc.png', 3));
  });

  // S4 — Missing Mass (theory ± SE band + MC mean)
  renderFigS4().then(g => {
    const b1 = document.getElementById('save4mc');
    const b2 = document.getElementById('save4mcpng');
    if (b1) b1.onclick = () => exportDygraphToSVG(g, 'FigS4_MC.svg');
    if (b2 && typeof exportDygraphToPNG === 'function') {
      b2.onclick = () => exportDygraphToPNG(g, 'FigS4_MC.png', 3);
    }
  });
}
function initTheory() {
    // Fig 1: x=p, y=n  → use pTicks on x, nTicks on y
  const f1 = buildFig1Multi([90,95,99], 0.01, 0.40, 0.002);
  const g1 = renderLogLog(
    document.getElementById('fig1'),
    asCSV(f1.labels, f1.rows),
    'Probability (p)', 'Trials Needed (n)',
    pTicks, nTicks
  );
  document.getElementById('save1').addEventListener('click', ()=>exportDygraphToSVG(g1, 'BEST_Fig1_n_from_p.svg'));

  // Fig 2: x=n, y=p  → use nTicks on x, pTicks on y  (this was the bug)
  const f2 = buildFig2Multi([90,95,99], 1, 300);
  const g2 = renderLogLog(
    document.getElementById('fig2'),
    asCSV(f2.labels, f2.rows),
    'Trials (n)', 'Minimum Probability (p)',
    nTicks, pTicks
  );
  document.getElementById('save2').addEventListener('click', ()=>exportDygraphToSVG(g2, 'BEST_Fig2_p_from_n.svg'));

  // Fig 3: C=95%, O=1,2,3  → x=p, y=n
  const f3 = buildFig3_O123_C95(0.01, 0.40, 0.002);
  const g3 = renderLogLog(
    document.getElementById('fig3'),
    asCSV(f3.labels, f3.rows),
    'Probability (p)', 'Trials Needed (n)',
    pTicks, nTicks
  );
  document.getElementById('save3').addEventListener('click', ()=>exportDygraphToSVG(g3, 'BEST_Fig3_n_for_O_ge.svg'));

  // Fig 1
  document.getElementById('save1').addEventListener('click', ()=>exportDygraphToSVG(g1, 'BEST_Fig1_n_from_p.svg'));
  document.getElementById('save1png').addEventListener('click', ()=>exportDygraphToPNG(g1, 'BEST_Fig1_n_from_p.png', 3)); // 3x for crisp PNG

  // Fig 2
  document.getElementById('save2').addEventListener('click', ()=>exportDygraphToSVG(g2, 'BEST_Fig2_p_from_n.svg'));
  document.getElementById('save2png').addEventListener('click', ()=>exportDygraphToPNG(g2, 'BEST_Fig2_p_from_n.png', 3));

  // Fig 3
  document.getElementById('save3').addEventListener('click', ()=>exportDygraphToSVG(g3, 'BEST_Fig3_n_for_O_ge.svg'));
  document.getElementById('save3png').addEventListener('click', ()=>exportDygraphToPNG(g3, 'BEST_Fig3_n_for_O_ge.png', 3));

}

// ===== render & wire buttons =====
(function init(){
  //initTheory();

  // Supplemental Figures 1-4 - run asynchronously
  requestAnimationFrame(() => {
    // small delay ensures initial paint
    setTimeout(() => initMonteCarloFigs(), 0);
  });
})();
