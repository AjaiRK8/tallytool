/* ==========================================================================
   Storycraft — site logic
   Everything on the Portfolio section is generated from projects.json.
   To add work you edit that file only; nothing in here needs to change.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- Settings you may want to change ---------------------------------- */

  const CONFIG = {
    dataUrl: 'projects.json',

    // Paste your showreel link here — it powers the "Watch the showreel" button.
    // Leave it empty and the button explains that the reel is coming soon.
    showreelUrl: '',

    // Shown if a thumbnail file is missing or misspelled in projects.json.
    fallbackThumb: 'assets/thumbnails/lexus-timbertales.svg',

    // Used by the contact form's mail-app fallback.
    email: 'storycraftcreatives@gmail.com'
  };

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  let projects = [];
  let activeFilter = 'All';

  /* ======================================================================
     1. Video URL parsing
     Paste any normal video or cloud-drive link into projects.json and this
     works out how to embed it. Supported:

       YouTube · Vimeo · Instagram · Facebook · Dailymotion · Loom ·
       Streamable · Wistia · Google Drive · Dropbox · OneDrive / SharePoint ·
       Box · MEGA · pCloud · direct .mp4/.webm/.mov links · still images

     Anything unrecognised is still *tried* as a video file before falling
     back to a plain "open in a new tab" link, so most direct download URLs
     from other drives will just play.
     ====================================================================== */

  // Whatever a share link looks like, the share URL itself is worth keeping
  // so the fallback link can point at something a human can open.
  function video(kind, src, original) {
    return { kind: kind, src: src, original: original || src };
  }

  // OneDrive / 1drv.ms share links can be turned into a direct content URL
  // by base64url-encoding the share link itself. No API key needed.
  function onedriveDirect(url) {
    let b64;
    try {
      b64 = btoa(unescape(encodeURIComponent(url)));
    } catch (err) {
      return null;
    }
    return 'https://api.onedrive.com/v1.0/shares/u!' +
      b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') +
      '/root/content';
  }

  function addParam(url, param) {
    if (new RegExp('[?&]' + param.split('=')[0] + '=').test(url)) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + param;
  }

  function parseVideo(url) {
    if (!url) return null;
    url = String(url).trim();
    if (!url) return null;

    /* ---- Video platforms ------------------------------------------------ */

    // youtube.com/watch?v=ID · youtu.be/ID · /embed/ID · /shorts/ID · /live/ID
    const yt = url.match(
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/
    );
    if (yt) {
      return video('iframe',
        'https://www.youtube-nocookie.com/embed/' + yt[1] +
        '?autoplay=1&rel=0&modestbranding=1&playsinline=1', url);
    }

    // vimeo.com/ID · vimeo.com/channels/x/ID · player.vimeo.com/video/ID
    const vm = url.match(/vimeo\.com\/(?:.*\/)?(\d+)/);
    if (vm) {
      return video('iframe',
        'https://player.vimeo.com/video/' + vm[1] +
        '?autoplay=1&title=0&byline=0&portrait=0', url);
    }

    // instagram.com/p/ID · /reel/ID · /reels/ID · /tv/ID
    const ig = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
    if (ig) {
      const type = ig[1] === 'reels' ? 'reel' : ig[1];
      return video('iframe',
        'https://www.instagram.com/' + type + '/' + ig[2] + '/embed/captioned/', url);
    }

    // facebook.com/watch/?v=ID · /videos/ID · fb.watch/ID
    if (/(?:facebook\.com\/(?:watch\/?\?|.*\/videos\/)|fb\.watch\/)/.test(url)) {
      return video('iframe',
        'https://www.facebook.com/plugins/video.php?href=' +
        encodeURIComponent(url) + '&autoplay=true&show_text=false', url);
    }

    // dailymotion.com/video/ID · dai.ly/ID
    const dm = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
    if (dm) {
      return video('iframe',
        'https://www.dailymotion.com/embed/video/' + dm[1] + '?autoplay=1', url);
    }

    // loom.com/share/ID
    const lo = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/);
    if (lo) {
      return video('iframe', 'https://www.loom.com/embed/' + lo[1] + '?autoplay=1', url);
    }

    // streamable.com/ID
    const st = url.match(/streamable\.com\/(?:e\/)?([\w-]+)/);
    if (st) {
      return video('iframe', 'https://streamable.com/e/' + st[1] + '?autoplay=1', url);
    }

    // wistia: /medias/ID · wi.st/medias/ID
    const wi = url.match(/(?:wistia\.com|wi\.st)\/(?:medias|embed\/medias)\/([\w-]+)/);
    if (wi) {
      return video('iframe',
        'https://fast.wistia.net/embed/iframe/' + wi[1] + '?autoPlay=true', url);
    }

    /* ---- Cloud drives --------------------------------------------------- */

    // Google Drive — /file/d/ID/view · open?id=ID · uc?id=ID
    // The share link isn't embeddable, so swap it for the /preview form.
    const gd = url.match(
      /drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([\w-]{20,})/
    );
    if (gd) {
      return video('iframe', 'https://drive.google.com/file/d/' + gd[1] + '/preview', url);
    }

    // Dropbox — dropbox.com/s/… · /scl/fi/… — raw=1 streams the file itself,
    // so it plays in a real <video> element with your own controls.
    if (/dropbox\.com\/(?:s|scl)\//.test(url)) {
      const raw = addParam(url.replace(/[?&]dl=[01]/g, ''), 'raw=1')
        .replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      return video('file', raw, url);
    }

    // OneDrive personal — 1drv.ms/… · onedrive.live.com/…
    if (/(?:1drv\.ms\/|onedrive\.live\.com\/)/.test(url)) {
      const direct = onedriveDirect(url);
      if (direct) return video('file', direct, url);
      return video('iframe', url.replace('/redir?', '/embed?'), url);
    }

    // OneDrive for Business / SharePoint — …/:v:/g/personal/…
    if (/sharepoint\.com\/|-my\.sharepoint\.com\//.test(url)) {
      return video('iframe', addParam(url, 'action=embedview'), url);
    }

    // Box — app.box.com/s/ID
    const bx = url.match(/app\.box\.com\/(?:s|shared)\/([\w!.-]+)/);
    if (bx) {
      return video('iframe', 'https://app.box.com/embed/s/' + bx[1] + '?showParentPath=false', url);
    }

    // MEGA — mega.nz/file/ID#KEY
    const mg = url.match(/mega\.nz\/(?:file|embed)\/([\w-]+#[\w-]+)/);
    if (mg) {
      return video('iframe', 'https://mega.nz/embed/' + mg[1] + '!1!0', url);
    }

    // pCloud — publink/show?code=CODE
    const pc = url.match(/pcloud\.(?:com|link)\/publink\/show\?code=([\w]+)/);
    if (pc) {
      return video('iframe', 'https://e.pcloud.link/publink/show?code=' + pc[1], url);
    }

    /* ---- Plain files ---------------------------------------------------- */

    // a self-hosted file, e.g. assets/video/my-film.mp4
    if (/\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i.test(url)) {
      return video('file', url, url);
    }

    // a still image, e.g. assets/photos/shot-01.jpg
    if (/\.(jpe?g|png|webp|avif|gif|svg)(\?.*)?$/i.test(url)) {
      return video('image', url, url);
    }

    // Unknown host: most drives hand out a direct download URL with no file
    // extension. Try it as a video — mountPlayer swaps in a link if it fails.
    return video('file', url, url);
  }

  /* ======================================================================
     1b. Photo galleries
     A project with a "photos": [...] array opens as a lightbox instead
     of a video player.
     ====================================================================== */

  let gallery = { photos: [], index: 0, title: '' };

  function mountGallery(photos, title) {
    gallery = { photos: photos, index: 0, title: title || '' };

    stage.classList.remove('is-portrait');
    stage.classList.add('is-gallery');
    stage.innerHTML = [
      '<img id="galleryImg" alt="">',
      photos.length > 1
        ? '<button class="gallery-nav prev" data-step="-1" aria-label="Previous photo">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>' +
          '</button>' +
          '<button class="gallery-nav next" data-step="1" aria-label="Next photo">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>' +
          '</button>' +
          '<span class="gallery-count"></span>'
        : ''
    ].join('');

    $$('.gallery-nav', stage).forEach(btn => {
      btn.addEventListener('click', () => stepGallery(parseInt(btn.dataset.step, 10)));
    });

    showPhoto(0);
  }

  function showPhoto(i) {
    const img = $('#galleryImg', stage);
    if (!img) return;

    gallery.index = (i + gallery.photos.length) % gallery.photos.length;
    img.src = gallery.photos[gallery.index];
    img.alt = gallery.title + ' — photo ' + (gallery.index + 1);

    const count = $('.gallery-count', stage);
    if (count) count.textContent = (gallery.index + 1) + ' / ' + gallery.photos.length;
  }

  function stepGallery(step) {
    if (gallery.photos.length > 1) showPhoto(gallery.index + step);
  }

  /* ======================================================================
     2. Building the grid
     ====================================================================== */

  const grid      = $('#grid');
  const filterBar = $('#filters');
  const emptyMsg  = $('#gridEmpty');
  const errorMsg  = $('#gridError');

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildCard(project, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.index = index;
    card.dataset.category = project.category || 'Uncategorised';
    card.dataset.orientation = project.orientation === 'portrait' ? 'portrait' : 'landscape';

    const meta = [project.client, project.year].filter(Boolean).join(' · ');
    const photoCount = Array.isArray(project.photos) ? project.photos.length : 0;

    // photo sets get a stack icon and a frame count; video gets a play triangle
    const icon = photoCount
      ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">' +
          '<rect x="3" y="6" width="15" height="12" rx="2.5"/><path d="M21 8v10a2.5 2.5 0 0 1-2.5 2.5H7"/></svg>'
      : '<svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor"><path d="M0 0l14 8L0 16z"/></svg>';

    const badge = photoCount
      ? photoCount + ' photos'
      : (project.duration || '');

    card.setAttribute('aria-label',
      (photoCount ? 'View photos from ' : 'Play ') + (project.title || 'project'));

    card.innerHTML = [
      '<div class="card-frame">',
        '<img src="', escapeHtml(project.thumbnail || CONFIG.fallbackThumb), '" ',
             'alt="', escapeHtml(project.title || ''), '" loading="lazy" decoding="async" ',
             'data-fallback="', escapeHtml(CONFIG.fallbackThumb), '">',
        '<div class="card-veil"></div>',
        badge ? '<span class="card-duration">' + escapeHtml(badge) + '</span>' : '',
        '<span class="card-play" aria-hidden="true">', icon, '</span>',
        '<div class="card-foot">',
          '<p class="card-title">', escapeHtml(project.title || 'Untitled'), '</p>',
          '<p class="card-sub">',
            '<span class="card-cat">', escapeHtml(project.category || ''), '</span>',
            meta ? ' &nbsp;·&nbsp; ' + escapeHtml(meta) : '',
          '</p>',
        '</div>',
      '</div>'
    ].join('');

    // Swap in the fallback thumbnail without an inline onerror attribute.
    const img = $('img', card);
    img.addEventListener('error', function onThumbError() {
      img.removeEventListener('error', onThumbError);
      img.src = img.dataset.fallback;
    });

    card.addEventListener('click', () => openModal(index));
    return card;
  }

  function renderGrid() {
    grid.innerHTML = '';
    projects.forEach((project, i) => grid.appendChild(buildCard(project, i)));
    applyFilter(activeFilter);
  }

  /* ======================================================================
     3. Filters — derived from the data, so a brand-new category in
        projects.json gets its own button automatically.
     ====================================================================== */

  function renderFilters() {
    const counts = new Map();
    projects.forEach(p => {
      const c = p.category || 'Uncategorised';
      counts.set(c, (counts.get(c) || 0) + 1);
    });

    const categories = [['All', projects.length]].concat(
      Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    );

    // If the previously active category no longer exists, fall back to All.
    if (activeFilter !== 'All' && !counts.has(activeFilter)) activeFilter = 'All';

    filterBar.innerHTML = '';
    categories.forEach(([name, count]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter';
      btn.dataset.filter = name;
      btn.setAttribute('aria-pressed', String(name === activeFilter));
      btn.innerHTML = escapeHtml(name) + '<span class="count">' + count + '</span>';
      btn.addEventListener('click', () => applyFilter(name));
      filterBar.appendChild(btn);
    });
  }

  function applyFilter(name) {
    activeFilter = name;
    let visible = 0;

    $$('.card', grid).forEach(card => {
      const match = name === 'All' || card.dataset.category === name;
      card.classList.toggle('is-hidden', !match);
      if (match) visible++;
    });

    $$('.filter', filterBar).forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === name));
    });

    emptyMsg.hidden = visible > 0;
  }

  /* ======================================================================
     4. Video modal
     ====================================================================== */

  const modal      = $('#modal');
  const stage      = $('#modalStage');
  const modalTitle = $('#modalTitle');
  const modalSub   = $('#modalSub');
  const modalDesc  = $('#modalDesc');
  let lastFocused  = null;

  // A link the visitor can open if an embed can't play in the page.
  function externalLink(href, label) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label || 'Open this video in a new tab';
    link.style.cssText =
      'display:grid;place-items:center;height:100%;padding:2rem;text-align:center;' +
      'color:#4DB6C4;font-size:15px;text-decoration:underline';
    return link;
  }

  function mountPlayer(video, isPortrait, emptyHint) {
    stage.innerHTML = '';
    stage.classList.toggle('is-portrait', !!isPortrait);
    stage.classList.remove('is-gallery');   // in case a photo set was shown last

    const hint = emptyHint ||
      'Add this project’s YouTube, Vimeo, Instagram or drive link to the ' +
      '<span style="color:#4DB6C4">videoUrl</span> field in projects.json.';

    // No link yet — show the project details rather than an empty black box.
    if (!video) {
      stage.innerHTML =
        '<div style="display:grid;place-items:center;height:100%;padding:2rem;text-align:center;gap:.6rem">' +
          '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4DB6C4" stroke-width="1.4">' +
            '<rect x="2" y="5" width="15" height="14" rx="3"/><path d="M17 10l5-3v10l-5-3z"/></svg>' +
          '<p style="color:#EDF2F2;font-size:15px;font-weight:600">Video coming soon</p>' +
          '<p style="color:#8C9B9D;font-size:13.5px;max-width:34ch;line-height:1.55">' + hint + '</p>' +
        '</div>';
      return;
    }

    if (video.kind === 'iframe') {
      const frame = document.createElement('iframe');
      frame.src = video.src;
      frame.title = modalTitle.textContent || 'Video player';
      frame.allow = 'autoplay; fullscreen; picture-in-picture; encrypted-media';
      frame.allowFullscreen = true;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer-when-downgrade';
      stage.appendChild(frame);

    } else if (video.kind === 'file') {
      const el = document.createElement('video');
      el.src = video.src;
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
      el.preload = 'metadata';
      el.crossOrigin = 'anonymous';

      // A drive link that refuses to stream (private file, login wall,
      // unsupported codec) falls back to opening the original share link.
      el.addEventListener('error', () => {
        if (!stage.contains(el)) return;
        stage.innerHTML = '';
        stage.appendChild(externalLink(video.original, 'This file can’t play here — open it in a new tab'));
      });

      stage.appendChild(el);

    } else if (video.kind === 'image') {
      const img = document.createElement('img');
      img.src = video.src;
      img.alt = modalTitle.textContent || '';
      stage.classList.add('is-gallery');
      stage.appendChild(img);

    } else {
      stage.appendChild(externalLink(video.original));
    }
  }

  // Shared by project cards and the showreel button.
  function openStage(title, sub, desc, mount) {
    modalTitle.textContent = title;
    modalSub.textContent = sub;
    modalDesc.textContent = desc;

    mount();

    modal.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => modal.classList.add('is-open'));
    $('#modalClose').focus();
  }

  function openModal(index) {
    const project = projects[index];
    if (!project) return;

    lastFocused = document.activeElement;

    openStage(
      project.title || 'Untitled',
      [project.category, project.role, project.client, project.year].filter(Boolean).join('  ·  '),
      project.description || '',
      () => {
        if (Array.isArray(project.photos) && project.photos.length) {
          mountGallery(project.photos, project.title);
        } else {
          mountPlayer(parseVideo(project.videoUrl), project.orientation === 'portrait');
        }
      }
    );
  }

  function closeModal() {
    modal.classList.remove('is-open');
    document.body.classList.remove('is-locked');

    window.setTimeout(() => {
      modal.hidden = true;
      stage.innerHTML = '';          // stops playback and unloads the iframe
      stage.classList.remove('is-portrait', 'is-gallery');
      gallery = { photos: [], index: 0, title: '' };

      // Restore focus only once the dialog is out of the flow, otherwise
      // some browsers jump the page while it's still on screen.
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    }, 300);
  }

  // Visible, focusable elements inside the dialog. offsetParent is null for
  // anything inside a position:fixed panel, so measure boxes instead.
  function focusableInModal() {
    return $$(
      'a[href], button:not([disabled]), iframe, video[controls], ' +
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])',
      modal
    ).filter(el => el.getClientRects().length > 0);
  }

  modal.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) closeModal();
  });

  document.addEventListener('keydown', e => {
    if (modal.hidden) return;

    if (e.key === 'Escape') { closeModal(); return; }

    // arrow keys step through a photo gallery
    if (gallery.photos.length > 1) {
      if (e.key === 'ArrowRight') { e.preventDefault(); stepGallery(1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); stepGallery(-1); }
    }

    // keep tabbing inside the dialog while it's open
    if (e.key === 'Tab') {
      const focusables = focusableInModal();
      if (!focusables.length) { e.preventDefault(); return; }

      const first = focusables[0];
      const last  = focusables[focusables.length - 1];

      // focus escaped the dialog (or never entered it) — pull it back
      if (!modal.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  });

  // "Watch the showreel" in the hero
  $$('[data-reel]').forEach(btn => {
    btn.addEventListener('click', () => {
      lastFocused = btn;
      openStage(
        'Showreel',
        'Anandu R Krishnan  ·  Editor, cinematographer, colourist',
        'A short cut of recent work.',
        () => mountPlayer(parseVideo(CONFIG.showreelUrl), false,
          'Set <span style="color:#4DB6C4">CONFIG.showreelUrl</span> at the top of js/script.js to your showreel link.')
      );
    });
  });

  /* ======================================================================
     5. Navigation
     ====================================================================== */

  const nav = $('#nav');
  const menuBtn = $('#menuBtn');
  const mobileNav = $('#mobileNav');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('is-stuck', window.scrollY > 24);
  }, { passive: true });

  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-expanded', String(!open));
    mobileNav.hidden = open;
  });

  $$('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
      menuBtn.setAttribute('aria-expanded', 'false');
      mobileNav.hidden = true;
    });
  });

  // highlight the section you're currently reading
  const sections = $$('section[id]');
  const navLinks = $$('.navlink');

  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        navLinks.forEach(link => {
          link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(s => spy.observe(s));
  }

  /* ======================================================================
     6. Scroll reveals + stat counters
     ====================================================================== */

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function watchReveals() {
    const items = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        obs.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    items.forEach(el => io.observe(el));
  }

  function watchCounters() {
    const nums = $$('[data-count]');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      nums.forEach(el => { el.textContent = el.dataset.count + '+'; });
      return;
    }

    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const target = parseInt(el.dataset.count, 10) || 0;
        const dur = 1400;
        let start = null;

        requestAnimationFrame(function step(now) {
          if (start === null) start = now;
          const t = Math.min((now - start) / dur, 1);
          const eased = 1 - Math.pow(1 - t, 3);
          el.textContent = Math.round(target * eased).toLocaleString('en-IN') + (t === 1 ? '+' : '');
          if (t < 1) requestAnimationFrame(step);
        });

        obs.unobserve(el);
      });
    }, { threshold: 0.5 });

    nums.forEach(el => io.observe(el));
  }

  /* ======================================================================
     7. Hero video — only fade it in once it's actually playing, so a
        missing file leaves the animated gradient in place.
     ====================================================================== */

  const heroVideo = $('#heroVideo');
  if (heroVideo) {
    heroVideo.addEventListener('playing', () => heroVideo.classList.add('is-playing'), { once: true });

    // <source> children fire error on themselves, not on the <video>, so
    // listen during the capture phase to catch both.
    heroVideo.addEventListener('error', () => {
      if (heroVideo.parentNode) heroVideo.remove();
    }, true);

    if (reduceMotion) heroVideo.pause();
  }

  /* ======================================================================
     8. Contact form
     ====================================================================== */

  const form = $('#contactForm');
  const note = $('#formNote');

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const required = ['#name', '#email', '#message'].map(s => $(s));
    let bad = null;

    required.forEach(field => {
      const ok = field.checkValidity() && field.value.trim() !== '';
      field.setAttribute('aria-invalid', String(!ok));
      if (!ok && !bad) bad = field;
    });

    if (bad) {
      note.textContent = 'Fill in your name, a valid email and a message.';
      bad.focus();
      return;
    }

    // Not wired up yet — fall back to the visitor's mail app.
    if (form.action.includes('FORM_ID')) {
      const subject = encodeURIComponent('Project enquiry — ' + $('#kind').value);
      const body = encodeURIComponent(
        $('#message').value + '\n\nTimeline: ' + $('#date').value +
        '\n\n' + $('#name').value + '\n' + $('#email').value
      );
      window.location.href = 'mailto:' + CONFIG.email + '?subject=' + subject + '&body=' + body;
      note.textContent = 'Opening your email app.';
      return;
    }

    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    note.textContent = 'Sending…';

    try {
      const res = await fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) throw new Error('Bad response');
      form.reset();
      note.textContent = 'Sent. I’ll reply within a day.';
    } catch (err) {
      note.textContent = 'That didn’t send. Email ' + CONFIG.email + ' instead.';
    } finally {
      btn.disabled = false;
    }
  });

  /* ======================================================================
     9. Start
     ====================================================================== */

  async function init() {
    $('#year').textContent = new Date().getFullYear();
    watchReveals();
    watchCounters();

    try {
      const res = await fetch(CONFIG.dataUrl, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('projects.json must contain an array');

      projects = data;
      renderFilters();
      renderGrid();

    } catch (err) {
      console.error('Could not load ' + CONFIG.dataUrl + ':', err);
      grid.hidden = true;
      filterBar.hidden = true;
      errorMsg.hidden = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
