# ePOS-Print WYSIWYG

An interactive, web-based WYSIWYG editor for Epson ePOS-Print XML. This tool allows you to design receipt layouts visually and generates the corresponding XML for Epson POS printers.

## Features

- **Visual Editor:** Real-time preview of your receipt layout.
- **Element Support:**
  - **Text:** Add and format text.
  - **Graphics:** Horizontal lines, Barcodes, 2D Symbols (QR codes), Images, and Logos.
  - **Layout:** Paper feed and cut commands.
- **Interactive Properties:** Click any element in the preview to edit its properties (font, size, alignment, etc.) instantly.
- **XML Management:**
  - **Save/Load:** Export and import layouts as `.xml` files.
  - **Copy XML:** Quickly copy the generated XML to your clipboard.
- **Printer Integration:** Send your design directly to a network printer from the browser.
- **User Experience:**
  - Dark Mode support.
  - Pan and Zoom functionality.
  - Undo/Redo history.
  - Shareable URLs (encodes the current design in the URL).

## How to Use

1.  **Add Elements:** Use the **Text**, **Graphics**, and **Layout** tabs in the toolbar to add elements to your receipt.
2.  **Edit Elements:** Click on any element in the preview area to open the Properties panel on the right. Changes are applied instantly.
3.  **Reorder:** Use the **Move Up ↑** and **Move Down ↓** buttons in the Properties panel to change the sequence of elements.
4.  **Navigation:**
    - **Pan:** Hold `Space` + **Left Click** or use **Middle Click** to move the canvas.
    - **Zoom:** Use the `+` / `-` buttons or `Ctrl` + **Mouse Wheel**.
    - **Reset:** Click the **100%** button to reset zoom and position.

## Keyboard Shortcuts

- `Ctrl` + `Z`: Undo
- `Ctrl` + `Y`: Redo
- `Delete` / `Backspace`: Delete selected element
- `Space` + **Drag**: Pan canvas
- `+` / `-`: Zoom In / Out
- `Ctrl` + `0`: Reset Zoom

## Installation

This is a static web application. No installation is required. Simply open `index.html` in a modern web browser.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 Liam Wilson
