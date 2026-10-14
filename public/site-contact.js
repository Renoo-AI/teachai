/* Contact page: validates, posts to /api/contact and reports the result in the visitor's language. */
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var msg = form.querySelector('.gate-msg'), btn = form.querySelector('button[type="submit"]');
  var L = function (k) { return (window.SiteLang && window.SiteLang.t(k)) || ''; };
  function say(text, cls) { msg.textContent = text; msg.className = 'gate-msg ' + (cls || ''); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.elements.email.value.trim(), message = form.elements.message.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || message.length < 10) { say(L('contact.bad'), 'bad'); return; }
    btn.disabled = true;
    fetch('/api/contact', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.elements.name.value.trim(), email: email, message: message, website: form.elements.website.value, lang: window.SiteLang ? window.SiteLang.lang : 'en' }),
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); })
      .then(function (res) {
        if (res.ok) { say(L('contact.ok'), 'ok'); form.reset(); }
        else say(L(res.status === 400 ? 'contact.bad' : 'contact.err'), 'bad');
      })
      .catch(function () { say(L('contact.err'), 'bad'); })
      .then(function () { btn.disabled = false; });
  });
})();
