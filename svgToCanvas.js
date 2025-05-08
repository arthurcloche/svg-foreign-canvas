/**
 * DOM to Canvas Renderer
 * Renders HTML elements to canvas using SVG foreign objects
 */

/**
 * Convert HTML string to valid XML for SVG foreignObject
 * @param {string} html - HTML string to convert
 * @returns {string} - Valid XML string
 */
function convertHtmlToXml(html) {
  const doc = document.implementation.createHTMLDocument("temp");

  // Clear document and prepare it
  const range = doc.createRange();
  range.selectNodeContents(doc.documentElement);
  range.deleteContents();

  // Add necessary structure
  const head = document.createElement("head");
  doc.documentElement.appendChild(head);
  doc.documentElement.appendChild(range.createContextualFragment(html));
  doc.documentElement.setAttribute("xmlns", doc.documentElement.namespaceURI);

  // Serialize to XML
  const serialized = new XMLSerializer().serializeToString(doc);
  return serialized.replace(/<!DOCTYPE html>/, "");
}

/**
 * Deep clone DOM node
 * @param {HTMLElement} node - Node to clone
 * @returns {HTMLElement} - Cloned node
 */
function cloneNode(node) {
  return node.cloneNode(true);
}

/**
 * Get the full calculated height of an element including all children
 * @param {HTMLElement} element - Element to measure
 * @returns {number} - Full height
 */
function getFullElementHeight(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  // Get all child elements
  const children = Array.from(element.children);

  if (children.length === 0) {
    return rect.height;
  }

  // Find the maximum bottom position of all children
  const maxChildBottom = children.reduce((max, child) => {
    // Recursively check child elements for their full heights
    const childHeight = getFullElementHeight(child);
    const childRect = child.getBoundingClientRect();
    return Math.max(max, childRect.top + childHeight);
  }, rect.top);

  // Calculate height from top of element to bottom of furthest child
  const height = maxChildBottom - rect.top;

  // Add padding and border if box-sizing is content-box
  if (style.boxSizing === "content-box") {
    return (
      height +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderBottomWidth)
    );
  }

  // Add a small buffer to avoid cutting off content
  return height + 5;
}

/**
 * Render DOM element to canvas
 * @param {HTMLElement} element - Element to render
 * @param {number} opacity - Opacity to apply (0-1)
 * @param {OffscreenCanvas|null} oldCanvas - Optional canvas to reuse
 * @returns {Promise<OffscreenCanvas>} - Canvas with rendered element
 */
async function getCanvasFromElement(element, opacity = 1, oldCanvas = null) {
  // Wait for images to load
  const images = element.querySelectorAll("img");
  await Promise.all(
    Array.from(images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    })
  );

  // Get element dimensions and device pixel ratio
  const rect = element.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Use exact dimensions from the source element with a buffer
  const buffer = 20; // Extra pixels to ensure no content is cut off
  const cssWidth = Math.ceil(rect.width);
  const cssHeight = Math.ceil(rect.height) + buffer;

  // Calculate high-resolution dimensions
  const canvasWidth = Math.ceil(cssWidth * dpr);
  const canvasHeight = Math.ceil(cssHeight * dpr);

  // Create or reuse canvas with high-resolution dimensions
  const canvas =
    oldCanvas &&
    oldCanvas.width === canvasWidth &&
    oldCanvas.height === canvasHeight
      ? oldCanvas
      : new OffscreenCanvas(canvasWidth, canvasHeight);

  // Clone element and sync all styles
  const clonedElement = cloneNode(element);
  await syncStylesOfTree(element, clonedElement);

  // Set opacity and remove margins
  clonedElement.style.setProperty("opacity", opacity.toString());
  clonedElement.style.setProperty("margin", "0px");

  // Ensure element has the same dimensions as the original
  clonedElement.style.setProperty("width", `${cssWidth}px`);
  clonedElement.style.setProperty("height", `${cssHeight}px`);
  clonedElement.style.setProperty("overflow", "visible");

  // Create SVG string with properly specified dimensions
  const html = clonedElement.outerHTML;
  const xml = convertHtmlToXml(html);

  // Create SVG with foreignObject containing the element
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" 
         width="${canvasWidth}" 
         height="${canvasHeight}" 
         viewBox="0 0 ${cssWidth} ${cssHeight}">
      <foreignObject x="0" y="0" width="${cssWidth}" height="${cssHeight}">
        ${xml}
      </foreignObject>
    </svg>
  `
    .trim()
    .replace(/\s+/g, " ");

  // Create image from SVG and draw to canvas
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Failed to get canvas context"));

      // Clear canvas and draw image
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.scale(dpr, dpr);
      ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      resolve(canvas);
    };

    img.onerror = (err) => {
      console.error("SVG load error:", err);
      reject(new Error(`Failed to load image: ${err}`));
    };

    // Set source to SVG data URL
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * Recursively sync styles between two DOM elements
 * @param {HTMLElement} sourceElement - Source element
 * @param {HTMLElement} targetElement - Target element to apply styles to
 */
async function syncStylesOfTree(sourceElement, targetElement) {
  try {
    // Copy computed styles
    const styles = window.getComputedStyle(sourceElement);
    for (const key of Array.from(styles)) {
      try {
        targetElement.style.setProperty(
          key,

          styles.getPropertyValue(key),
          styles.getPropertyPriority(key)
        );
      } catch (e) {
        // Ignore errors for properties that can't be set
      }
    }

    // Handle special element types - be careful with SVG elements
    if (!(targetElement instanceof SVGElement)) {
      // Only set className on HTML elements, not SVG elements
      if ("className" in targetElement) {
        targetElement.className = sourceElement.className;
      }
    }

    // Handle special element types
    if (
      targetElement.tagName === "INPUT" ||
      targetElement.tagName === "SELECT"
    ) {
      // For inputs, ensure value is copied
      targetElement.value = sourceElement.value;
      targetElement.setAttribute("value", sourceElement.value);

      // Handle checked state for checkboxes/radios
      if (sourceElement.type === "checkbox" || sourceElement.type === "radio") {
        targetElement.checked = sourceElement.checked;
      }
    } else if (targetElement.tagName === "TEXTAREA") {
      // For textareas, ensure content is copied
      targetElement.value = sourceElement.value;
      targetElement.innerHTML = sourceElement.value;
    }

    // Recursively process children
    for (let i = 0; i < sourceElement.children.length; i++) {
      if (i < targetElement.children.length) {
        await syncStylesOfTree(
          sourceElement.children[i],
          targetElement.children[i]
        );
      }
    }
  } catch (err) {
    console.warn("Error syncing styles:", err);
    // Continue processing even if an error occurs
  }
}

export { convertHtmlToXml, cloneNode, getCanvasFromElement, syncStylesOfTree };
