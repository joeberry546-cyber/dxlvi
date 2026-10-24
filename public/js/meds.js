// Medications and supplements: add, change, stop (with an end date), remove. No daily check-offs.
import { h, todayStr, mediumDate, isDateStr } from './util.js';
import { state, shell, saveMeds, toast } from './core.js';

export function viewMeds() {
  let editing = null; // id of the item being edited, or 'new'
  const today = todayStr();
  const active = (m) => !m.end || m.end > today;

  const listBox = h('div', { class: 'grid', style: 'display:grid;gap:16px' });

  async function commit(items, message) {
    if (await saveMeds(items)) { if (message) toast(message); editing = null; paint(); }
  }

  function form(m) {
    const f = { name: m.name || '', dose: m.dose || '', schedule: m.schedule || '', note: m.note || '', start: m.start || (m.id ? '' : today), end: m.end || '' };
    const bind = (k) => (ev) => { f[k] = ev.target.value; };
    const nameIn = h('input', { type: 'text', id: 'med-name', maxlength: '120', placeholder: 'Name, e.g. Vitamin D', value: f.name, oninput: bind('name') });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => {
      if (!f.name.trim()) { toast('Give it a name first.'); nameIn.focus(); return; }
      const item = { ...m, name: f.name, dose: f.dose, schedule: f.schedule, note: f.note, start: isDateStr(f.start) ? f.start : undefined, end: isDateStr(f.end) ? f.end : undefined };
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
        h('label', { class: 'field grow', for: 'med-dose' }, 'Dose', h('input', { type: 'text', id: 'med-dose', maxlength: '120', placeholder: '2000 IU', value: f.dose, oninput: bind('dose') })),
        h('label', { class: 'field grow', for: 'med-sched' }, 'When', h('input', { type: 'text', id: 'med-sched', maxlength: '200', placeholder: 'Morning with food', value: f.schedule, oninput: bind('schedule') }))),
      h('div', { class: 'row' },
        h('label', { class: 'field grow', for: 'med-start' }, 'Started', h('input', { type: 'date', id: 'med-start', value: f.start, max: today, onchange: bind('start') })),
        h('label', { class: 'field grow', for: 'med-end' }, 'Stopped (optional)', h('input', { type: 'date', id: 'med-end', value: f.end, onchange: bind('end') }))),
      h('label', { class: 'field', for: 'med-note' }, 'Notes', h('textarea', { id: 'med-note', maxlength: '1000', placeholder: 'Prescriber, reason, how it feels', oninput: bind('note') }, f.note)),
      h('div', { class: 'row' }, save, h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = null; paint(); } }, 'Cancel')));
  }

  function card(m) {
    const facts = [m.dose, m.schedule].filter(Boolean).join(' · ');
    const span = m.start || m.end ? `${m.start ? `Since ${mediumDate(m.start)}` : ''}${m.end ? `${m.start ? ', ' : ''}stopped ${mediumDate(m.end)}` : ''}` : '';
    return h('div', { class: `med${active(m) ? '' : ' past'}` },
      h('div', { class: 'medhead' }, h('strong', null, m.name), facts ? h('span', { class: 'sub' }, facts) : null),
      span ? h('div', { class: 'sub' }, span) : null,
      m.note ? h('div', { class: 'sub medn' }, m.note) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { editing = m.id; paint(); } }, 'Edit'),
        active(m)
          ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => commit(state.meds.map((x) => (x.id === m.id ? { ...x, end: today } : x)), 'Marked as stopped today. Change the date with Edit.') }, 'Stop')
          : h('button', { class: 'btn ghost small', type: 'button', onclick: () => commit(state.meds.map((x) => { if (x.id !== m.id) return x; const { end, ...rest } = x; return rest; }), 'Restarted.') }, 'Restart'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: () => { if (confirm(`Remove ${m.name} from the list?`)) commit(state.meds.filter((x) => x.id !== m.id), 'Removed.'); } }, 'Remove')));
  }

  function paint() {
    const cur = state.meds.filter(active), past = state.meds.filter((m) => !active(m));
    const byName = (a, b) => a.name.localeCompare(b.name);
    const render = (m) => (editing === m.id ? form(m) : card(m));
    listBox.replaceChildren(
      editing === 'new' ? form({}) : h('button', { class: 'btn', type: 'button', onclick: () => { editing = 'new'; paint(); document.getElementById('med-name')?.focus(); } }, '+ Add medication or supplement'),
      h('section', { class: 'card' }, h('h2', null, 'Taking now'), cur.length ? cur.sort(byName).map(render) : h('p', { class: 'empty' }, 'Nothing listed yet.')),
      ...(past.length ? [h('section', { class: 'card' }, h('h2', null, 'Stopped'), past.sort((a, b) => (b.end || '').localeCompare(a.end || '')).map(render))] : []));
    if (editing) listBox.querySelector('input')?.focus({ preventScroll: false });
  }
  shell('meds', h('section', { class: 'card' }, h('h1', { class: 'pagetitle' }, 'Medications and supplements'), h('p', { class: 'sub' }, 'A list for reference, with start and stop dates. Nothing to check off each day.')), listBox);
  paint();
}
