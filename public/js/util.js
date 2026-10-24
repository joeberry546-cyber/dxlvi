// Small helpers: building DOM safely, working with dates, reading CSV.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = Boolean(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const NS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => fmtDate(new Date());
export const parseDate = (str) => { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (str, n) => { const d = parseDate(str); d.setDate(d.getDate() + n); return fmtDate(d); };
export const utcDay = (str) => { const [y, m, d] = str.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export const fromUtcDay = (n) => new Date(n * 86400000);
export const isDateStr = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');

export const longDate = (str) => parseDate(str).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const mediumDate = (str) => parseDate(str).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
export const monthName = (ym) => parseDate(ym + '-01').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export function yearsMonthsSince(startStr, endStr) {
  const a = parseDate(startStr), b = parseDate(endStr);
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [];
  if (y) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'month' : 'months'}`);
  return parts.join(', ') || 'less than a month';
}

export function ageOn(birthday, onStr) {
  const b = parseDate(birthday), t = parseDate(onStr);
  let age = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age -= 1;
  return age;
}

export const round1 = (n) => Math.round(n * 10) / 10;
export const fmt1 = (n) => round1(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
export const bmi = (lb, inches) => (703 * lb) / (inches * inches);
export const feetInches = (inches) => {
  const ft = Math.floor(inches / 12);
  return `${ft} ft ${round1(inches - ft * 12)} in`;
};

// Minimal CSV reader: handles quoted cells, commas inside quotes, and CRLF.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((x) => x.replace(/^﻿/, '').trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? '').trim()])));
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
