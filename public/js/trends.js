// Trends: highlights and streaks, the weight chart, BMI, and measurement lines.
import { h, todayStr, mediumDate, fmt1, round1, bmi, utcDay } from './util.js';
import { drawWeightChart, drawLineChart, smoothSeries } from './chart.js';
import { state, shell, LS, weightSeries, BAND } from './core.js';
import { streakTiles, highlightList } from './insights.js';
import { measureTrendCard } from './measure.js';

const trend = { days: Number(LS.get('dxlvi.range')) || 0, avg: LS.get('dxlvi.avg') !== '0', ref: LS.get('dxlvi.ref') !== '0', band: LS.get('dxlvi.band') !== '0', goal: LS.get('dxlvi.goal') !== '0' };
let observers = [];
export const stopObserving = () => { observers.forEach((o) => o.disconnect()); observers = []; };
function watch(host, draw) {
  let lastW = 0;
  const o = new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w && w !== lastW) { lastW = w; draw(); } });
  o.observe(host);
  observers.push(o);
}

function bmiCard() {
  const series = weightSeries().filter((p) => !p.flag);
  if (!series.length) return null;
  // One point per month (the month's average) keeps the line calm.
  const by = new Map();
  for (const p of series) (by.get(p.d.slice(0, 7)) || by.set(p.d.slice(0, 7), []).get(p.d.slice(0, 7))).push(p.v);
  const pts = [...by].sort(([a], [b]) => a.localeCompare(b)).map(([ym, v]) => ({ d: `${ym}-15`, t: utcDay(`${ym}-15`), v: round1(bmi(v.reduce((a, b) => a + b, 0) / v.length, state.settings.heightIn)) }));
  const last = series.at(-1);
  const host = h('div', { class: 'chartbox' });
  const draw = () => drawLineChart(host, { points: pts, unit: 'BMI', label: 'BMI by month' });
  const card = h('section', { class: 'card' }, h('h2', null, 'BMI'),
    h('p', { class: 'sub' }, `Now ${fmt1(bmi(last.v, state.settings.heightIn))}, from ${fmt1(last.v)} lb at ${Math.floor(state.settings.heightIn / 12)} ft ${round1(state.settings.heightIn % 12)} in. Each dot is a monthly average.`), host);
  requestAnimationFrame(draw);
  watch(host, draw);
  return card;
}

export function viewTrends() {
  stopObserving();
  const series = weightSeries();
  const avg = smoothSeries(series);
  const stg = state.settings;
  const goalW = stg.goals?.weight;
  const host = h('div', { class: 'chartbox' });
  const draw = () => drawWeightChart(host, { series, avg, days: trend.days || null, today: todayStr(), showAvg: trend.avg, showRef: trend.ref && Boolean(stg.start), refWeight: stg.start?.weight, refLabel: stg.start ? `${fmt1(stg.start.weight)} · ${mediumDate(stg.start.date)}` : '', showBand: trend.band, band: BAND, goalWeight: trend.goal ? goalW : null });

  const ranges = [[0, 'All'], [365 * 5, '5 yr'], [365, '1 yr'], [90, '90 days']];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Range' });
  const paintSeg = () => seg.replaceChildren(...ranges.map(([d, label]) => h('button', { type: 'button', 'aria-pressed': String(trend.days === d), onclick: () => { trend.days = d; LS.set('dxlvi.range', d); paintSeg(); draw(); } }, label)));
  paintSeg();
  const toggle = (key, id, label) => h('label', { class: 'check', for: id, style: 'min-height:38px' }, h('input', { type: 'checkbox', id, checked: trend[key], onchange: (ev) => { trend[key] = ev.target.checked; LS.set(`dxlvi.${key}`, ev.target.checked ? '1' : '0'); draw(); } }), label);

  const hi = series.reduce((a, p) => (!a || p.v > a.v ? p : a), null);
  const lo = series.reduce((a, p) => (!a || p.v < a.v ? p : a), null);
  const last = series[series.length - 1];
  const changeOver = (days) => {
    if (!last) return null;
    let best = null;
    for (const p of series) if (Math.abs(p.t - (last.t - days)) <= 7 && (!best || Math.abs(p.t - (last.t - days)) < Math.abs(best.t - (last.t - days)))) best = p;
    return best && best !== last ? round1(last.v - best.v) : null;
  };
  const signed = (n) => `${n <= 0 ? '−' : '+'}${fmt1(Math.abs(n))}`;
  const tile = (k, v, n, hl) => h('div', { class: `tile${hl ? ' hl' : ''}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v, h('small', null, 'lb')), n ? h('div', { class: 'n' }, n) : null);
  const tiles = [];
  if (last) tiles.push(tile('Latest', fmt1(last.v), mediumDate(last.d)));
  if (stg.start && last) tiles.push(tile(`Vs. ${fmt1(stg.start.weight)} start`, signed(last.v - stg.start.weight), 'Since the first weigh-in', true));
  if (goalW && last) tiles.push(tile('Goal', fmt1(goalW), last.v > goalW ? `${fmt1(last.v - goalW)} lb to go` : 'Reached', true));
  if (hi) tiles.push(tile('Highest', fmt1(hi.v), mediumDate(hi.d)));
  if (lo) tiles.push(tile('Lowest', fmt1(lo.v), mediumDate(lo.d)));
  if (last && hi) tiles.push(tile('From the highest', signed(last.v - hi.v), `Highest was ${mediumDate(hi.d)}`));
  const c30 = changeOver(30), c90 = changeOver(90);
  if (c30 !== null) tiles.push(tile('Past 30 days', signed(c30), 'Compared with about a month ago'));
  if (c90 !== null) tiles.push(tile('Past 90 days', signed(c90), 'Compared with about 3 months ago'));
  const flagged = series.filter((p) => p.flag).length;

  shell('trends',
    h('section', { class: 'card' }, h('h2', null, 'Highlights'), highlightList()),
    h('div', { class: 'tiles' }, streakTiles()),
    h('section', { class: 'card' }, h('h2', null, 'Weight'),
      h('div', { class: 'row', style: 'justify-content:space-between' }, seg),
      h('div', { class: 'row', style: 'gap:4px 18px' }, toggle('avg', 't-avg', '31-day average'), stg.start ? toggle('ref', 't-ref', `${fmt1(stg.start.weight)} line`) : null, goalW ? toggle('goal', 't-goal', 'Goal line') : null, toggle('band', 't-band', 'The 100 pound year')),
      host,
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'l-raw' }), 'Daily reading'), h('span', null, h('i', { class: 'l-avg' }), '31-day average'), stg.start ? h('span', null, h('i', { class: 'l-ref' }), `${fmt1(stg.start.weight)} starting weight`) : null),
      flagged ? h('p', { class: 'sub' }, `${flagged} ${flagged === 1 ? 'reading is' : 'readings are'} marked for review. They show as hollow dots and stay out of the average.`) : null),
    series.length ? h('div', { class: 'tiles' }, tiles) : h('p', { class: 'empty' }, 'Log a weight to start your chart.'),
    bmiCard(),
    measureTrendCard());
  requestAnimationFrame(draw);
  watch(host, draw);
}
