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
function buildDygraphSVG(g, opts = {}){
  const PAD = Object.assign({top: 10, right: 28, bottom: 38, left: 38}, opts.padding || {});
  const TITLE_GAP = (typeof opts.titleGap === 'number') ? opts.titleGap : 10;

  // Base geometry from live chart
  const baseArea = g.getArea();      // live plotting rect (inside canvas)
  const baseW = g.width_, baseH = g.height_;

  // Output canvas is padded around the whole chart
  const OUT_W = baseW + PAD.left + PAD.right;
  const OUT_H = baseH + PAD.top  + PAD.bottom;

  // Shift the plotting rect by padding
  const area = {
    x: baseArea.x + PAD.left,
    y: baseArea.y + PAD.top,
    w: baseArea.w,
    h: baseArea.h
  };

  // Ranges (log space)
  const [xmin, xmax] = g.xAxisRange();
  const [ymin, ymax] = g.yAxisRange();
  const toX = xv => area.x + ((xv - xmin) / (xmax - xmin)) * area.w;
  const toY = yv => area.y + area.h - ((yv - ymin) / (ymax - ymin)) * area.h;

  // Fonts from page so SVG matches on-screen typography
  const host = g.maindiv_ || g.graphDiv || (g.canvas_ && g.canvas_.parentNode) || document.body;
  const cs = window.getComputedStyle(host);
  const fontFamily = (cs.fontFamily && cs.fontFamily.trim()) ||
    "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const fontSizePx = parseFloat(cs.fontSize) || 13;
  const TICK_FS  = Math.round(fontSizePx);
  const TITLE_FS = Math.round(fontSizePx * 1.1);
  const ffCSS = fontFamily.replace(/"/g, "'");

  // Ticks & grid (use current tickers)
  const ax = g.getOption('axes');
  const xticks = ax.x.ticker(xmin, xmax);
  const yticks = ax.y.ticker(ymin, ymax);

  const gridSVG = [
    ...xticks.map(t => `<line x1="${toX(t.v)}" y1="${area.y}" x2="${toX(t.v)}" y2="${area.y+area.h}" stroke="#e9ecef"/>`),
    ...yticks.map(t => `<line x1="${area.x}" y1="${toY(t.v)}" x2="${area.x+area.w}" y2="${toY(t.v)}" stroke="#e9ecef"/>`)
  ].join('');

  // Series paths from precomputed layout points (pixel coords); add padding offset implicitly via canvasx/canvasy + PAD
  const labels = g.getLabels();
  const colors = g.getColors();
  const vis    = g.visibility();
  const sets   = g.layout_ && g.layout_.points ? g.layout_.points : [];
  const seriesSVG = [];
  for (let s=0; s<sets.length; s++){
    if (!vis[s]) continue;
    const pts = sets[s];
    let d = '';
    for (const pt of pts){
      // pt.canvasx/y are in base canvas; add padding to place inside OUT_W/OUT_H
      const x = pt.canvasx + PAD.left;
      const y = pt.canvasy + PAD.top;
      if (Number.isFinite(x) && Number.isFinite(y)) d += (d ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
    }
    if (d) seriesSVG.push(`<path d="${d}" fill="none" stroke="${colors[s]}" stroke-width="2"/>`);
  }

  // Tick marks + tick labels (a little more space than live chart)
  function ticksSVG(ticks, isX){
    return ticks.map(t=>{
      const pos = isX ? toX(t.v) : toY(t.v);
      // tick length ~6px; bump label offsets
      const x1 = isX ? pos : area.x - 8, y1 = isX ? area.y + area.h : pos;
      const x2 = isX ? pos : area.x,     y2 = isX ? area.y + area.h + 6 : pos;
      const tx = isX ? pos : area.x - 12, // a hair farther left than before
            ty = isX ? area.y + area.h + 22 : pos + 4;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#888"/>
              <text x="${tx}" y="${ty}" font-size="${TICK_FS}" text-anchor="${isX?'middle':'end'}" fill="#333">${t.label}</text>`;
    }).join('');
  }

  // Axis titles (more gap from tick labels)
  const xlabel = g.getOption('xlabel') || '';
  const ylabel = g.getOption('ylabel') || '';
  const axisTitles = `
    <text class="axis-title" x="${area.x + area.w/2}" y="${OUT_H - Math.max(10, PAD.bottom - TITLE_GAP)}"
          font-size="${TITLE_FS}" text-anchor="middle" fill="#333">${xlabel}</text>
    <text class="axis-title" x="${Math.max(16, PAD.left - 20)}" y="${area.y + area.h/2}"
          font-size="${TITLE_FS}" text-anchor="middle" fill="#333"
          transform="rotate(-90,${Math.max(16, PAD.left - 20)},${area.y + area.h/2})">${ylabel}</text>
  `;

  // Compact legend in top-right of plot, within padded area
  // --- compact right-aligned legend in top-right of plot
  // --- compact right-aligned legend in the top-right of the plot, no overlap ---
  const legendItems = [];
  for (let s = 1; s < labels.length; s++) {
    if (vis[s-1]) legendItems.push({ name: labels[s], color: colors[s-1] });
  }
  
  // measurement context (exact width in px for this font)
  const measCanvas = document.createElement('canvas');
  const mctx = measCanvas.getContext('2d');
  mctx.font = `${TICK_FS}px ${ffCSS}`; // same font we emit into SVG
  
  const rx = area.x + area.w - 12;   // right boundary for legend text
  const top = area.y + 12;
  const gapY = 16;                   // vertical spacing
  const sw = 18;                     // swatch width
  const swTextGap = 10;              // gap between swatch and LEFT edge of text
  
  const legendSVG = legendItems.map((it, i) => {
    const y = top + i * gapY;
  
    // pixel width of the label with the export font
    const w = Math.ceil(mctx.measureText(it.name).width);
  
    // text is right-anchored at rx → left edge is rx - w
    const textRight = rx;
    const textLeft  = rx - w;
  
    // swatch sits entirely to the LEFT of the text, with a fixed gap
    const swR = textLeft - swTextGap;
    const swL = swR - sw;
  
    return `
      <line x1="${swL}" y1="${y}" x2="${swR}" y2="${y}"
            stroke="${it.color}" stroke-width="3"/>
      <text x="${textRight}" y="${y+4}" font-size="${TICK_FS}"
            text-anchor="end" fill="#333">${it.name}</text>
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
  ${seriesSVG.join('\n')}
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



// ===== render & wire buttons =====
(function init(){
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


})();