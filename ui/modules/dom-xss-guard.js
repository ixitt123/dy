(() => {
  if (window.__domXssGuard) return;

  const innerHtmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  const nativeInnerHtmlGet = innerHtmlDescriptor?.get;
  const nativeInnerHtmlSet = innerHtmlDescriptor?.set;
  const nativeInsertAdjacentHtml = Element.prototype.insertAdjacentHTML;
  if (!nativeInnerHtmlGet || !nativeInnerHtmlSet || !nativeInsertAdjacentHtml) return;

  const urlAttributes = new Set(["href", "src", "xlink:href", "action", "formaction", "poster"]);
  const dangerousUrl = /^(?:javascript|vbscript):|^data:(?:text\/html|image\/svg\+xml)/iu;
  const dangerousStyle = /(?:expression\s*\(|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html)/iu;

  function sanitizeFragment(value) {
    const template = document.createElement("template");
    nativeInnerHtmlSet.call(template, String(value ?? ""));
    template.content.querySelectorAll("script,object,embed,base,svg,math,template").forEach((node) => node.remove());
    template.content.querySelectorAll("iframe[srcdoc]").forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        const normalizedValue = attribute.value.replace(/[\u0000-\u0020]+/gu, "").trim();
        if (name.startsWith("on") || name === "srcdoc") {
          node.removeAttribute(attribute.name);
          continue;
        }
        if (urlAttributes.has(name) && dangerousUrl.test(normalizedValue)) {
          node.removeAttribute(attribute.name);
          continue;
        }
        if (name === "style" && dangerousStyle.test(attribute.value)) node.removeAttribute(attribute.name);
      }
    });
    return nativeInnerHtmlGet.call(template);
  }

  Object.defineProperty(Element.prototype, "innerHTML", {
    configurable: innerHtmlDescriptor.configurable,
    enumerable: innerHtmlDescriptor.enumerable,
    get: nativeInnerHtmlGet,
    set(value) {
      nativeInnerHtmlSet.call(this, sanitizeFragment(value));
    },
  });

  Element.prototype.insertAdjacentHTML = function guardedInsertAdjacentHTML(position, value) {
    return nativeInsertAdjacentHtml.call(this, position, sanitizeFragment(value));
  };

  window.__domXssGuard = Object.freeze({ sanitizeFragment });
})();
