(() => {
  'use strict';

  // NRK picture series ("kortstokk") are a flat, document-ordered sequence of
  // full-screen backgrounds and the cards that scroll over them.
  const STORY_BLOCK = '.dhks__background, .dhks__card';
  const SKIP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'BUTTON', 'FORM', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'PICTURE', 'IMG', 'VIDEO']);
  const KEEP = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'H4', 'SPAN', 'SUB', 'SUP', 'SMALL', 'Q', 'CITE']);
  const BLOCK_LIKE = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'ASIDE', 'FIGURE', 'FIGCAPTION']);
  const t = key => chrome.i18n.getMessage(key);
  let reader = null;

  const isSupported = () => Boolean(document.querySelector(STORY_BLOCK));
  const textOf = node => node?.textContent.replace(/\s+/g, ' ').trim() || '';

  function element(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  }

  function safeURL(value) {
    if (!value) return null;
    try {
      const url = new URL(value.trim(), document.baseURI);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch { return null; }
  }

  // Keep only http(s) candidates of a srcset, preserving their descriptors.
  function safeSrcset(value) {
    return (value || '').split(',').map(candidate => {
      const [url, descriptor] = candidate.trim().split(/\s+/);
      const safe = safeURL(url);
      return safe && (descriptor ? `${safe} ${descriptor}` : safe);
    }).filter(Boolean).join(', ');
  }

  // Rebuild semantic text only: no attributes, handlers, styles or scripts survive.
  function copyText(source, target) {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { target.append(child.textContent); continue; }
      if (child.nodeType !== Node.ELEMENT_NODE || SKIP.has(child.tagName.toUpperCase())) continue;
      if (child.hidden || child.getAttribute('aria-hidden') === 'true') continue;
      const tag = KEEP.has(child.tagName) ? child.tagName.toLowerCase() : BLOCK_LIKE.has(child.tagName) ? 'div' : 'span';
      const copy = document.createElement(tag);
      if (tag === 'a') {
        const href = safeURL(child.getAttribute('href'));
        if (href) Object.assign(copy, { href, target: '_blank', rel: 'noopener noreferrer' });
      }
      copyText(child, copy);
      target.append(copy);
    }
    return target;
  }

  function withFallback(figure, media) {
    media.addEventListener('error', () => {
      if (!figure.querySelector('figcaption')) figure.append(element('figcaption', { textContent: t('mediaUnavailable') }));
    }, { once: true });
    return figure;
  }

  // NRK backgrounds are lazy <picture>s whose <img> has no src until the original
  // page scrolls to it, so rebuild the responsive sources rather than reading currentSrc.
  function renderPicture(img) {
    const picture = element('picture');
    for (const source of img.closest('picture')?.querySelectorAll('source') ?? []) {
      const srcset = safeSrcset(source.getAttribute('srcset'));
      if (!srcset) continue;
      const copy = element('source', { srcset, sizes: '(max-width: 800px) 100vw, 800px' });
      for (const name of ['media', 'type', 'width', 'height']) {
        if (source.hasAttribute(name)) copy.setAttribute(name, source.getAttribute(name));
      }
      picture.append(copy);
    }
    const srcset = safeSrcset(img.getAttribute('srcset') || img.getAttribute('data-srcset'));
    const firstCandidate = (picture.querySelector('source')?.srcset || srcset).split(',')[0]?.trim().split(/\s+/)[0];
    const src = safeURL(img.getAttribute('src') || img.getAttribute('data-src')) || safeURL(firstCandidate);
    if (!src) return null;
    const image = element('img', { src, alt: img.alt || '', loading: 'lazy', decoding: 'async' });
    if (srcset) Object.assign(image, { srcset, sizes: '(max-width: 800px) 100vw, 800px' });
    picture.append(image);
    return withFallback(element('figure', {}, [picture]), image);
  }

  // Untested against live NRK markup: neither reference story contains video.
  function renderVideo(video) {
    const source = video.querySelector('source[type="video/mp4"]') || video.querySelector('source');
    const src = safeURL(video.getAttribute('src') || source?.getAttribute('src') || video.getAttribute('data-src'));
    if (!src) return null;
    const copy = element('video', { src, controls: true, preload: 'metadata', playsInline: true });
    const poster = safeURL(video.getAttribute('poster'));
    if (poster) copy.poster = poster;
    return withFallback(element('figure', {}, [copy]), copy);
  }

  function renderBackground(node) {
    const video = node.querySelector('video');
    const img = node.querySelector('img');
    return [video ? renderVideo(video) : img ? renderPicture(img) : null].filter(Boolean);
  }

  function renderCover(node) {
    const blocks = [element('h1', { textContent: textOf(node.querySelector('.dhks__title')) })];
    const lead = node.querySelector('.dhks__lead');
    if (textOf(lead)) blocks.push(copyText(lead, element('p', { className: 'lead' })));
    const authors = [...node.querySelectorAll('.dhks__author')].map(author => {
      const name = textOf(author.querySelector('.dhks__author-name')) || textOf(author);
      const role = textOf(author.querySelector('.dhks__author-role'));
      return role ? `${name} (${role})` : name;
    }).filter(Boolean);
    const date = textOf(node.querySelector('.dhks__publish-date'));
    const byline = [authors.join(', '), date].filter(Boolean).join(' · ');
    if (byline) blocks.push(element('p', { className: 'byline', textContent: byline }));
    return blocks;
  }

  function renderQuote(node) {
    const quote = node.querySelector('.dhks__quote') || node.querySelector('blockquote');
    const attribution = textOf(node.querySelector('blockquote footer, .dhks__quote-source'));
    const figure = element('figure', { className: 'quote' }, [copyText(quote, element('blockquote'))]);
    if (attribution) figure.append(element('figcaption', { textContent: `— ${attribution}` }));
    return [figure];
  }

  function renderCard(node) {
    if (node.matches('.dhks__colophon-card')) return [];
    if (node.querySelector('.dhks__title')) return renderCover(node);
    if (node.matches('.dhks__quote-card') || node.querySelector('.dhks__quote')) return renderQuote(node);
    const content = node.querySelector('.dhks__text, .dhks__content') || node;
    return textOf(content) ? [copyText(content, element('section'))] : [];
  }

  function extract() {
    return [...document.querySelectorAll(STORY_BLOCK)]
      .filter(node => !node.parentElement?.closest(STORY_BLOCK))
      .flatMap(node => node.matches('.dhks__background') ? renderBackground(node) : renderCard(node));
  }

  const STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    dialog { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; padding: 0; background: #faf8f3; color: #212c30; font: 19px/1.7 Georgia, serif; overflow: auto; overscroll-behavior: contain; }
    dialog::backdrop { background: #faf8f3; }
    header { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-bottom: 1px solid #dddcd5; background: #faf8f3; font: 14px/1.4 system-ui, sans-serif; z-index: 1; }
    button { border: 1px solid #356459; background: #fff; color: #214d43; border-radius: 8px; padding: 10px 16px; font: inherit; cursor: pointer; }
    button:focus-visible, a:focus-visible { outline: 3px solid #b56b22; outline-offset: 3px; }
    article { max-width: 800px; margin: 0 auto; padding: 40px 24px 100px; overflow-wrap: anywhere; }
    h1 { font-size: clamp(32px, 6vw, 52px); line-height: 1.15; letter-spacing: -.025em; margin: 48px 0 16px; }
    section { margin: 24px 0; } p { margin: 0 0 1em; }
    .lead { font-size: 1.2em; } .byline, figcaption { font: 14px/1.6 system-ui, sans-serif; color: #536260; }
    figure { margin: 32px 0; } picture { display: block; }
    img, video { display: block; width: 100%; height: auto; border-radius: 8px; background: #ecebe4; }
    a { color: #206451; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .quote { margin: 40px 0; padding-left: 20px; border-left: 3px solid #659381; }
    .quote blockquote { margin: 0; font-size: 1.25em; font-style: italic; }
    .quote figcaption { margin-top: 8px; }
    @media (max-width: 480px) { header { padding: 12px 16px; } article { padding: 24px 18px 60px; } }
  `;

  function openReader() {
    if (reader?.isConnected) return { ok: true, state: 'open' };
    const blocks = extract();
    if (!blocks.length) return { ok: false, error: 'unsupportedArticle' };

    const previousFocus = document.activeElement;
    const close = element('button', { type: 'button', textContent: t('closeReader') });
    const dialog = element('dialog', {}, [
      element('header', {}, [element('span', { textContent: `PicArticleFix · ${t('readerTitle')}` }), close]),
      element('article', {}, blocks),
    ]);
    dialog.setAttribute('aria-label', t('readerTitle'));
    close.addEventListener('click', () => dialog.close());

    const host = element('div', { id: 'picture-series-reader' });
    host.attachShadow({ mode: 'open' }).append(element('style', { textContent: STYLE }), dialog);
    dialog.addEventListener('close', () => {
      host.remove();
      reader = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }, { once: true });

    document.body.append(host);
    reader = host;
    dialog.showModal();
    close.focus({ preventScroll: true });
    return { ok: true, state: 'open' };
  }

  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request.message === 'reader_status') {
      respond({ ok: true, state: reader?.isConnected ? 'open' : 'closed', supported: isSupported() });
    } else if (request.message === 'modify_article') {
      try { respond(openReader()); } catch {
        reader?.remove();
        reader = null;
        respond({ ok: false, error: 'conversionFailed' });
      }
    }
  });
})();
