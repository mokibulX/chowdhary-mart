import { useEffect } from "react";
import { getAppLanguage, translateTextNodeValue } from "@/lib/i18n";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"]);

function translateElement(root: ParentNode) {
  const language = getAppLanguage();
  if (language === "en") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const next = translateTextNodeValue(node.nodeValue ?? "", language);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[placeholder]").forEach((element) => {
    const placeholder = element.getAttribute("placeholder");
    if (!placeholder) return;
    const next = translateTextNodeValue(placeholder, language);
    if (next !== placeholder) element.setAttribute("placeholder", next);
  });
}

export function GlobalTranslator() {
  useEffect(() => {
    translateElement(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) translateElement(node as Element);
          if (node.nodeType === Node.TEXT_NODE && node.parentElement && !SKIP_TAGS.has(node.parentElement.tagName)) {
            const next = translateTextNodeValue(node.nodeValue ?? "");
            if (next !== node.nodeValue) node.nodeValue = next;
          }
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
