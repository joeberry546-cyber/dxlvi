// Supplies: CPAP replacement schedule and log, eyeglasses prescription, compression stockings.
import { h, todayStr, mediumDate, isDateStr } from './util.js';
import { state, shell, nav, saveSupplies, toast } from './core.js';
import { CPAP_PARTS, EYE_COLS, EYES, eyeKey, dueInfo } from './fields.js';

export function viewSupplies() {
  let editGlasses = false;
  let editVendor = false;
  let editing = null; // id of the stocking being edited, or 'new'
  const today = todayStr();
  const box = h('div', { style: 'display:grid;gap:16px' });
  const copy = () => JSON.parse(JSON.stringify(state.supplies));

  async function commit(next, message) {
    if (await saveSupplies(next)) {
      if (message) toast(message);
      document.querySelector('.nav')?.replaceWith(nav('supplies'));
      paint();
      return true;
    }
    return false;
  }

  const input = (id, label, value, onInput, extra = {}) =>
    h('label', { class: 'field grow', for: id }, label, h('input', { type: 'text', id, maxlength: extra.max || '20', placeholder: extra.ph || '', value: value || '', oninput: (ev) => onInput(ev.target.value) }));
  const dateIn = (id, label, value, onChange) =>
    h('label', { class: 'field grow', for: id }, label, h('input', { type: 'date', id, value: value || '', onchange: (ev) => onChange(ev.target.value) }));

  /* ---------- reorder contact ---------- */
  function vendorLine() {
    const v = state.supplies.vendor || {};
    if (editVendor) {
      const f = { name: v.name || '', phone: v.phone || '' };
      return h('div', { class: 'row' },
        input('v-name', 'Reorder from', f.name, (x) => { f.name = x; }, { max: '120' }),
        input('v-phone', 'Phone', f.phone, (x) => { f.phone = x; }, { max: '40' }),
        h('button', { class: 'btn small', type: 'button', onclick: () => { const n = copy(); n.vendor = { name: f.name, phone: f.phone }; editVendor = false; commit(n, 'Saved.'); } }, 'Save'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { editVendor = false; paint(); } }, 'Cancel'));
    }
    const bits = [v.name, v.phone ? h('a', { href: `tel:${v.phone.replace(/[^\d+]/g, '')}` }, v.phone) : null].filter(Boolean);
    return h('div', { class: 'sub' }, h('strong', null, 'Reorder from: '), bits.length ? bits.flatMap((x, i) => (i ? [' · ', x] : [x])) : 'not set',
      ' ', h('button', { class: 'btn ghost small', type: 'button', onclick: () => { editVendor = true; paint(); } }, 'Edit'));
  }

  /* ---------- CPAP ---------- */
  function partRow(p) {
    const hist = state.supplies.cpap[p.key] || [];
    const info = dueInfo(p, hist, today);
    let badge = null, dueText = 'Not logged yet';
    if (info.next) {
      if (info.diff < 0) { dueText = `Was due ${mediumDate(info.next)}`; badge = h('span', { class: 'dueb over' }, `Overdue by ${-info.diff} ${-info.diff === 1 ? 'day' : 'days'}`); }
      else if (info.diff === 0) { dueText = `Due ${mediumDate(info.next)}`; badge = h('span', { class: 'dueb over' }, 'Due today'); }
      else { dueText = `Next due ${mediumDate(info.next)}`; badge = info.diff <= 3 ? h('span', { class: 'dueb' }, `Due in ${info.diff} ${info.diff === 1 ? 'day' : 'days'}`) : null; }
    }
    const log = (date, message) => {
      const n = copy();
      n.cpap[p.key] = [...new Set([date, ...hist])].sort().reverse();
      commit(n, message);
    };
    const pastIn = h('input', { type: 'date', id: `past-${p.key}`, max: today, 'aria-label': `Add an earlier date for ${p.label}` });
    return h('div', { class: 'part' },
      h('div', { class: 'medhead' }, h('strong', null, p.label), h('span', { class: 'sub' }, p.every), badge),
      h('div', { class: 'sub' }, info.last ? `Last changed ${mediumDate(info.last)}. ` : '', dueText),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => log(today, `${p.label} logged as changed today.`) }, 'Changed today')),
      h('details', { class: 'hist' }, h('summary', null, `History (${hist.length})`),
        h('div', { class: 'row', style: 'margin-top:6px' }, pastIn,
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (!isDateStr(pastIn.value)) { toast('Pick a date first.'); return; } log(pastIn.value, 'Added.'); } }, 'Add date')),
        h('ul', null, hist.map((d) => h('li', null, h('span', null, mediumDate(d)),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { const n = copy(); n.cpap[p.key] = hist.filter((x) => x !== d); commit(n, 'Removed.'); } }, 'Remove'))))));
  }

  const cpapCard = () => h('section', { class: 'card' }, h('h2', null, 'CPAP supplies'), vendorLine(), CPAP_PARTS.map(partRow));

  /* ---------- glasses ---------- */
  function glassesCard() {
    const g = state.supplies.glasses || {};
    if (editGlasses) {
      const f = { ...g };
      const bind = (k) => (v) => { f[k] = v; };
      const save = () => {
        const n = copy(); n.glasses = f; editGlasses = false; commit(n, 'Saved.');
      };
      return h('section', { class: 'card medform' }, h('h2', null, 'Eyeglasses prescription'),
        EYES.map(([eye, title]) => [h('h3', { class: 'eyetitle' }, title),
          h('div', { class: 'eyegrid' }, EYE_COLS.map(([c, label]) => input(`g-${eyeKey(eye, c)}`, label, f[eyeKey(eye, c)], bind(eyeKey(eye, c)), { ph: c === 'axis' ? '0–180' : '' })))]),
        h('div', { class: 'row', style: 'margin-top:8px' }, input('g-pd', 'PD (distance)', f.pd, bind('pd'), { ph: '63' }), input('g-pdn', 'PD (near, optional)', f.pdNear, bind('pdNear'))),
        h('div', { class: 'row' }, dateIn('g-exam', 'Exam date', f.examDate, bind('examDate')), dateIn('g-exp', 'Expires', f.expires, bind('expires'))),
        input('g-doc', 'Prescriber', f.prescriber, bind('prescriber'), { max: '120' }),
        h('label', { class: 'field', for: 'g-note' }, 'Notes', h('textarea', { id: 'g-note', maxlength: '1000', placeholder: 'Lens type, coatings, frame size', oninput: (ev) => { f.note = ev.target.value; } }, f.note || '')),
        h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: save }, 'Save'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { editGlasses = false; paint(); } }, 'Cancel')));
    }
    const has = Object.keys(g).length > 0;
    const cell = (k) => g[k] || h('span', { class: 'dim' }, '–');
    return h('section', { class: 'card' }, h('h2', null, 'Eyeglasses prescription'),
      has ? [
        h('div', { class: 'tablewrap' }, h('table', { class: 'mtable' },
          h('thead', null, h('tr', null, h('th', null, ''), EYE_COLS.map(([, l]) => h('th', { class: 'num' }, l)))),
          h('tbody', null, EYES.map(([eye, title]) => h('tr', null, h('th', { scope: 'row' }, title), EYE_COLS.map(([c]) => h('td', { class: 'num' }, cell(eyeKey(eye, c))))))))),
        h('div', { class: 'sub', style: 'margin-top:8px' }, [
          g.pd ? `PD ${g.pd}${g.pdNear ? ` (near ${g.pdNear})` : ''}` : null,
          g.examDate ? `Exam ${mediumDate(g.examDate)}` : null,
          g.expires ? `Expires ${mediumDate(g.expires)}` : null,
          g.prescriber,
        ].filter(Boolean).join(' · ')),
        g.note ? h('div', { class: 'sub medn' }, g.note) : null,
      ] : h('p', { class: 'empty' }, 'Nothing saved yet.'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { editGlasses = true; paint(); } }, has ? 'Edit' : 'Add prescription')));
  }

  /* ---------- compression stockings ---------- */
  function stockingForm(s) {
    const f = { brand: s.brand || '', strength: s.strength || '', size: s.size || '', style: s.style || '', note: s.note || '' };
    const bind = (k) => (v) => { f[k] = v; };
    const save = () => {
      if (!Object.values(f).some((v) => v.trim())) { toast('Fill in at least one detail.'); return; }
      const n = copy();
      const item = { ...s, ...f };
      n.stockings = s.id ? n.stockings.map((x) => (x.id === s.id ? item : x)) : [...n.stockings, item];
      editing = null;
      commit(n, s.id ? 'Saved.' : 'Added.');
    };
    return h('div', { class: 'card medform' }, h('h3', null, s.id ? 'Edit pair' : 'Add a pair'),
      h('div', { class: 'row' }, input('s-brand', 'Brand', f.brand, bind('brand'), { max: '120' }), input('s-strength', 'Strength', f.strength, bind('strength'), { max: '60', ph: '20–30 mmHg' })),
      h('div', { class: 'row' }, input('s-size', 'Size', f.size, bind('size'), { max: '60' }), input('s-style', 'Style', f.style, bind('style'), { max: '120', ph: 'Knee-high, closed toe' })),
      h('label', { class: 'field', for: 's-note' }, 'Notes', h('textarea', { id: 's-note', maxlength: '1000', oninput: (ev) => { f.note = ev.target.value; } }, f.note)),
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: save }, s.id ? 'Save changes' : 'Add'), h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = null; paint(); } }, 'Cancel')));
  }
  function stockingItem(s) {
    if (editing === s.id) return stockingForm(s);
    const facts = [['Strength', s.strength], ['Size', s.size], ['Style', s.style]].filter(([, v]) => v);
    return h('div', { class: 'pair-item' },
      h('div', { class: 'medhead' }, h('strong', null, s.brand || 'Compression stockings')),
      facts.map(([k, v]) => h('div', { class: 'sub' }, h('strong', null, `${k}: `), v)),
      s.note ? h('div', { class: 'sub medn' }, s.note) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { editing = s.id; paint(); } }, 'Edit'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (confirm('Remove this pair from the list?')) { const n = copy(); n.stockings = n.stockings.filter((x) => x.id !== s.id); commit(n, 'Removed.'); } } }, 'Remove')));
  }
  function stockingsCard() {
    const list = state.supplies.stockings || [];
    return h('section', { class: 'card' }, h('h2', null, 'Compression stockings'), vendorLine(),
      list.length ? list.map(stockingItem) : (editing === 'new' ? null : h('p', { class: 'empty' }, 'No pairs saved yet.')),
      editing === 'new' ? stockingForm({}) : h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { editing = 'new'; paint(); } }, '+ Add a pair')));
  }

  function paint() {
    box.replaceChildren(cpapCard(), glassesCard(), stockingsCard());
    if (editing || editGlasses || editVendor) box.querySelector('.medform input, .row input')?.focus({ preventScroll: false });
  }
  shell('supplies', h('section', { class: 'card' }, h('h1', { class: 'pagetitle' }, 'Supplies'), h('p', { class: 'sub' }, 'CPAP replacement schedule, glasses prescription, and compression stockings.')), box);
  paint();
}
