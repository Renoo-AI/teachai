/* Access-code page: sends the code to the server, which sets the access cookie, then opens the app. */
(function () {
  var form = document.getElementById('gate-form');
  if (!form) return;
  var input = form.elements.code, msg = form.querySelector('.gate-msg'), btn = form.querySelector('button');
  var L = function (k) { return (window.SiteLang && window.SiteLang.t(k)) || ''; };

  // Only same-site destinations: the app or an exam link.
  var next = new URLSearchParams(location.search).get('next') || '/app';
  if (!/^\/(app|e\/[a-z0-9]{10})$/.test(next)) next = '/app';

  function say(text, cls) { msg.textContent = text; msg.className = 'gate-msg ' + (cls || ''); }

  // A code can be pasted with spaces or in lower case; show it the way it is read.
  input.addEventListener('input', function () { input.value = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = input.value.trim();
    if (code.replace(/-/g, '').length < 6) { say(L('access.bad'), 'bad'); input.focus(); return; }
    btn.disabled = true; say(L('access.wait'));
    fetch('/api/access/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.j && res.j.ok) { say(L('access.ok'), 'ok'); location.replace(next); return; }
        say(L(res.status === 401 ? 'access.bad' : 'access.err'), 'bad'); btn.disabled = false; input.select();
      })
      .catch(function () { say(L('access.err'), 'bad'); btn.disabled = false; });
  });
  input.focus();
})();
