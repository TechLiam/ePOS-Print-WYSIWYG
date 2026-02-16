import { TextRenderer } from './renderers/TextRenderer.js';
import { BarcodeRenderer } from './renderers/BarcodeRenderer.js';
import { SymbolRenderer } from './renderers/SymbolRenderer.js';
import { ImageRenderer } from './renderers/ImageRenderer.js';
import { HLineRenderer } from './renderers/HLineRenderer.js';
import { LogoRenderer } from './renderers/LogoRenderer.js';
import { LayoutRenderer } from './renderers/LayoutRenderer.js';

export class Renderer {
    constructor(canvasId, printWidth) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.elementsMetadata = [];
        this.offscreenCanvas = document.createElement('canvas');
        this.contentHeight = 0;
        
        this.setPrintWidth(printWidth);

        // Initialize element renderers
        this.renderers = {
            'text': new TextRenderer(this),
            'barcode': new BarcodeRenderer(this),
            'symbol': new SymbolRenderer(this),
            'image': new ImageRenderer(this),
            'hline': new HLineRenderer(this),
            'logo': new LogoRenderer(this),
            'feed': new LayoutRenderer(this),
            'cut': new LayoutRenderer(this)
        };
    }

    setPrintWidth(width) {
        this.PRINT_WIDTH = width;
        this.canvas.width = width;
        this.offscreenCanvas.width = width;
    }

    async refreshDisplay(xmlDoc, hoveredElement, editingElement) {
        this.elementsMetadata = [];
        this.offscreenCanvas.width = this.PRINT_WIDTH;
        this.offscreenCanvas.height = 8000; // Reset height to buffer
        const octx = this.offscreenCanvas.getContext('2d');

        this.clearCanvas(octx, this.offscreenCanvas.width, this.offscreenCanvas.height);
        
        octx.fillStyle = 'black';
        octx.font = `24px monospace`; 
        octx.textBaseline = 'top';

        const state = {
            currentX: 0,
            currentY: 0,
            maxLineHeight: 24,
            activeVlines: [], // Vertical lines not yet implemented in modular version
            pendingCutType: null
        };

        if (xmlDoc && xmlDoc.documentElement) {
            await this.processNodes(xmlDoc.documentElement.childNodes, octx, state);
        }

        this.contentHeight = Math.max(state.currentY + state.maxLineHeight, 100);
        this.draw(hoveredElement, editingElement);
    }

    async processNodes(nodes, ctx, state) {
        for (let node of nodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            
            const type = node.localName;
            const renderer = this.renderers[type];
            
            if (renderer) {
                await renderer.render(node, ctx, state);
            } else {
                // If it's a container element or unknown, process children
                if (node.childNodes.length > 0) {
                    await this.processNodes(node.childNodes, ctx, state);
                }
            }
        }
    }

    draw(hoveredElement, editingElement) {
        if (!this.offscreenCanvas) return;

        this.canvas.height = this.contentHeight;
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.PRINT_WIDTH, this.contentHeight, 0, 0, this.PRINT_WIDTH, this.contentHeight);

        // Draw highlights for editing element (all segments)
        if (editingElement) {
            this.elementsMetadata.forEach(meta => {
                if (meta.node === editingElement) {
                    this.drawHighlight(meta);
                }
            });
        }

        // Draw highlight for hovered element
        if (hoveredElement && hoveredElement.node !== editingElement) {
            this.drawHighlight(hoveredElement);
        }
    }

    drawHighlight(meta) {
        if (!meta) return;
        const { x, y, width, height } = meta;
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 3]);
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.setLineDash([]);
    }

    clearCanvas(ctx, width, height, color = 'white') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
    }
    
    showError(message) {
        this.clearCanvas(this.ctx, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '16px monospace';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(message, 10, 10);
    }
}
