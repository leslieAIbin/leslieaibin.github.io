(function () {
  'use strict';

  var root = window.ORBITAL_ROOT || '/';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var header = document.querySelector('[data-header]');
  var navToggle = document.querySelector('[data-nav-toggle]');
  var nav = document.querySelector('[data-nav]');

  if (header && 'IntersectionObserver' in window) {
    var headerSentinel = document.createElement('span');
    headerSentinel.className = 'header-sentinel';
    headerSentinel.setAttribute('aria-hidden', 'true');
    document.body.prepend(headerSentinel);
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-scrolled', !entries[0].isIntersecting);
    }).observe(headerSentinel);
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = navToggle.getAttribute('aria-expanded') !== 'true';
      navToggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
    button.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('orbital-theme', next);
    });
  });

  var revealItems = document.querySelectorAll('.reveal');
  if (!reduceMotion && 'IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px' });
    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add('is-visible'); });
  }

  function setupWritingSearch() {
    var input = document.querySelector('[data-writing-search]');
    if (!input) return;
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-writing-item]'));
    var count = document.querySelector('[data-writing-count]');
    var empty = document.querySelector('[data-writing-empty]');

    function filter() {
      var query = input.value.trim().toLowerCase();
      var visible = 0;
      items.forEach(function (item) {
        var show = !query || item.dataset.search.indexOf(query) !== -1;
        item.hidden = !show;
        if (show) visible += 1;
      });
      if (count) count.textContent = String(visible);
      if (empty) empty.hidden = visible !== 0;
    }

    input.addEventListener('input', filter);
    document.addEventListener('keydown', function (event) {
      if (event.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) {
        event.preventDefault();
        input.focus();
      }
    });
  }

  function setupCodeCopy() {
    document.querySelectorAll('.article-content pre').forEach(function (pre) {
      if (pre.closest('.gutter') || pre.querySelector('.code-copy')) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'code-copy';
      button.textContent = 'COPY';
      button.addEventListener('click', function () {
        navigator.clipboard.writeText(pre.innerText).then(function () {
          button.textContent = 'COPIED';
          window.setTimeout(function () { button.textContent = 'COPY'; }, 1500);
        });
      });
      pre.appendChild(button);
    });
  }

  function setupAsk() {
    var dialog = document.getElementById('ask-leslie');
    if (!dialog) return;
    var input = dialog.querySelector('[data-ask-input]');
    var form = dialog.querySelector('[data-ask-form]');
    var results = dialog.querySelector('[data-ask-results]');
    var knowledge = null;
    var loading = null;

    function open() {
      if (!dialog.open) dialog.showModal();
      window.setTimeout(function () { input.focus(); }, 30);
    }

    function close() { if (dialog.open) dialog.close(); }

    document.querySelectorAll('[data-ask-open]').forEach(function (button) { button.addEventListener('click', open); });
    dialog.querySelector('[data-ask-close]').addEventListener('click', close);
    dialog.addEventListener('click', function (event) { if (event.target === dialog) close(); });
    document.addEventListener('keydown', function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); open(); }
    });

    dialog.querySelectorAll('[data-ask-suggestion]').forEach(function (button) {
      button.addEventListener('click', function () {
        input.value = button.dataset.askSuggestion;
        runSearch(input.value);
      });
    });

    function loadKnowledge() {
      if (knowledge) return Promise.resolve(knowledge);
      if (loading) return loading;
      loading = fetch(root.replace(/\/$/, '') + '/knowledge.json')
        .then(function (response) { if (!response.ok) throw new Error('knowledge load failed'); return response.json(); })
        .then(function (data) { knowledge = data; return data; });
      return loading;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>'"]/g, function (character) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
      });
    }

    function termsFor(query) {
      var stop = ['如何', '什么', '怎么', '应该', '可以', '一个', 'Leslie', '最近', '的是', '以及', '相关'];
      var base = query.toLowerCase().replace(/[，。！？、：；（）()]/g, ' ').split(/\s+/).filter(Boolean);
      var chinese = query.match(/[\u3400-\u9fff]{2,}/g) || [];
      chinese.forEach(function (chunk) {
        for (var index = 0; index < chunk.length - 1; index += 2) base.push(chunk.slice(index, index + 2));
      });
      return Array.from(new Set(base.filter(function (term) { return term.length > 1 && stop.indexOf(term) === -1; })));
    }

    function score(post, query, terms) {
      var title = post.title.toLowerCase();
      var tags = post.tags.join(' ').toLowerCase();
      var categories = post.categories.join(' ').toLowerCase();
      var summary = post.summary.toLowerCase();
      var text = post.text.toLowerCase();
      var total = title.indexOf(query) !== -1 ? 40 : 0;
      terms.forEach(function (term) {
        if (title.indexOf(term) !== -1) total += 18;
        if (tags.indexOf(term) !== -1) total += 10;
        if (categories.indexOf(term) !== -1) total += 6;
        if (summary.indexOf(term) !== -1) total += 4;
        if (text.indexOf(term) !== -1) total += Math.min(5, text.split(term).length - 1);
      });
      return total;
    }

    function render(found, total) {
      if (!found.length) {
        results.innerHTML = '<div class="ask-empty"><span class="ask-empty__orb" aria-hidden="true"></span><p>暂时没有找到足够相关的内容。试试“Agent”“Claude Code”“Redis”或“无人机”。</p></div>';
        return;
      }
      results.innerHTML = '<div class="ask-result-head"><span>FOUND ' + found.length + ' SOURCES</span><span>INDEXED ' + total + ' NOTES</span></div>' + found.map(function (post, index) {
        return '<a class="ask-result" href="' + escapeHtml(post.url) + '"><span class="ask-result__rank">0' + (index + 1) + '</span><div><h3>' + escapeHtml(post.title) + '</h3><p>' + escapeHtml(post.summary) + '</p><time>' + escapeHtml(post.date) + (post.tags.length ? ' / ' + escapeHtml(post.tags.slice(0, 3).join(' · ')) : '') + '</time></div><span class="ask-result__arrow">↗</span></a>';
      }).join('');
    }

    function runSearch(value) {
      var query = String(value || '').trim().toLowerCase();
      if (!query) { input.focus(); return; }
      results.innerHTML = '<div class="ask-empty"><span class="ask-empty__orb" aria-hidden="true"></span><p>正在扫描 Leslie 的公开知识库…</p></div>';
      loadKnowledge().then(function (data) {
        var terms = termsFor(query);
        var ranked = data.posts.map(function (post) { return { post: post, score: score(post, query, terms) }; })
          .filter(function (item) { return item.score > 0; })
          .sort(function (a, b) { return b.score - a.score || b.post.date.localeCompare(a.post.date); })
          .slice(0, 5)
          .map(function (item) { return item.post; });
        render(ranked, data.count);
      }).catch(function () {
        results.innerHTML = '<div class="ask-empty"><p>知识索引暂时没有加载成功，请刷新页面后重试。</p></div>';
      });
    }

    form.addEventListener('submit', function (event) { event.preventDefault(); runSearch(input.value); });
  }

  function setupFlightCanvas() {
    var canvas = document.querySelector('[data-flight-canvas]');
    if (!canvas || reduceMotion) return;
    var context = canvas.getContext('2d');
    var width = 0;
    var height = 0;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var animationFrame = null;

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = Array.from({ length: Math.min(70, Math.floor(width / 18)) }, function (_, index) {
        return { x: Math.random() * width, y: Math.random() * height, z: Math.random(), speed: .08 + Math.random() * .22, phase: index * .7 };
      });
    }

    function color(name, alpha) {
      var light = document.documentElement.dataset.theme === 'light';
      if (name === 'accent') return light ? 'rgba(23,105,210,' + alpha + ')' : 'rgba(77,163,255,' + alpha + ')';
      return light ? 'rgba(0,127,189,' + alpha + ')' : 'rgba(83,215,255,' + alpha + ')';
    }

    function draw(time) {
      context.clearRect(0, 0, width, height);
      var horizon = height * .5;
      context.lineWidth = 1;

      for (var row = 0; row < 11; row++) {
        var depth = row / 10;
        var y = horizon + Math.pow(depth, 1.8) * height * .58;
        context.strokeStyle = color('cyan', .08 + depth * .06);
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      for (var column = -8; column <= 8; column++) {
        context.strokeStyle = color('cyan', .075);
        context.beginPath(); context.moveTo(width / 2 + column * 17, horizon); context.lineTo(width / 2 + column * width * .12, height); context.stroke();
      }

      particles.forEach(function (particle, index) {
        particle.y -= particle.speed;
        if (particle.y < 0) particle.y = height;
        var pulse = .25 + (Math.sin(time * .001 + particle.phase) + 1) * .18;
        context.fillStyle = color(index % 7 === 0 ? 'accent' : 'cyan', pulse);
        context.fillRect(particle.x, particle.y, index % 7 === 0 ? 2 : 1, index % 7 === 0 ? 2 : 1);
      });

      var route = [
        [width * .12, height * .72], [width * .34, height * .55], [width * .53, height * .64], [width * .72, height * .39], [width * .9, height * .47]
      ];
      context.strokeStyle = color('accent', .32);
      context.setLineDash([5, 10]);
      context.beginPath(); route.forEach(function (point, index) { if (index === 0) context.moveTo(point[0], point[1]); else context.lineTo(point[0], point[1]); }); context.stroke();
      context.setLineDash([]);
      var phase = (time * .00005) % 1;
      var segment = Math.min(route.length - 2, Math.floor(phase * (route.length - 1)));
      var local = phase * (route.length - 1) - segment;
      var x = route[segment][0] + (route[segment + 1][0] - route[segment][0]) * local;
      var y = route[segment][1] + (route[segment + 1][1] - route[segment][1]) * local;
      context.fillStyle = color('accent', .9); context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.fill();
      context.strokeStyle = color('accent', .25); context.beginPath(); context.arc(x, y, 12, 0, Math.PI * 2); context.stroke();

      animationFrame = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
      else if (!document.hidden && !animationFrame) animationFrame = requestAnimationFrame(draw);
    });
    animationFrame = requestAnimationFrame(draw);
  }

  function setupHeroParallax() {
    var hero = document.querySelector('.hero');
    var figure = document.querySelector('[data-hero-parallax]');
    if (!hero || !figure || reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;

    var items = Array.prototype.slice.call(figure.querySelectorAll('[data-parallax-depth]'));
    var targetX = 0;
    var targetY = 0;
    var currentX = 0;
    var currentY = 0;
    var frame = null;

    function renderParallax() {
      currentX += (targetX - currentX) * .09;
      currentY += (targetY - currentY) * .09;
      figure.style.setProperty('--mx', (currentX * 15).toFixed(2) + 'px');
      figure.style.setProperty('--my', (currentY * 11).toFixed(2) + 'px');
      items.forEach(function (item) {
        var depth = Number(item.dataset.parallaxDepth || 1);
        item.style.setProperty('--ix', (currentX * 14 * depth).toFixed(2) + 'px');
        item.style.setProperty('--iy', (currentY * 10 * depth).toFixed(2) + 'px');
      });
      if (Math.abs(targetX - currentX) > .001 || Math.abs(targetY - currentY) > .001) frame = requestAnimationFrame(renderParallax);
      else frame = null;
    }

    function queueRender() { if (!frame) frame = requestAnimationFrame(renderParallax); }

    hero.addEventListener('pointermove', function (event) {
      hero.classList.add('is-pointer-active');
      var figureRect = figure.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - figureRect.left) / figureRect.width * 2 - 1));
      targetY = Math.max(-1, Math.min(1, (event.clientY - figureRect.top) / figureRect.height * 2 - 1));
      queueRender();
    });

    hero.addEventListener('pointerleave', function () {
      hero.classList.remove('is-pointer-active');
      targetX = 0;
      targetY = 0;
      queueRender();
    });
  }

  function setupProjectJourney() {
    var journey = document.querySelector('[data-project-journey]');
    if (!journey) return;

    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-project-card]'));
    var stage = document.querySelector('[data-project-stage]');
    var gallery = document.querySelector('[data-project-gallery]');
    var currentIndex = 0;

    function projectField(name) { return document.querySelector('[data-project-' + name + ']'); }

    function renderProjectGallery(card) {
      var images = (card.dataset.images || '').split('|').filter(Boolean);
      var alts = (card.dataset.alts || '').split('|');
      gallery.replaceChildren();
      images.forEach(function (source, index) {
        var figure = document.createElement('figure');
        var projectImage = document.createElement('img');
        projectImage.src = source;
        projectImage.alt = alts[index] || card.dataset.title;
        if (index === 0) projectImage.setAttribute('data-project-image', '');
        figure.appendChild(projectImage);
        gallery.appendChild(figure);
      });
      gallery.dataset.count = String(images.length);
      gallery.classList.toggle('is-single', images.length === 1);
      gallery.classList.toggle('is-cover', card.dataset.fit === 'cover');
    }

    function selectProject(index, focusCard) {
      if (!cards.length || !stage || !gallery) return;
      currentIndex = (index + cards.length) % cards.length;
      var card = cards[currentIndex];
      stage.classList.add('is-switching');

      window.setTimeout(function () {
        renderProjectGallery(card);
        var fields = ['kicker', 'title', 'summary', 'detail', 'result'];
        fields.forEach(function (field) {
          var element = projectField(field);
          if (element) element.textContent = card.dataset[field];
        });
        var position = projectField('position');
        if (position) position.textContent = card.dataset.title;
        var tags = projectField('tags');
        if (tags) tags.innerHTML = card.dataset.tags.split('|').map(function (tag) { return '<span>' + tag + '</span>'; }).join('');
        cards.forEach(function (item, itemIndex) { item.classList.toggle('is-active', itemIndex === currentIndex); });
        stage.classList.remove('is-switching');
        if (focusCard) card.focus({ preventScroll: true });
      }, reduceMotion ? 0 : 170);
    }

    cards.forEach(function (card, index) { card.addEventListener('click', function () { selectProject(index, false); }); });
    var previous = document.querySelector('[data-project-prev]');
    var next = document.querySelector('[data-project-next]');
    if (previous) previous.addEventListener('click', function () { selectProject(currentIndex - 1, false); });
    if (next) next.addEventListener('click', function () { selectProject(currentIndex + 1, false); });

    if (stage && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
      stage.addEventListener('pointermove', function (event) {
        var bounds = stage.getBoundingClientRect();
        stage.style.setProperty('--lab-x', ((event.clientX - bounds.left) / bounds.width * -10 + 5).toFixed(1) + 'px');
        stage.style.setProperty('--lab-y', ((event.clientY - bounds.top) / bounds.height * -8 + 4).toFixed(1) + 'px');
      });
      stage.addEventListener('pointerleave', function () {
        stage.style.setProperty('--lab-x', '0px');
        stage.style.setProperty('--lab-y', '0px');
      });
    }

    var links = Array.prototype.slice.call(document.querySelectorAll('[data-journey-link]'));
    var sections = links.map(function (link) { return document.querySelector(link.getAttribute('href')); }).filter(Boolean);
    function activateSection(id) {
      links.forEach(function (link) { link.classList.toggle('is-active', link.getAttribute('href') === '#' + id); });
    }

    links.forEach(function (link) {
      link.addEventListener('click', function () { activateSection(link.getAttribute('href').slice(1)); });
    });

    if ('IntersectionObserver' in window) {
      var sectionObserver = new IntersectionObserver(function (entries) {
        entries.filter(function (entry) { return entry.isIntersecting; }).sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; }).slice(0, 1).forEach(function (entry) { activateSection(entry.target.id); });
      }, { rootMargin: '-30% 0px -55% 0px', threshold: [0, .15, .35] });
      sections.forEach(function (section) { sectionObserver.observe(section); });
    }

    if (!reduceMotion && window.matchMedia('(pointer: fine)').matches) {
      document.querySelectorAll('[data-tilt-card]').forEach(function (card) {
        card.addEventListener('pointermove', function (event) {
          var rect = card.getBoundingClientRect();
          var rotateX = ((event.clientY - rect.top) / rect.height - .5) * -2.2;
          var rotateY = ((event.clientX - rect.left) / rect.width - .5) * 2.2;
          card.style.transform = 'perspective(1200px) rotateX(' + rotateX.toFixed(2) + 'deg) rotateY(' + rotateY.toFixed(2) + 'deg)';
        });
        card.addEventListener('pointerleave', function () { card.style.transform = ''; });
      });
    }

    activateSection(sections.length ? sections[0].id : '');
  }

  function setupVideoEmbeds() {
    document.querySelectorAll('[data-video-embed]').forEach(function (embed) {
      var play = embed.querySelector('[data-video-play]');
      var frame = embed.querySelector('[data-video-frame]');
      if (!play || !frame) return;
      play.addEventListener('click', function () {
        if (!frame.src) frame.src = frame.dataset.src;
        embed.classList.add('is-playing');
        frame.focus();
      });
    });
  }

  function setupAccountCopy() {
    function legacyCopy(text) {
      return new Promise(function (resolve, reject) {
        var input = document.createElement('textarea');
        input.value = text;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        try { document.execCommand('copy') ? resolve() : reject(new Error('Copy command failed')); }
        catch (error) { reject(error); }
        input.remove();
      });
    }

    document.querySelectorAll('[data-account-copy]').forEach(function (button) {
      var label = button.querySelector('b');
      var original = label ? label.textContent : '';

      button.addEventListener('click', function () {
        var account = button.dataset.accountCopy;
        var copy = navigator.clipboard && window.isSecureContext
          ? navigator.clipboard.writeText(account).catch(function () { return legacyCopy(account); })
          : legacyCopy(account);

        copy.then(function () {
          button.classList.add('is-copied');
          if (label) label.textContent = '已复制公众号名称';
          window.setTimeout(function () {
            button.classList.remove('is-copied');
            if (label) label.textContent = original;
          }, 1800);
        }).catch(function () {
          if (label) label.textContent = '请手动搜索「' + account + '」';
        });
      });
    });
  }

  setupWritingSearch();
  setupAccountCopy();
  setupCodeCopy();
  setupAsk();
  setupHeroParallax();
  setupVideoEmbeds();
  setupProjectJourney();
})();
