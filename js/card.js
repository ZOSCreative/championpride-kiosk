/* Sitter instruction card - shared by operator.html (step 5) and sitter.html (printable A5).
   Illustrations are generated elsewhere into /home/claude/pocket-art/ (step-01.png ... step-08.png).
   Each slot tries art/step-0N.png (copied next to the pages for deployment) then ../pocket-art/step-0N.png,
   and falls back to a plain numbered text tile if neither exists. Never blocks. */
(function (g) {
  'use strict';
  var STEPS = [
    { n: 1, art: 'step-04.jpg', t: 'Phone in your front pocket.', d: 'Screen toward your body. Top of the phone up.' },
    { n: 2, art: 'step-05.jpg', t: 'Sit tall on the saddle.', d: 'Hands on the reins. Let your hips move naturally.' },
    { n: 3, art: 'step-06.jpg', t: 'Press Start on your phone.', d: 'Then ride as you normally would, for about a minute.' },
    { n: 4, art: 'step-07.jpg', t: 'Watch the screen.', d: 'Press Stop on your phone when the time is up.' }
  ];
  var SOURCES = ['art/', '../pocket-art/'];

  function render(el, opts) {
    opts = opts || {};
    el.innerHTML = '';
    el.classList.add('scard');
    STEPS.forEach(function (s) {
      var row = document.createElement('div'); row.className = 'srow';
      var fig = document.createElement('div'); fig.className = 'sfig';
      var num = document.createElement('span'); num.className = 'snum'; num.textContent = s.n; fig.appendChild(num);
      var img = new Image(), i = 0; img.alt = ''; img.decoding = 'async';
      img.onload = function () { fig.classList.add('has-art'); fig.insertBefore(img, num); };
      img.onerror = function () { i++; if (i < SOURCES.length) img.src = SOURCES[i] + s.art; };
      img.src = SOURCES[0] + s.art;
      var tx = document.createElement('div'); tx.className = 'stxt';
      tx.innerHTML = '<div class="st"></div><div class="sd"></div>';
      tx.firstChild.textContent = s.t; tx.lastChild.textContent = s.d;
      row.appendChild(fig); row.appendChild(tx); el.appendChild(row);
    });
  }
  g.PK = g.PK || {}; g.PK.card = { render: render, steps: STEPS };
})(window);
