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
        syncGrid();
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
  /* 作品区只有陈列模式：横向 coverflow 的「轨道模式」已移除。
     老版本存过的视图偏好顺手清掉，免得留着误导 */
  try { localStorage.removeItem('cc-view'); } catch (e) {}
  function apply(cat) {
    var shown = 0;
    cards.forEach(function (c) {
      var hit = cat === 'all' || c.getAttribute('data-cat') === cat;
      c.classList.toggle('hidden', !hit);
      if (hit) shown += 1;
    });
    if (empty) empty.hidden = shown !== 0;
    if (rail) { rail.scrollTop = 0; syncGrid(); }
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      chips.forEach(function (c) { c.classList.remove('is-on'); });
      chip.classList.add('is-on');
      apply(chip.getAttribute('data-cat'));
    });
  });

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

  /* 陈列柜一次露出的行数：2.3 —— 两整行 + 第三行露出三成，
     既暗示「下面还有」，又给每张卡留出放大的空间（行数少了，行就高了） */
  var GRID_ROWS = 2.3;
  function syncGrid() {
    if (!rail) return;
    if (!rail.offsetParent) return;       /* 面板还藏着，量不到高度 */
    var first = rail.querySelector('.card:not(.hidden)');
    if (!first) return;
    rail.style.maxHeight = '';            /* 先还原才量得到自然行高 */
    var rowH = first.offsetHeight;
    var gap = parseFloat(getComputedStyle(rail).rowGap);
    if (isNaN(gap)) gap = 24;
    var cs = getComputedStyle(rail);
    var pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    /* 只剩一张卡时，柜子就贴合内容高度：不然下面会拖一大片空白 */
    if (rail.querySelectorAll('.card:not(.hidden)').length <= 1) {
      rail.style.maxHeight = (rowH + pad).toFixed(1) + 'px';
      return;
    }
    var gaps = Math.ceil(GRID_ROWS - 1);   /* 露出第三行的一角，第二、三行之间的间距也算进去 */
    var want = rowH * GRID_ROWS + gap * gaps + pad;   /* max-height 是含内边距的，要算进去 */
    /* 高度不足的屏幕上退而求其次：容器贴着视口底，至少保证一行半的展示。
       页脚是 fixed 的，常驻占住底部，柜底正好落在页脚上缘（留 2px 呼吸） */
    var footH = foot && !foot.hidden ? foot.offsetHeight : 0;
    var avail = window.innerHeight - rail.getBoundingClientRect().top - footH - 2;
    rail.style.maxHeight = Math.max(Math.min(want, avail), rowH * 1.6 + gap).toFixed(1) + 'px';
  }

  /* 滚动时临时关掉过渡，免得 hover 放大动画跟滚动打架 */
  var slideEnd = null;
  function onRailScroll() {
    rail.classList.add('is-sliding');
    clearTimeout(slideEnd);
    slideEnd = setTimeout(function () { rail.classList.remove('is-sliding'); }, 140);
  }

  /* 滚动是功能，不受「减少动效」门控 —— 之前写成 !reduce，
     系统关了动画效果的用户就整个没有滚轮和缩放虚化 */
  if (rail) {
    rail.addEventListener('scroll', onRailScroll, { passive: true });
    window.addEventListener('resize', function () {
      syncLead();
      syncGrid();
    });
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

  /* 进场先把陈列柜高度算一次（面板显形前量不到，light() 里还会再算一次） */
  if (rail) syncGrid();

  /* ---------- 页脚年份 ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
