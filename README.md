# SVG Foreign Canvas

A utility to render SVG elements with HTML content as Canvas, enabling the use of a `<foreignObject>` approach to embed HTML within SVG and then convert to Canvas.

## Features

- Convert SVG elements with embedded HTML to Canvas
- Preserve styles and formatting from both SVG and HTML elements
- Support for complex layouts and nested elements
- Handle custom fonts and styling
- Cross-browser compatible implementation

## Files

- `svgToCanvas.js` - The main utility for converting SVG to Canvas
- `testSvgToCanvas.html` - Testing file showing examples of SVG to Canvas conversion
- `index.html` - Simple demo page

## Usage

```js
// Create an instance
const converter = new SvgToCanvas();

// Convert an SVG element to canvas
const canvas = await converter.convertToCanvas(svgElement);

// Or using the static method
const canvas = await SvgToCanvas.svgToCanvas(svgElement);
```

## License

See LICENSE file for details. 