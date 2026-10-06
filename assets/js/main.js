(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 楼层切换：首页 <-> 某一层 ---------- */
  var peak = document.getElementById('top');
  var mt = document.getElementById('mt');
  var deck = document.getElementById('deck');
  var deckNav = document.getElementById('deck-nav');
  var backBtn = document.getElementById('nav-back');
  var camps = Array.prototype.slice.call(document.querySelectorAll('.camp'));
  var legend = Array.prototype.slice.call(document.querySelectorAll('.mt-legend button'));
  var panels = Array.prototype.slice.call(document.querySelectorAll('.panel'));

  var state = 'home';
  var MOVE = 520;      /* 标签飞行时长 */
  var CROSS = 340;     /* 交叉淡化时长 */
  var GLIDE = 'cubic-bezier(.4,0,.2,1)';   /* 两端都有加减速，比一头猛冲的缓动顺 */
  var foot = document.querySelector('footer');

  /* 连点不再被丢弃：新一次切换到来时，先把上一次的收尾立刻做完，
     再以当前真实状态为起点继续。旧的硬锁（busy）会整整吞掉 340ms 内的点击 */
  var pendingFn = null, pendingId = null;
  var running = [];

  function flush() {
    if (pendingFn) {
      clearTimeout(pendingId);
      var f = pendingFn;
      pendingFn = null;
      f();                       /* 收尾函数必须是幂等的 */
    }
    running.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    running = [];
  }

  /* 只注册本次收尾。注意：这里绝不能调 flush() —— 那会把本轮刚发起的
     飞行动画一起 cancel 掉，营地就不飞了，直接出现在左栏 */
  function schedule(fn, ms) {
    pendingFn = fn;
    pendingId = setTimeout(function () { pendingFn = null; fn(); }, reduce ? 0 : ms);
  }

  /* FLIP：先量旧位置，改 DOM，再从旧位置动画回新位置
     读写严格分开：先批量读 rect + computed transform，再批量写 animate
     —— 交替读写会每个元素强制一次同步布局 */
  function flip(nodes, mutate) {
    if (reduce) { mutate(); return; }

    var first = nodes.map(function (n) { return n.getBoundingClientRect(); });
    mutate();

    var last = nodes.map(function (n) { return n.getBoundingClientRect(); });
    var base = nodes.map(function (n) { return getComputedStyle(n).transform; });

    nodes.forEach(function (n, i) {
      var f = first[i];
      var l = last[i];
      var dx = (f.left + f.width / 2) - (l.left + l.width / 2);
      var dy = (f.top + f.height / 2) - (l.top + l.height / 2);
      var b = base[i] === 'none' ? '' : base[i];
      n.style.willChange = 'transform';    /* 只在飞行的这一刻提升图层 */
      var a = n.animate(
        [
          { transform: 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) ' + b },
          { transform: b === '' ? 'none' : b }
        ],
        { duration: MOVE, easing: GLIDE }
      );
      a.onfinish = a.oncancel = function () { n.style.willChange = ''; };
      running.push(a);
    });
  }

  function mark(id) {
    camps.forEach(function (c) {
      var on = c.getAttribute('data-go') === id;
      c.classList.toggle('is-on', on);
      if (on) { c.setAttribute('aria-current', 'true'); }
      else { c.removeAttribute('aria-current'); }
    });
  }

  /* 面板刚从 display:none 变可见时 IntersectionObserver 不一定触发，兜底点亮卡片
     错落交给 CSS 的 transition-delay，一次加完，不用一串 setTimeout */
  function light(id) {
    var panel = document.getElementById(id);
    if (!panel) return;
    var inCards = Array.prototype.slice.call(panel.querySelectorAll('.card'));
    requestAnimationFrame(function () {
      inCards.forEach(function (c) { c.classList.add('in'); });
      /* 面板刚从 display:none 显形，几何要重算一次，
         否则两侧的缩小虚化还是上一次的量（陈列模式则是行高算不出来） */
      if (rail && panel.contains(rail)) {
        if (isGrid()) syncGrid(); else { syncPad(); rail.scrollLeft = 0; fx(); }
      }
    });
  }

  function toTop() {
    if (window.pageYOffset) window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* 首页 -> 某层：域名山淡出，营地飞到左栏 */
  function enter(id) {
    flush();
    state = id;

    /* 首屏浮起来脱离文档流，deck 立刻补上它的位置 —— 全程没有布局跳变 */
    peak.classList.add('floating');
    peak.classList.remove('leaving');

    flip(camps, function () {
      deck.hidden = false;
      deck.classList.remove('floating');
      camps.forEach(function (c) {
        c.classList.add('settled');   /* 之后回首页不再重播入场动画 */
        deckNav.appendChild(c);
      });
    });

    /* 交叉淡化：旧层淡出、新层淡入、营地在飞，三件事同时发生 */
    peak.classList.add('leaving');
    void deck.offsetWidth;
    deck.classList.add('in');

    backBtn.hidden = false;
    if (foot) foot.hidden = false;
    panels.forEach(function (p) { p.classList.toggle('is-on', p.id === id); });
    mark(id);
    toTop();
    light(id);
    syncLead();          /* 营地已落位，按标签位置把内容往下错开 */

    schedule(function () {
      peak.hidden = true;
      peak.classList.remove('floating', 'leaving');
    }, CROSS);
  }

  /* 层 -> 另一层：营地不动，只有内容交叉淡化，因此非常轻 */
  function swap(id) {
    flush();
    var prev = document.querySelector('.panel.is-on');
    state = id;

    if (prev && prev.id !== id) {
      prev.classList.remove('is-on');
      prev.classList.add('leaving');
    }

    var next = document.getElementById(id);
    if (next) {
      next.classList.remove('leaving');
      next.classList.add('is-on');
    }

    mark(id);
    toTop();
    light(id);
    syncLead();

    if (prev) {
      schedule(function () { prev.classList.remove('leaving'); }, CROSS);
    }
  }

  /* 某层 -> 首页 */
  function home() {
    if (state === 'home') return;
    flush();
    state = 'home';

    /* 营地飞回山上；deck 浮起来淡出，peak 补回文档流 */
    flip(camps, function () {
      deck.classList.add('floating');
      peak.hidden = false;
      peak.classList.remove('floating');
      peak.classList.add('leaving');
      void peak.offsetHeight;          /* 先把 opacity:0 落地，下一步才能过渡回来 */
      camps.forEach(function (c) { mt.appendChild(c); });
    });

    peak.classList.remove('leaving');  /* 首屏淡入 */
    deck.classList.remove('in');       /* 内容淡出 */

    camps.forEach(function (c) {
      c.classList.remove('is-on');
      c.removeAttribute('aria-current');
    });
    panels.forEach(function (p) {
      p.classList.remove('is-on');
      p.classList.remove('leaving');
    });
    backBtn.hidden = true;
    if (foot) foot.hidden = true;
    toTop();

    schedule(function () {
      deck.hidden = true;
      deck.classList.remove('floating');
    }, CROSS);
  }

  function go(id) {
    if (!id || id === state) return;
    if (state === 'home') enter(id);
    else swap(id);
  }

  camps.concat(legend).forEach(function (c) {
    c.addEventListener('click', function () { go(c.getAttribute('data-go')); });
  });
  if (backBtn) backBtn.addEventListener('click', home);

  var brand = document.querySelector('.brand');
  if (brand) {
    brand.addEventListener('click', function (e) { e.preventDefault(); home(); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state !== 'home') home();
  });

  /* ---------- 作品：分类筛选 ---------- */
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var rail = document.getElementById('rail');
  var empty = document.getElementById('empty');
  var workPanel = document.getElementById('work');
  var viewBtn = document.getElementById('view-toggle');

  /* 作品区两种视图并存，可随时切换（coverflow 那套代码完整保留）：
       grid = 陈列：每行 4 个，露出 2.3 行，纵向滚动
       rail = 轨道：横向 coverflow，两侧缩小转向 */
  var view = 'grid';
  try {
    var savedView = localStorage.getItem('cc-view');
    if (savedView === 'grid' || savedView === 'rail') view = savedView;
  } catch (e) {}
  function isGrid() { return view === 'grid'; }

  function apply(cat) {
    var shown = 0;
    cards.forEach(function (c) {
      var hit = cat === 'all' || c.getAttribute('data-cat') === cat;
      c.classList.toggle('hidden', !hit);
      if (hit) shown += 1;
    });
    if (empty) empty.hidden = shown !== 0;
    if (rail) {
      stopGlide();
      if (isGrid()) { rail.scrollTop = 0; syncGrid(); }
      else { syncPad(); rail.scrollLeft = 0; fx(); }
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      apply(chip.getAttribute('data-cat'));
    });
  });

  /* ---------- 作品：滚轮横滑 + 两侧缩小虚化 ---------- */
  var railCards = rail ? Array.prototype.slice.call(rail.querySelectorAll('.card')) : [];

  /* 惯性引擎：滚轮和按钮只累加目标值，rAF 逐帧逼近。
     直接改 scrollLeft 是一跳一跳的，逐帧逼近才有滑行的手感 */
  var glideTo = null, glideRaf = null, slideEnd = null, fxTick = false;

  function railMax() { return rail ? rail.scrollWidth - rail.clientWidth : 0; }
  function clampLeft(v) { return Math.max(0, Math.min(railMax(), v)); }

  function stopGlide() {
    if (glideRaf !== null) { cancelAnimationFrame(glideRaf); glideRaf = null; }
    glideTo = null;
  }

  function glide() {
    if (reduce) { rail.scrollLeft = glideTo; glideRaf = null; return; }
    var diff = glideTo - rail.scrollLeft;
    if (Math.abs(diff) < 0.6) { rail.scrollLeft = glideTo; glideRaf = null; return; }
    rail.scrollLeft += diff * 0.18;
    glideRaf = requestAnimationFrame(glide);
  }

  function push(delta) {
    glideTo = clampLeft((glideTo === null ? rail.scrollLeft : glideTo) + delta);
    if (glideRaf === null) glideRaf = requestAnimationFrame(glide);
  }

  /* ---------- 后三个营地：内容下移到「对应标签往下半个」的位置 ----------
     左栏的四个营地是竖排的，第二/三/四个各自往下挪一档，
     内容顶边对齐到那个标签的中心，再从标签引出波浪线指过去。
     偏移量按真实标签位置量，不写死（标签高度会随字号/换行变） */
  var LEAD_IDS = ['doing', 'trace', 'me'];
  var LEAD_DROP = 24;    /* 内容再往下一点的额外量：线走标签中心，内容比它低一点 */

  /* offsetTop 链：不受 transform 影响，所以面板入场动画期间也量得准 */
  function docTop(el) {
    var y = 0;
    while (el) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  function syncLead() {
    if (state === 'home' || !deckNav) return;
    LEAD_IDS.forEach(function (id) {
      var panel = document.getElementById(id);
      var camp = deckNav.querySelector('.camp[data-go="' + id + '"]');
      if (!panel || !camp) return;
      var mid = Math.round(docTop(camp) + camp.offsetHeight / 2 - docTop(panel));
      panel.style.setProperty('--lead-h', mid + 'px');            /* 线走标签中心 */
      panel.style.paddingTop = Math.max(16, mid + LEAD_DROP) + 'px'; /* 内容比它再低一点 */
    });
  }

  /* 首屏居中：左右各垫「半个可视宽 - 半张卡」，
     这样 scrollLeft = 0 时第一张卡正好在正中，且最后一张也能滚到正中。
     垫的是 padding —— 它是滚动内容的一部分，不会挡住卡片 */
  function syncPad() {
    if (!rail || isGrid()) return;     /* 陈列模式不需要两侧留白 */
    var first = rail.querySelector('.card:not(.hidden)');
    if (!first) return;
    var w = first.offsetWidth;            /* offsetWidth 不受 transform 影响 */
    var pad = Math.max(32, (rail.clientWidth - w) / 2);
    rail.style.paddingLeft = pad.toFixed(1) + 'px';
    rail.style.paddingRight = pad.toFixed(1) + 'px';
  }

  /* ---------- 视图切换：陈列 ⇄ 轨道 ---------- */

  /* 陈列柜一次露出的行数：2.3 —— 两整行 + 第三行露出三成，
     既暗示「下面还有」，又给每张卡留出放大的空间（行数少了，行就高了） */
  var GRID_ROWS = 2.3;
  function syncGrid() {
    if (!rail || !isGrid()) return;
    if (!rail.offsetParent) return;       /* 面板还藏着，量不到高度 */
    var first = rail.querySelector('.card:not(.hidden)');
    if (!first) return;
    rail.style.maxHeight = '';            /* 先还原才量得到自然行高 */
    var rowH = first.offsetHeight;
    var gap = parseFloat(getComputedStyle(rail).rowGap);
    if (isNaN(gap)) gap = 24;
    var gaps = Math.ceil(GRID_ROWS - 1);   /* 露出第三行的一角，第二、三行之间的间距也算进去 */
    var cs = getComputedStyle(rail);
    var pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    var want = rowH * GRID_ROWS + gap * gaps + pad;   /* max-height 是含内边距的，要算进去 */
    /* 高度不足的屏幕上退而求其次：容器贴着视口底，至少保证一行半的展示。
       页脚是 fixed 的，常驻占住底部，柜底正好落在页脚上缘（留 2px 呼吸） */
    var footH = foot && !foot.hidden ? foot.offsetHeight : 0;
    var avail = window.innerHeight - rail.getBoundingClientRect().top - footH - 2;
    rail.style.maxHeight = Math.max(Math.min(want, avail), rowH * 1.6 + gap).toFixed(1) + 'px';
  }

  /* 切到陈列时把 coverflow 写在 inline 上的那几个变量清掉，
     免得哪天 CSS 的 !important 失效就露馅 */
  function clearFx() {
    railCards.forEach(function (c) {
      var inner = c.querySelector('.card-inner');
      if (!inner) return;
      ['--sc', '--scb', '--tx', '--tz', '--py', 'opacity'].forEach(function (p) {
        inner.style.removeProperty(p);
      });
      c.style.removeProperty('z-index');
    });
  }

  function setView(v) {
    if (v !== 'grid' && v !== 'rail') return;
    view = v;
    var g = v === 'grid';
    stopGlide();
    rail.classList.toggle('grid', g);
    if (workPanel) workPanel.classList.toggle('is-grid', g);
    if (viewBtn) viewBtn.setAttribute('aria-label', g ? '切换为轨道模式' : '切换为陈列模式');

    if (g) {
      rail.style.paddingLeft = '';
      rail.style.paddingRight = '';
      clearFx();
      rail.scrollTop = 0;
      syncGrid();
      if (prev) prev.hidden = true;
      if (next) next.hidden = true;
    } else {
      rail.style.maxHeight = '';
      rail.scrollTop = 0;
      syncPad();
      if (prev) prev.hidden = false;
      if (next) next.hidden = false;
      fx();
    }
    try { localStorage.setItem('cc-view', v); } catch (e) {}
  }

  /* 轨道上一张卡的间距（卡宽 + gap），用来把「离中心多远」换算成「几张卡」 */
  function pitch() {
    var first = rail.querySelector('.card:not(.hidden)');
    var w = first ? first.offsetWidth : 320;
    var gap = parseFloat(getComputedStyle(rail).columnGap);
    if (isNaN(gap)) gap = parseFloat(getComputedStyle(rail).gap) || 24;
    return w + gap;
  }

  /* 离轨道中心越远 → 越小、越淡、越往后退、越往里翻 */
  function fx() {
    if (!rail || !railCards.length) return;
    if (isGrid()) return;                /* 陈列模式不做缩放/转向/淡出 */
    var rr = rail.getBoundingClientRect();
    var centerX = rr.left + rr.width / 2;
    var unit = pitch();

    for (var i = 0; i < railCards.length; i++) {
      var c = railCards[i];
      if (c.classList.contains('hidden')) continue;
      var inner = c.querySelector('.card-inner');
      if (!inner) continue;

      var cr = c.getBoundingClientRect();
      /* 用外层 .card 量，它不带 --tx 变换，所以不会自己反馈给自己 */
      var offset = (cr.left + cr.width / 2) - centerX;
      var raw = offset / unit;              /* 以「第几张」为单位，可正可负 */
      var ar = Math.abs(raw);
      var sign = raw < 0 ? -1 : 1;

      /* 缩放走指数衰减：1.04 → 0.75 → 0.66 → 0.63 …
         线性衰减做不到「第一档掉得多、之后快速收敛」，指数正好是这个形状。
         fall：正中 1，相邻 0.31，第二张 0.096 —— 越小表示离得越远 */
      var fall = Math.pow(0.31, ar);
      var sc = 0.62 + 0.42 * fall;
      var d = 1 - fall;                     /* 深度因子：正中 0 → 远处趋近 1 */

      /* 向中心收拢只留 8%：两侧卡缩放后的半宽 + 中心卡半宽 恒小于一个 pitch，
         所以永远不会叠到中心卡上（实测相邻间隙约 30px） */
      var tx = -offset * 0.08;

      inner.style.setProperty('--sc', sc.toFixed(3));
      inner.style.setProperty('--scb', sc.toFixed(3));   /* 悬停放大用的基准值 */
      inner.style.setProperty('--tz', (-100 * d).toFixed(1) + 'px');
      inner.style.setProperty('--tx', tx.toFixed(1) + 'px');
      inner.style.setProperty('--py', (sign * 26 * d).toFixed(2) + 'deg');
      inner.style.opacity = (0.45 + 0.55 * fall).toFixed(3);
      c.style.zIndex = String(60 - Math.round(d * 40));  /* 正中那张盖在上面 */
    }
  }

  function onRailScroll() {
    rail.classList.add('is-sliding');
    clearTimeout(slideEnd);
    slideEnd = setTimeout(function () { rail.classList.remove('is-sliding'); }, 140);
    if (fxTick) return;
    fxTick = true;
    requestAnimationFrame(function () { fxTick = false; fx(); });
  }

  /* 滚动是功能，不受「减少动效」门控 —— 之前写成 !reduce，
     系统关了动画效果的用户就整个没有滚轮和缩放虚化 */
  if (rail) {
    rail.addEventListener('scroll', onRailScroll, { passive: true });
    window.addEventListener('resize', function () {
      syncLead();
      if (isGrid()) syncGrid(); else { syncPad(); fx(); }
    });
  }

  /* 滚轮绑在整个 window 上：进入作品层后，整页任意位置滚动都横向推轨道，
     不用把光标精准放进那个卡片框里。
     只在「当前是作品层」且「轨道还有余量」时接管，否则把滚动权还给页面 */
  window.addEventListener('wheel', function (e) {
    if (state !== 'work' || !rail) return;
    if (isGrid()) return;                /* 陈列模式交给容器原生纵向滚动 */
    var max = railMax();
    if (max <= 1) return;
    /* 竖向滚轮也能横着滑；触控板横向手势优先 */
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    if (e.deltaMode === 1) d *= 16;          /* 按行滚动的老鼠标 */
    else if (e.deltaMode === 2) d *= 100;    /* 按页 */
    var cur = glideTo === null ? rail.scrollLeft : glideTo;
    /* 到头就把滚动权交还页面，别把人困在轨道里 */
    if ((d < 0 && cur <= 0.5) || (d > 0 && cur >= max - 0.5)) return;
    e.preventDefault();
    push(d * 1.1);
  }, { passive: false });

  /* ---------- 作品：轨道左右翻 ---------- */
  var prev = document.getElementById('rail-prev');
  var next = document.getElementById('rail-next');

  function step(dir) {
    if (!rail) return;
    var d = dir * pitch();          /* 一次挪一张，配合居中更好控制 */
    if (reduce) { rail.scrollLeft = clampLeft(rail.scrollLeft + d); return; }
    push(d);
  }
  if (prev) prev.addEventListener('click', function () { step(-1); });
  if (next) next.addEventListener('click', function () { step(1); });

  /* ---------- 作品：鼠标拖拽 ---------- */
  if (rail) {
    var down = false, startX = 0, startLeft = 0, moved = 0;

    rail.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      if (isGrid()) return;              /* 陈列模式不拖拽横滑 */
      down = true; moved = 0;
      stopGlide();                 /* 手一按下就接管，别和惯性抢 scrollLeft */
      startX = e.clientX;
      startLeft = rail.scrollLeft;
      rail.classList.add('dragging');
    });
    rail.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - startX;
      moved = Math.abs(dx);
      rail.scrollLeft = startLeft - dx;
    });
    function release() {
      if (!down) return;
      down = false;
      rail.classList.remove('dragging');
    }
    rail.addEventListener('pointerup', release);
    rail.addEventListener('pointerleave', release);
    rail.addEventListener('pointercancel', release);
    rail.addEventListener('click', function (e) {
      if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  /* ---------- 卡片入场：错落浮现 ---------- */
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en, i) {
        if (!en.isIntersecting) return;
        var el = en.target;
        setTimeout(function () { el.classList.add('in'); }, i * 90);
        io.unobserve(el);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    cards.forEach(function (c) { io.observe(c); });
  } else {
    cards.forEach(function (c) { c.classList.add('in'); });
  }

  /* ---------- 卡片 3D 倾斜 ---------- */
  if (fine && !reduce) {
    cards.forEach(function (card) {
      var inner = card.querySelector('.card-inner');
      if (!inner) return;

      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tilting');
        inner.style.setProperty('--ry', (px * 9).toFixed(2) + 'deg');
        inner.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('tilting');
        inner.style.setProperty('--ry', '0deg');
        inner.style.setProperty('--rx', '0deg');
      });
    });
  }

  /* ---------- 视图切换按钮 ---------- */
  if (viewBtn && rail) {
    viewBtn.addEventListener('click', function () {
      setView(isGrid() ? 'rail' : 'grid');
    });
    setView(view);          /* 面板此时还藏着，几何计算会在进层时补做 */
  }

  /* ---------- 页脚年份 ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
