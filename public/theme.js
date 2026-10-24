// Applies a saved light/dark choice before the page paints, so there is no flash.
try {
  var t = localStorage.getItem('dxlvi.theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) { /* storage unavailable: follow the device setting */ }
