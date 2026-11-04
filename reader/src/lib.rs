//! PicArticleFix reader: turns an NRK picture series ("kortstokk") into a
//! scrollable article inside a shadow-DOM dialog. The JS content script only
//! loads this module, supplies localized strings and relays extension messages.

use std::cell::RefCell;
use wasm_bindgen::{prelude::*, JsCast};
use web_sys::{
    AddEventListenerOptions, Document, Element, FocusOptions, HtmlDialogElement, HtmlElement, Node,
    ShadowRootInit, ShadowRootMode, Url,
};

type Result<T> = std::result::Result<T, JsValue>;

// Backgrounds and the cards that scroll over them, in document order.
const STORY_BLOCK: &str = ".dhks__background, .dhks__card";
const SKIP: &[&str] = &["SCRIPT", "STYLE", "IFRAME", "BUTTON", "FORM", "SVG", "NOSCRIPT", "TEMPLATE", "PICTURE", "IMG", "VIDEO"];
const KEEP: &[&str] = &["P", "BR", "STRONG", "EM", "B", "I", "A", "UL", "OL", "LI", "BLOCKQUOTE", "H2", "H3", "H4", "SPAN", "SUB", "SUP", "SMALL", "Q", "CITE"];
const BLOCK_LIKE: &[&str] = &["DIV", "SECTION", "ARTICLE", "HEADER", "FOOTER", "ASIDE", "FIGURE", "FIGCAPTION"];
const SIZES: &str = "(max-width: 800px) 100vw, 800px";
const STYLE: &str = include_str!("reader.css");

thread_local! {
    static READER: RefCell<Option<Element>> = const { RefCell::new(None) };
}

struct Strings {
    close: String,
    title: String,
    media_unavailable: String,
}

fn document() -> Document {
    web_sys::window().and_then(|w| w.document()).expect_throw("no document")
}

fn el(tag: &str) -> Result<Element> {
    document().create_element(tag)
}

fn el_text(tag: &str, text: &str) -> Result<Element> {
    let node = el(tag)?;
    node.set_text_content(Some(text));
    Ok(node)
}

fn with_class(node: Element, class: &str) -> Element {
    node.set_class_name(class);
    node
}

fn attr(node: &Element, name: &str) -> String {
    node.get_attribute(name).unwrap_or_default()
}

fn first_attr(node: &Element, names: &[&str]) -> String {
    names.iter().map(|n| attr(node, n)).find(|v| !v.is_empty()).unwrap_or_default()
}

