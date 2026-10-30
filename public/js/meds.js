// Medications and supplements: add, change, stop (with an end date), remove. No daily check-offs.
import { h, todayStr, mediumDate, isDateStr } from './util.js';
import { state, shell, saveMeds, toast } from './core.js';
import { MED_CATEGORIES, MED_FREQUENCIES } from './fields.js';

export function viewMeds() {
  let editing = null; // id of the item being edited, or 'new'
  let openId = null; // id of the item whose details are showing
  let sortBy = 'name'; // 'name' or 'category'
  const today = todayStr();
  const active = (m) => !m.end || m.end > today;
  const byName = (a, b) => a.name.localeCompare(b.name);

  const listBox = h('div', { class: 'grid', style: 'display:grid;gap:16px' });

  async function commit(items, message) {
    if (await saveMeds(items)) { if (message) toast(message); editing = null; paint(); }
  }

  function choose(id, label, options, value, onchange) {
    return h('label', { class: 'field grow', for: id }, label,
      h('select', { id, onchange }, [
        h('option', { value: '', selected: options.includes(value) ? null : true }, 'Choose…'),
        ...options.map((o) => h('option', { value: o, selected: o === value ? true : null }, o)),
      ]));
  }

  function form(m) {
    const f = { name: m.name || '', dose: m.dose || '', schedule: m.schedule || '', category: m.category || '', frequency: m.frequency || '', note: m.note || '', start: m.start || (m.id ? '' : today), end: m.end || '' };
    const bind = (k) => (ev) => { f[k] = ev.target.value; };
    const nameIn = h('input', { type: 'text', id: 'med-name', maxlength: '120', placeholder: 'Name, e.g. Vitamin D', value: f.name, oninput: bind('name') });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (!f.name.trim()) { toast('Give it a name first.'); nameIn.focus(); return; }
      const item = { ...m, name: f.name, dose: f.dose, schedule: f.schedule, category: f.category, frequency: f.frequency, note: f.note, start: isDateStr(f.start) ? f.start : undefined, end: isDateStr(f.end) ? f.end : undefined };
      if (!item.start) delete item.start;
      if (!item.end) delete item.end;
      if (item.start && item.end && item.end < item.start) { toast('The end date is before the start date.'); return; }
      const items = m.id ? state.meds.map((x) => (x.id === m.id ? item : x)) : [...state.meds, item];
      commit(items, m.id ? 'Saved.' : 'Added.');
    } }, m.id ? 'Save changes' : 'Add');
    return h('div', { class: 'card medform' },
      h('h2', null, m.id ? 'Edit' : 'Add a medication or supplement'),
      h('label', { class: 'field', for: 'med-name' }, 'Name', nameIn),
      h('div', { class: 'row' },
        choose('med-cat', 'Category', MED_CATEGORIES, f.category, bind('category')),
        choose('med-freq', 'Frequency', MED_FREQUENCIES, f.frequency, bind('frequency'))),
      h('div', { class: 'row' },
        h('label', { class: 'field grow', for: 'med-dose' }, 'Dose', h('input', { type: 'text', id: 'med-dose', maxlength: '120', placeholder: '2000 IU', value: f.dose, oninput: bind('dose') })),
        h('label', { class: 'field grow', for: 'med-sched' }, 'When', h('input', { type: 'text', id: 'med-sched', maxlength: '200', placeholder: 'Morning with food', value: f.schedule, oninput: bind('schedule') }))),
      h('div', { class: 'row' },
        h('label', { class: 'field grow', for: 'med-start' }, 'Started', h('input', { type: 'date', id: 'med-start', value: f.start, max: today, onchange: bind('start') })),
        h('label', { class: 'field grow', for: 'med-end' }, 'Stopped (optional)', h('input', { type: 'date', id: 'med-end', value: f.end, onchange: bind('end') }))),
      h('label', { class: 'field', for: 'med-note' }, 'Notes', h('textarea', { id: 'med-note', maxlength: '1000', placeholder: 'Prescriber, reason, how it feels', oninput: bind('note') }, f.note)),
      h('div', { class: 'row' }, save, h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = null; paint(); } }, 'Cancel')));
  }

  // Collapsed list row: name, category, and the dose and frequency. Tap to open.
  function row(m) {
    const facts = [m.dose, m.frequency].filter(Boolean).join(' · ');
    return h('button', { class: `medrow${active(m) ? '' : ' past'}`, type: 'button', onclick: () => { openId = m.id; paint(); } },
      h('span', { class: 'medhead' }, h('strong', null, m.name), m.category ? h('span', { class: 'chip' }, m.category) : null),
      facts ? h('span', { class: 'sub' }, facts) : null);
  }

  // Opened row: everything, including notes, with the actions.
  function details(m) {
    const facts = [['Category', m.category], ['Frequency', m.frequency], ['Dose', m.dose], ['When', m.schedule]].filter(([, v]) => v);
    const span = m.start || m.end ? `${m.start ? `Since ${mediumDate(m.start)}` : ''}${m.end ? `${m.start ? ', ' : ''}stopped ${mediumDate(m.end)}` : ''}` : '';
    return h('div', { class: 'med' },
      h('div', { class: 'medhead' }, h('strong', null, m.name)),
      ...facts.map(([k, v]) => h('div', { class: 'sub' }, h('strong', null, `${k}: `), v)),
      span ? h('div', { class: 'sub' }, span) : null,
      m.note ? h('div', { class: 'sub medn' }, m.note) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => { editing = m.id; paint(); } }, 'Edit'),
        active(m)
          ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => commit(state.meds.map((x) => (x.id === m.id ? { ...x, end: today } : x)), 'Marked as stopped today. Change the date with Edit.') }, 'Stop')
          : h('button', { class: 'btn ghost small', type: 'button', onclick: () => commit(state.meds.map((x) => { if (x.id !== m.id) return x; const { end, ...rest } = x; return rest; }), 'Restarted.') }, 'Restart'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (confirm(`Remove ${m.name} from the list?`)) { openId = null; commit(state.meds.filter((x) => x.id !== m.id), 'Removed.'); } } }, 'Remove'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { openId = null; paint(); } }, 'Close')));
  }

  function render(m) {
    if (editing === m.id) return form(m);
    if (openId === m.id) return details(m);
    return row(m);
  }

  // Sort by name, or by category in the order of the category list (unlabelled last), with a heading per category.
  function sortItems(list) {
    if (sortBy !== 'category') return [...list].sort(byName);
    const rank = (m) => { const i = MED_CATEGORIES.indexOf(m.category); return i < 0 ? MED_CATEGORIES.length : i; };
    return [...list].sort((a, b) => rank(a) - rank(b) || byName(a, b));
  }
  function grouped(items) {
    if (sortBy !== 'category') return items.map(render);
    const out = [];
    let last = null;
    for (const m of items) {
      const cat = m.category || 'No category';
      if (cat !== last) { out.push(h('h3', { class: 'mgroup' }, cat)); last = cat; }
      out.push(render(m));
    }
    return out;
  }

  function paint() {
    const cur = sortItems(state.meds.filter(active));
    const past = state.meds.filter((m) => !active(m));
    const sorter = h('select', { id: 'med-sort', class: 'sortsel', 'aria-label': 'Sort medications', onchange: (ev) => { sortBy = ev.target.value; paint(); } },
      [['name', 'Name'], ['category', 'Category']].map(([v, l]) => h('option', { value: v, selected: sortBy === v ? true : null }, l)));
    listBox.replaceChildren(
      editing === 'new' ? form({}) : h('button', { class: 'btn', type: 'button', onclick: () => { editing = 'new'; paint(); document.getElementById('med-name')?.focus(); } }, '+ Add medication or supplement'),
      h('section', { class: 'card' },
        h('div', { class: 'row' }, h('h2', { class: 'grow' }, 'Taking now'), cur.length ? h('span', { class: 'sub' }, 'Sort by') : null, cur.length ? sorter : null),
        cur.length ? grouped(cur) : h('p', { class: 'empty' }, 'Nothing listed yet.')),
      ...(past.length ? [h('section', { class: 'card' }, h('h2', null, 'Stopped'), past.sort((a, b) => (b.end || '').localeCompare(a.end || '')).map(render))] : []));
    if (editing) listBox.querySelector('input')?.focus({ preventScroll: false });
  }
  shell('meds', h('section', { class: 'card' }, h('h1', { class: 'pagetitle' }, 'Medications and supplements'), h('p', { class: 'sub' }, 'A list for reference, with start and stop dates.')), listBox);
  paint();
}
