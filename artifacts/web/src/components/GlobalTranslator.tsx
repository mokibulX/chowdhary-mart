import { useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { applyDocumentLanguage, getAppLanguage, translateTextNodeValue } from "@/lib/i18n";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA"]);
const ATTRIBUTES = ["placeholder", "title", "aria-label"] as const;
const MAX_TEXT_LENGTH = 220;

function shouldTranslate(text: string) {
  const value = text.trim();
  if (value.length < 2 || value.length > MAX_TEXT_LENGTH) return false;
  if (!/[A-Za-z]/.test(value)) return false;
  if (/^(https?:|data:|[\w.+-]+@[\w.-]+\.|[A-Z0-9_-]{5,}|[₹$€£]?\s*[\d,.%+-]+)$/i.test(value)) return false;
  return true;
}

function storageKey(language: string) {
  return `cm_ui_translations_v3_${language}`;
}

function readCache(language: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(storageKey(language)) || "{}"); } catch { return {}; }
}

function writeCache(language: string, cache: Record<string, string>) {
  try {
    const entries = Object.entries(cache).slice(-1800);
    localStorage.setItem(storageKey(language), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Translation still works for the current page when storage is unavailable.
  }
}

export function GlobalTranslator() {
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const pending = new Set<string>();
    const attempts = new Map<string, number>();
    const language = getAppLanguage();
    const cache = readCache(language);
    applyDocumentLanguage(language);

    if (language === "en") return;

    const applyText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName) || parent.closest("[data-no-translate]")) return;
      const raw = node.nodeValue ?? "";
      const text = raw.trim();
      if (!shouldTranslate(text)) return;
      const direct = translateTextNodeValue(text, language);
      const translated = direct !== text ? direct : cache[text];
      if (translated && translated !== text) node.nodeValue = raw.replace(text, translated);
      else if ((attempts.get(text) ?? 0) < 3) pending.add(text);
    };

    const applyAttribute = (element: Element, attribute: typeof ATTRIBUTES[number]) => {
      const raw = element.getAttribute(attribute)?.trim();
      if (!raw || !shouldTranslate(raw) || element.closest("[data-no-translate]")) return;
      const direct = translateTextNodeValue(raw, language);
      const translated = direct !== raw ? direct : cache[raw];
      if (translated && translated !== raw) element.setAttribute(attribute, translated);
      else if ((attempts.get(raw) ?? 0) < 3) pending.add(raw);
    };

    const scan = (root: ParentNode) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      nodes.forEach(applyText);
      const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
      elements.forEach((element) => ATTRIBUTES.forEach((attribute) => applyAttribute(element, attribute)));
      schedule();
    };

    const requestTranslations = async () => {
      timer = 0;
      const texts = Array.from(pending).filter((text) => !cache[text]).slice(0, 30);
      texts.forEach((text) => pending.delete(text));
      if (!texts.length || stopped) return;
      try {
        const data = await customFetch<{ translations?: Record<string, string> }>("/api/translate", {
          method: "POST",
          body: JSON.stringify({ target: language, texts }),
          responseType: "json",
        });
        texts.forEach((text) => {
          const translated = data.translations?.[text];
          attempts.set(text, (attempts.get(text) ?? 0) + 1);
          if (translated && translated !== text) cache[text] = translated;
        });
        writeCache(language, cache);
        if (!stopped) scan(document.body);
      } catch {
        // Static dictionary translations remain available when the provider is offline.
      }
      if (pending.size) schedule();
    };

    function schedule() {
      if (!timer && pending.size) timer = window.setTimeout(() => void requestTranslations(), 250);
    }

    scan(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData") applyText(mutation.target as Text);
        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          const attribute = mutation.attributeName as typeof ATTRIBUTES[number] | null;
          if (attribute && ATTRIBUTES.includes(attribute)) applyAttribute(mutation.target, attribute);
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) applyText(node as Text);
          else if (node.nodeType === Node.ELEMENT_NODE) scan(node as Element);
        });
      });
      schedule();
    });
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRIBUTES],
      subtree: true,
    });
    return () => {
      stopped = true;
      observer.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