fn text_of(node: &Node) -> String {
    node.text_content().unwrap_or_default().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn opt_text_of(node: Option<Element>) -> String {
    node.map(|n| text_of(&n)).unwrap_or_default()
}

fn safe_url(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() {
        return None;
    }
    let base = document().base_uri().ok().flatten().unwrap_or_default();
    let url = Url::new_with_base(value, &base).ok()?;
    matches!(url.protocol().as_str(), "https:" | "http:").then(|| url.href())
}

/// Keep only http(s) candidates of a srcset, preserving their descriptors.
fn safe_srcset(value: &str) -> String {
    value
        .split(',')
        .filter_map(|candidate| {
            let mut parts = candidate.split_whitespace();
            let url = safe_url(parts.next()?)?;
            Some(match parts.next() {
                Some(descriptor) => format!("{url} {descriptor}"),
                None => url,
            })
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn listen_once(target: &Element, event: &str, callback: impl FnOnce() + 'static) -> Result<()> {
    let options = AddEventListenerOptions::new();
    options.set_once(true);
    let callback = Closure::once_into_js(callback);
    target.add_event_listener_with_callback_and_add_event_listener_options(event, callback.unchecked_ref(), &options)
}

fn focus(node: &Element) {
    if let Some(node) = node.dyn_ref::<HtmlElement>() {
        let options = FocusOptions::new();
        options.set_prevent_scroll(true);
        let _ = node.focus_with_options(&options);
    }
}

/// Rebuild semantic text only: no attributes, handlers, styles or scripts survive.
fn copy_text(source: &Node, target: Element) -> Result<Element> {
    let children = source.child_nodes();
    for child in (0..children.length()).filter_map(|i| children.get(i)) {
        match child.node_type() {
            Node::TEXT_NODE => target.append_with_str_1(&child.text_content().unwrap_or_default())?,
            Node::ELEMENT_NODE => {
                let child: Element = child.unchecked_into();
                let tag = child.tag_name().to_uppercase();
                if SKIP.contains(&tag.as_str()) || child.has_attribute("hidden") || attr(&child, "aria-hidden") == "true" {
                    continue;
                }
                let copy_tag = if KEEP.contains(&tag.as_str()) {
                    tag.to_lowercase()
                } else if BLOCK_LIKE.contains(&tag.as_str()) {
                    "div".into()
                } else {
                    "span".into()
                };
                let copy = el(&copy_tag)?;
                if copy_tag == "a" {
                    if let Some(href) = safe_url(&attr(&child, "href")) {
                        copy.set_attribute("href", &href)?;
                        copy.set_attribute("target", "_blank")?;
                        copy.set_attribute("rel", "noopener noreferrer")?;
                    }
                }
                let copy = copy_text(&child, copy)?;
                target.append_child(&copy)?;
            }
            _ => {}
        }
    }
    Ok(target)
}

fn figure_with_fallback(content: &Element, media: &Element, strings: &Strings) -> Result<Element> {
    let figure = el("figure")?;
    figure.append_child(content)?;
    let (target, message) = (figure.clone(), strings.media_unavailable.clone());
    listen_once(media, "error", move || {
        if target.query_selector("figcaption").ok().flatten().is_none() {
            if let Ok(caption) = el_text("figcaption", &message) {
                let _ = target.append_child(&caption);
            }
        }
    })?;
    Ok(figure)
}

/// NRK backgrounds are lazy `<picture>`s whose `<img>` has no src until the original
/// page scrolls to it, so rebuild the responsive sources rather than reading currentSrc.
fn render_picture(img: &Element, strings: &Strings) -> Result<Option<Element>> {
    let picture = el("picture")?;
    if let Some(original) = img.closest("picture")? {
        let sources = original.query_selector_all("source")?;
        for source in (0..sources.length()).filter_map(|i| sources.get(i)) {
            let source: Element = source.unchecked_into();
            let srcset = safe_srcset(&attr(&source, "srcset"));
            if srcset.is_empty() {
                continue;
            }
            let copy = el("source")?;
            copy.set_attribute("srcset", &srcset)?;
            copy.set_attribute("sizes", SIZES)?;
            for name in ["media", "type", "width", "height"] {
                if let Some(value) = source.get_attribute(name) {
                    copy.set_attribute(name, &value)?;
                }
            }
            picture.append_child(&copy)?;
        }
    }
    let srcset = safe_srcset(&first_attr(img, &["srcset", "data-srcset"]));
    let first_source = picture.query_selector("source")?.map(|s| attr(&s, "srcset")).unwrap_or_else(|| srcset.clone());
    let first_candidate = first_source.split(',').next().and_then(|c| c.split_whitespace().next()).unwrap_or_default();
    let Some(src) = safe_url(&first_attr(img, &["src", "data-src"])).or_else(|| safe_url(first_candidate)) else {
        return Ok(None);
    };
    let image = el("img")?;
    image.set_attribute("src", &src)?;
    image.set_attribute("alt", &attr(img, "alt"))?;
    image.set_attribute("loading", "lazy")?;
    image.set_attribute("decoding", "async")?;
    if !srcset.is_empty() {
        image.set_attribute("srcset", &srcset)?;
        image.set_attribute("sizes", SIZES)?;
    }
    picture.append_child(&image)?;
    figure_with_fallback(&picture, &image, strings).map(Some)
}

/// Untested against live NRK markup: neither reference story contains video.
fn render_video(video: &Element, strings: &Strings) -> Result<Option<Element>> {
    let source = match video.query_selector("source[type=\"video/mp4\"]")? {
        Some(source) => Some(source),
        None => video.query_selector("source")?,
    };
    let source_src = source.map(|s| attr(&s, "src")).unwrap_or_default();
    let candidates = [attr(video, "src"), source_src, attr(video, "data-src")];
    let Some(src) = candidates.iter().find(|v| !v.is_empty()).and_then(|v| safe_url(v)) else {
        return Ok(None);
    };
    let copy = el("video")?;
    for (name, value) in [("src", src.as_str()), ("controls", ""), ("preload", "metadata"), ("playsinline", "")] {
        copy.set_attribute(name, value)?;
    }
    if let Some(poster) = safe_url(&attr(video, "poster")) {
        copy.set_attribute("poster", &poster)?;
    }
    figure_with_fallback(&copy, &copy, strings).map(Some)
}

fn render_background(node: &Element, strings: &Strings) -> Result<Vec<Element>> {
    let media = if let Some(video) = node.query_selector("video")? {
        render_video(&video, strings)?
    } else if let Some(img) = node.query_selector("img")? {
        render_picture(&img, strings)?
    } else {
        None
    };
    Ok(media.into_iter().collect())
}

fn render_cover(node: &Element) -> Result<Vec<Element>> {
    let mut blocks = vec![el_text("h1", &opt_text_of(node.query_selector(".dhks__title")?))?];
    if let Some(lead) = node.query_selector(".dhks__lead")? {
        if !text_of(&lead).is_empty() {
            blocks.push(copy_text(&lead, with_class(el("p")?, "lead"))?);
        }
    }
    let authors = node.query_selector_all(".dhks__author")?;
    let authors: Vec<String> = (0..authors.length())
        .filter_map(|i| authors.get(i))
        .map(|author| -> Result<String> {
            let author: Element = author.unchecked_into();
            let name = Some(opt_text_of(author.query_selector(".dhks__author-name")?))
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| text_of(&author));
            let role = opt_text_of(author.query_selector(".dhks__author-role")?);
            Ok(if role.is_empty() { name } else { format!("{name} ({role})") })
        })
        .collect::<Result<Vec<_>>>()?
        .into_iter()
        .filter(|a| !a.is_empty())
        .collect();
    let date = opt_text_of(node.query_selector(".dhks__publish-date")?);
    let byline = [authors.join(", "), date].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" · ");
    if !byline.is_empty() {
        blocks.push(with_class(el_text("p", &byline)?, "byline"));
    }
    Ok(blocks)
}

fn render_quote(node: &Element) -> Result<Vec<Element>> {
    let quote = match node.query_selector(".dhks__quote")? {
        Some(quote) => quote,
        None => node.query_selector("blockquote")?.unwrap_or_else(|| node.clone()),
    };
    let attribution = opt_text_of(node.query_selector("blockquote footer, .dhks__quote-source")?);
    let figure = with_class(el("figure")?, "quote");
    let blockquote = copy_text(&quote, el("blockquote")?)?;
    figure.append_child(&blockquote)?;
    if !attribution.is_empty() {
        let caption = el_text("figcaption", &format!("— {attribution}"))?;
        figure.append_child(&caption)?;
    }
    Ok(vec![figure])
}

fn render_card(node: &Element) -> Result<Vec<Element>> {
    if node.matches(".dhks__colophon-card")? {
        return Ok(vec![]);
    }
    if node.query_selector(".dhks__title")?.is_some() {
        return render_cover(node);
    }
    if node.matches(".dhks__quote-card")? || node.query_selector(".dhks__quote")?.is_some() {
        return render_quote(node);
    }
    let content = node.query_selector(".dhks__text, .dhks__content")?.unwrap_or_else(|| node.clone());
    if text_of(&content).is_empty() {
        return Ok(vec![]);
    }
    Ok(vec![copy_text(&content, el("section")?)?])
}

fn extract(strings: &Strings) -> Result<Vec<Element>> {
    let nodes = document().query_selector_all(STORY_BLOCK)?;
    let mut blocks = Vec::new();
    for node in (0..nodes.length()).filter_map(|i| nodes.get(i)) {
        let node: Element = node.unchecked_into();
        let nested = match node.parent_element() {
            Some(parent) => parent.closest(STORY_BLOCK)?.is_some(),
            None => false,
        };
        if nested {
            continue;
        }
        blocks.extend(if node.matches(".dhks__background")? { render_background(&node, strings)? } else { render_card(&node)? });
    }
    Ok(blocks)
}

fn reader_is_open() -> bool {
    READER.with_borrow(|reader| reader.as_ref().is_some_and(|host| host.is_connected()))
}

fn response(fields: &[(&str, JsValue)]) -> JsValue {
    let object = js_sys::Object::new();
    for (key, value) in fields {
        let _ = js_sys::Reflect::set(&object, &JsValue::from_str(key), value);
    }
    object.into()
}

fn opened() -> JsValue {
    response(&[("ok", true.into()), ("state", "open".into())])
}

fn failed(error: &str) -> JsValue {
    response(&[("ok", false.into()), ("error", error.into())])
}

fn build_reader(strings: Strings) -> Result<JsValue> {
    if reader_is_open() {
        return Ok(opened());
    }
    let blocks = extract(&strings)?;
    if blocks.is_empty() {
        return Ok(failed("unsupportedArticle"));
    }

    let doc = document();
    let previous_focus = doc.active_element();
    let close = el_text("button", &strings.close)?;
    close.set_attribute("type", "button")?;
    let header = el("header")?;
    let label = el_text("span", &format!("PicArticleFix · {}", strings.title))?;
    header.append_child(&label)?;
    header.append_child(&close)?;
    let article = el("article")?;
    for block in &blocks {
        article.append_child(block)?;
    }
    let dialog: HtmlDialogElement = el("dialog")?.unchecked_into();
    dialog.set_attribute("aria-label", &strings.title)?;
    dialog.append_child(&header)?;
    dialog.append_child(&article)?;

    let host = el("div")?;
    host.set_id("picture-series-reader");
    let shadow = host.attach_shadow(&ShadowRootInit::new(ShadowRootMode::Open))?;
    let style = el_text("style", STYLE)?;
    shadow.append_child(&style)?;
    shadow.append_child(&dialog)?;

    let to_close = dialog.clone();
    listen_once(&close, "click", move || to_close.close())?;
    let to_remove = host.clone();
    listen_once(&dialog, "close", move || {
        to_remove.remove();
        READER.set(None);
        if let Some(previous) = previous_focus.filter(|p| p.is_connected()) {
            focus(&previous);
        }
    })?;

    doc.body().expect_throw("no body").append_child(&host)?;
    READER.set(Some(host));
    dialog.show_modal()?;
    focus(&close);
    Ok(opened())
}

/// Opens the reader, or reports why it could not. Never leaves a half-built reader behind.
#[wasm_bindgen(js_name = openReader)]
pub fn open_reader(close: String, title: String, media_unavailable: String) -> JsValue {
    build_reader(Strings { close, title, media_unavailable }).unwrap_or_else(|_| {
        if let Some(host) = READER.take() {
            host.remove();
        }
        failed("conversionFailed")
    })
}

#[wasm_bindgen(js_name = readerStatus)]
pub fn reader_status() -> JsValue {
    let supported = document().query_selector(STORY_BLOCK).ok().flatten().is_some();
    response(&[
        ("ok", true.into()),
        ("state", if reader_is_open() { "open" } else { "closed" }.into()),
        ("supported", supported.into()),
    ])
}
