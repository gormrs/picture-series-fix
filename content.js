(() => {
  'use strict';
  const textSelector = '.dhks__text, .dhks__content, .dhks__title, .dhks__lead, .dhks__author-name, .dhks__author-role, .dhks__publish-date';
  const selector = `${textSelector}, .dhks__background img, .dhks__background video`;
  let reader;
  const message = (key) => chrome.i18n.getMessage(key);

  function safeURL(value) {
    if (!value) return null;
    try {
      const url = new URL(value, document.baseURI);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  // Rebuild only semantic content: never copy handlers, styles, IDs or scripts.
  function copyText(source, target) {
    const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'B', 'I', 'A', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'H2', 'H3', 'SPAN']);
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        target.append(document.createTextNode(child.textContent));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'BUTTON', 'FORM'].includes(child.tagName)) continue;
        const element = document.createElement(allowed.has(child.tagName) ? child.tagName.toLowerCase() : 'span');
        if (child.tagName === 'A') {
          const href = safeURL(child.getAttribute('href'));
          if (href) { element.href = href; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
        }
        copyText(child, element);
        target.append(element);
      }
    }
  }

  function extract() {
    if (!document.querySelector('.dhks__card, .dhks__background')) return [];
    const nodes = [...document.querySelectorAll(selector)];
    return nodes.filter(node => !nodes.some(parent => parent !== node && parent.contains(node))).flatMap(node => {
      if (node.matches('img, video')) {
        const src = safeURL(node.currentSrc || node.getAttribute('src') || node.querySelector('source')?.getAttribute('src') || node.getAttribute('data-src'));
        if (!src) return [];
        const media = document.createElement(node.localName);
        media.src = src;
        if (node.localName === 'img') { media.alt = node.alt || ''; media.loading = 'lazy'; }
        else { media.controls = true; media.preload = 'metadata'; const poster = safeURL(node.poster); if (poster) media.poster = poster; }
        const figure = document.createElement('figure');
        figure.append(media);
        media.addEventListener('error', () => {
          if (figure.querySelector('figcaption')) return;
          const caption = document.createElement('figcaption');
          caption.textContent = message('mediaUnavailable');
          figure.append(caption);
        }, { once: true });
        return [figure];
      }
      if (!node.textContent.trim()) return [];
      const element = document.createElement(node.matches('.dhks__title') ? 'h1' : 'section');
      copyText(node, element);
      if (node.matches('.dhks__lead')) element.className = 'lead';
      if (node.matches('.dhks__author-name, .dhks__author-role, .dhks__publish-date')) element.className = 'metadata';
      return [element];
    });
  }

  function openReader() {
    if (reader?.isConnected) return { ok: true, state: 'open' };
    const blocks = extract();
    if (!blocks.length) return { ok: false, error: 'unsupportedArticle' };
    const previousFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = 'picture-series-reader';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      dialog { position: fixed; inset: 0; width: 100vw; max-width: none; height: 100dvh; max-height: none; margin: 0; border: 0; padding: 0; background: #faf8f3; color: #212c30; font: 19px/1.7 Georgia, serif; overflow: auto; overscroll-behavior: contain; }
      dialog::backdrop { background: #faf8f3; }
      header { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; border-bottom: 1px solid #dddcd5; background: #faf8f3; font: 14px/1.4 system-ui, sans-serif; z-index: 1; }
      button { border: 1px solid #356459; background: #fff; color: #214d43; border-radius: 8px; padding: 10px 16px; font: inherit; cursor: pointer; }
      button:focus-visible, a:focus-visible { outline: 3px solid #b56b22; outline-offset: 3px; }
      article { max-width: 800px; margin: 0 auto; padding: 40px 24px 100px; overflow-wrap: anywhere; }
      h1 { font-size: clamp(32px, 6vw, 52px); line-height: 1.15; letter-spacing: -.025em; }
      section { margin: 24px 0; } p { margin: 0 0 1em; } .lead { font-size: 1.2em; } .metadata, figcaption { font: 14px/1.6 system-ui, sans-serif; color: #536260; }
      figure { margin: 32px 0; } img, video { display: block; width: 100%; height: auto; border-radius: 8px; } a { color: #206451; text-decoration-thickness: 1px; text-underline-offset: 3px; }
      blockquote { border-left: 3px solid #659381; padding-left: 20px; margin: 24px 0; }
      @media (max-width: 480px) { header { padding: 12px 16px; } article { padding: 24px 18px 60px; } }
    `;
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', message('readerTitle'));
    const header = document.createElement('header');
    const label = document.createElement('span');
    label.textContent = `PicArticleFix · ${message('readerTitle')}`;
    const close = document.createElement('button');
    close.textContent = message('closeReader');
    close.addEventListener('click', () => dialog.close());
    header.append(label, close);
    const article = document.createElement('article');
    article.append(...blocks);
    dialog.append(header, article);
    shadow.append(style, dialog);
    document.body.append(host);
    reader = host;
    dialog.addEventListener('close', () => {
      host.remove();
      reader = null;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal();
    close.focus({ preventScroll: true });
    return { ok: true, state: 'open' };
  }

  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (request.message === 'reader_status') {
      respond({ ok: true, state: reader?.isConnected ? 'open' : 'closed', supported: Boolean(document.querySelector('.dhks__card, .dhks__background')) });
    } else if (request.message === 'modify_article') {
      try { respond(openReader()); }
      catch { reader?.remove(); reader = null; respond({ ok: false, error: 'conversionFailed' }); }
    }
  });
})();
