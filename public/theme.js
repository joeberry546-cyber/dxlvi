// Applies a saved theme choice before the page paints, so there is no flash.
try {
  var t = localStorage.getItem('dxlvi.theme');
  if (['light', 'dark', 'blush', 'forest', 'sage', 'slate', 'terracotta', 'plum'].indexOf(t) !== -1) document.documentElement.dataset.theme = t;
} catch (e) { /* storage unavailable: follow the device setting */ }
