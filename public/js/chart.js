// The weight chart: daily readings, a 31-day average, the 546 line, and the "100 pound year" band.
import { s, h, utcDay, fromUtcDay, mediumDate, fmt1 } from './util.js';

// One average per reading: the mean of readings within 15 days, shown only
// where at least three exist. Readings flagged for review are left out.
export function smoothSeries(series) {
  const good = series.filter((p) => !p.flag);
  return series.map((p) => {
    const near = good.filter((q) => Math.abs(q.t - p.t) <= 15);
    return near.length >= 3 ? near.reduce((a, q) => a + q.v, 0) / near.length : null;
  });
}

function niceStep(span) {
  if (span <= 40) return 5;
  if (span <= 90) return 10;
  if (span <= 200) return 20;
  return 50;
}

function xTicks(t0, t1) {
  const span = t1 - t0, out = [];
  const a = fromUtcDay(t0), b = fromUtcDay(t1);
  if (span > 365 * 2.2) {
    const step = span > 365 * 9 ? 2 : 1; // label even years when showing a decade or more
    for (let y = a.getUTCFullYear(); y <= b.getUTCFullYear(); y++) {
      const t = utcDay(`${y}-01-01`);
      if (y % step === 0 && t >= t0) out.push({ t, label: String(y) });
    }
  } else if (span > 150) {
    const step = span > 330 ? 3 : 1;
    let d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
    while (d <= b) {
      if (step === 1 || d.getUTCMonth() % 3 === 0) {
        out.push({ t: Math.round(d / 86400000), label: d.toLocaleDateString(undefined, { month: 'short', year: d.getUTCMonth() === 0 ? '2-digit' : undefined, timeZone: 'UTC' }) });
      }
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
  } else {
    for (let t = t1; t >= t0; t -= 14) out.unshift({ t, label: fromUtcDay(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
  }
  return out;
}

export function drawWeightChart(host, o) {
  host.replaceChildren();
  const width = Math.max(300, Math.floor(host.clientWidth || 640));
  const height = width < 520 ? 300 : 380;
  const m = { l: 46, r: 14, t: 14, b: 30 };
  const all = o.series;
  const today = utcDay(o.today);
  const t1 = Math.max(today, all.length ? all[all.length - 1].t : today);
  const t0 = o.days ? t1 - o.days : all.length ? all[0].t : t1 - 30;
  const idx = all.map((p, i) => i).filter((i) => all[i].t >= t0);
  if (!idx.length) {
    host.append(h('p', { class: 'empty' }, 'No weigh-ins in this range yet.'));
    return;
  }
  const pts = idx.map((i) => all[i]);
  const avg = idx.map((i) => o.avg[i]);
  const vals = pts.map((p) => p.v).concat(avg.filter((v) => v !== null));
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const refIn = o.showRef && o.refWeight && o.refWeight >= lo - 40 && o.refWeight <= hi + 40;
  if (refIn) { lo = Math.min(lo, o.refWeight); hi = Math.max(hi, o.refWeight); }
  const step = niceStep(hi - lo);
  const y0 = Math.floor((lo - 2) / step) * step, y1 = Math.ceil((hi + 2) / step) * step;
  const X = (t) => m.l + ((t - t0) / (t1 - t0 || 1)) * (width - m.l - m.r);
  const Y = (v) => height - m.b - ((v - y0) / (y1 - y0)) * (height - m.t - m.b);

  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Weight over time' });
  for (let v = y0; v <= y1; v += step) {
    svg.append(s('line', { class: 'grid', x1: m.l, x2: width - m.r, y1: Y(v), y2: Y(v) }));
    svg.append(s('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, v));
  }
  for (const tk of xTicks(t0, t1)) {
    if (tk.t < t0 || tk.t > t1) continue;
    svg.append(s('line', { class: 'grid', x1: X(tk.t), x2: X(tk.t), y1: height - m.b, y2: height - m.b + 4 }));
    svg.append(s('text', { x: X(tk.t), y: height - 10, 'text-anchor': 'middle' }, tk.label));
  }

  if (o.showBand && o.band) {
    const b0 = utcDay(o.band.from), b1 = utcDay(o.band.to);
    if (b1 >= t0 && b0 <= t1) {
      const x0 = X(Math.max(b0, t0)), x1 = X(Math.min(b1, t1));
      svg.append(s('rect', { class: 'band', x: x0, y: m.t, width: Math.max(2, x1 - x0), height: height - m.t - m.b }));
      if (x1 - x0 > 60) svg.append(s('text', { class: 'bandlabel', x: (x0 + x1) / 2, y: m.t + 16, 'text-anchor': 'middle' }, o.band.label));
    }
  }

  if (refIn) {
    svg.append(s('line', { class: 'ref', x1: m.l, x2: width - m.r, y1: Y(o.refWeight), y2: Y(o.refWeight) }));
    svg.append(s('text', { class: 'reflabel', x: width - m.r - 4, y: Y(o.refWeight) - 6, 'text-anchor': 'end' }, o.refLabel));
  }

  for (const p of pts) svg.append(s('circle', { class: p.flag ? 'raw review' : 'raw', cx: X(p.t), cy: Y(p.v), r: pts.length > 250 ? 2.3 : 3.2 }));

  if (o.showAvg) {
    let d = '', pen = false, prevT = null;
    pts.forEach((p, i) => {
      const a = avg[i];
      if (a === null || (prevT !== null && p.t - prevT > 45)) pen = false;
      if (a !== null) {
        d += `${pen ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(a).toFixed(1)}`;
        pen = true;
        prevT = p.t;
      }
    });
    if (d) svg.append(s('path', { class: 'avg', d }));
  }

  const cross = s('line', { class: 'cross', y1: m.t, y2: height - m.b, visibility: 'hidden' });
  const dot = s('circle', { class: 'focus', r: 6, visibility: 'hidden' });
  svg.append(cross, dot);
  const tip = h('div', { class: 'tip', hidden: true });
  const show = (ev) => {
    const r = svg.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * width;
    const t = t0 + ((x - m.l) / (width - m.l - m.r)) * (t1 - t0);
    let best = 0;
    pts.forEach((p, i) => { if (Math.abs(p.t - t) < Math.abs(pts[best].t - t)) best = i; });
    const p = pts[best];
    cross.setAttribute('x1', X(p.t)); cross.setAttribute('x2', X(p.t)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(p.t)); dot.setAttribute('cy', Y(p.v)); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.replaceChildren(...[h('strong', null, `${fmt1(p.v)} lb`), h('br'), mediumDate(p.d), avg[best] !== null && o.showAvg ? h('div', null, `31-day average ${fmt1(avg[best])}`) : null, p.flag ? h('div', null, 'Marked for review') : null].filter((x) => x !== null));
    const px = (X(p.t) / width) * r.width;
    tip.style.left = `${Math.min(Math.max(px, 70), r.width - 70)}px`;
    tip.style.top = `${(Y(p.v) / height) * r.height}px`;
  };
  const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerdown', show);
  svg.addEventListener('pointerleave', hide);
  host.append(svg, tip);
}
