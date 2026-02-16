import { BaseRenderer } from './BaseRenderer.js';
import { FONTS } from '../Constants.js';

export class BarcodeRenderer extends BaseRenderer {
    async render(node, ctx, state) {
        const type = node.getAttribute('type') || 'code128';
        const hri = node.getAttribute('hri') || 'none';
        const font = node.getAttribute('font') || 'font_a';
        const widthAttr = node.getAttribute('width');
        const heightAttr = node.getAttribute('height');
        const align = this.getAlign(node.getAttribute('align'));
        const data = node.textContent.trim();

        const width = widthAttr ? parseInt(widthAttr) : 3;
        const height = heightAttr ? parseInt(heightAttr) : 162;

        if (!data) return;

        const startY_original = state.currentY;
        
        // HRI Font Height
        const fontInfo = FONTS[font] || FONTS.font_a;
        const hriFontHeight = fontInfo.lineHeight;

        try {
            // Try to use bwip-js if available, otherwise fallback to simulation
            if (window.bwipjs) {
                await this.renderRealBarcode(data, type, hri, font, width, height, align, ctx, state, node, hriFontHeight);
            } else {
                this.renderSimulatedBarcode(data, type, hri, font, width, height, align, ctx, state, node, hriFontHeight);
            }
        } catch (e) {
            console.error('Barcode rendering failed', e);
            this.renderSimulatedBarcode(data, type, hri, font, width, height, align, ctx, state, node, hriFontHeight);
        }
    }

    async renderRealBarcode(data, type, hri, font, width, height, align, ctx, state, node, hriFontHeight) {
        // Map ePOS types to bwip-js types
        const typeMap = {
            'upc_a': 'upca',
            'upc_e': 'upce',
            'jan13': 'ean13',
            'jan8': 'ean8',
            'code39': 'code39',
            'itf': 'itf14',
            'codabar': 'codabar',
            'code93': 'code93',
            'code128': 'code128',
            'gs1_128': 'gs1-128',
            'gs1_databar_omnidirectional': 'gs1databar',
            'gs1_databar_truncated': 'gs1databartruncated',
            'gs1_databar_limited': 'gs1databarlimited',
            'gs1_databar_expanded': 'gs1databarexpanded'
        };

        const bcid = typeMap[type.toLowerCase()] || 'code128';
        
        // Create a temporary canvas to render the barcode
        const tempCanvas = document.createElement('canvas');
        
        const opts = {
            bcid: bcid,
            text: data,
            scale: width,
            height: height / 2.54, // bwip-js height is in mm or points? Actually it's just a factor.
            // ePOS height is in dots.
            includetext: false, // We'll handle HRI ourselves for better control
        };
        
        // Adjust height for bwip-js (it uses a different scale)
        opts.height = height / width; 

        window.bwipjs.toCanvas(tempCanvas, opts);

        const totalBarcodeWidth = tempCanvas.width;
        const barcodeHeight = tempCanvas.height;

        let startX = state.currentX;
        if (align === 'center' || align === 'centre' || align === 'right') {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - totalBarcodeWidth);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - totalBarcodeWidth) / 2));
            }
        }

        let currentY = state.currentY;
        let totalElementHeight = barcodeHeight;

        // HRI Above
        if (hri === 'above' || hri === 'both') {
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = `${hriFontHeight}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(data, startX + totalBarcodeWidth / 2, currentY);
            ctx.restore();
            currentY += hriFontHeight + 4;
            totalElementHeight += hriFontHeight + 4;
        }

        ctx.drawImage(tempCanvas, startX, currentY);
        
        const barcodeBottomY = currentY + barcodeHeight;

        // HRI Below
        if (hri === 'below' || hri === 'both') {
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = `${hriFontHeight}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(data, startX + totalBarcodeWidth / 2, barcodeBottomY + 4);
            ctx.restore();
            totalElementHeight += hriFontHeight + 10;
        }

        this.recordMetadata(node, startX, state.currentY, totalBarcodeWidth, totalElementHeight);

        // Update state
        if (align === 'center' || align === 'centre' || align === 'right') {
            state.currentY += totalElementHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = 24;
        } else {
            state.currentX = startX + totalBarcodeWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, totalElementHeight);
        }
    }

    renderSimulatedBarcode(data, type, hri, font, width, height, align, ctx, state, node, hriFontHeight) {
        // Fallback to original simulation logic
        const startY_original = state.currentY;
        const moduleWidth = Math.max(2, Math.min(6, width));
        const barcodeHeight = Math.max(1, Math.min(255, height));
        
        let modulesCount = (data.length + 2) * 11;
        const totalBarcodeWidth = modulesCount * moduleWidth;

        let startX = state.currentX;
        if (align === 'center' || align === 'centre' || align === 'right') {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - totalBarcodeWidth);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - totalBarcodeWidth) / 2));
            }
        }

        let currentY = state.currentY;
        let totalElementHeight = barcodeHeight;

        if (hri === 'above' || hri === 'both') {
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = `${hriFontHeight}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(data, startX + totalBarcodeWidth / 2, currentY);
            ctx.restore();
            currentY += hriFontHeight + 4;
            totalElementHeight += hriFontHeight + 4;
        }

        // Draw Simulated Bars
        ctx.save();
        ctx.fillStyle = 'black';
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
            hash = ((hash << 5) - hash) + data.charCodeAt(i);
            hash |= 0;
        }
        for (let i = 0; i < modulesCount; i++) {
            const val = Math.abs(Math.sin(hash + i * 1.5));
            if (val > 0.4) {
                ctx.fillRect(startX + i * moduleWidth, currentY, moduleWidth, barcodeHeight);
            }
        }
        ctx.restore();
        
        const barcodeBottomY = currentY + barcodeHeight;

        if (hri === 'below' || hri === 'both') {
            ctx.save();
            ctx.fillStyle = 'black';
            ctx.font = `${hriFontHeight}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(data, startX + totalBarcodeWidth / 2, barcodeBottomY + 4);
            ctx.restore();
            totalElementHeight += hriFontHeight + 10;
        }

        this.recordMetadata(node, startX, state.currentY, totalBarcodeWidth, totalElementHeight);

        if (align === 'center' || align === 'centre' || align === 'right') {
            state.currentY += totalElementHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = 24;
        } else {
            state.currentX = startX + totalBarcodeWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, totalElementHeight);
        }
    }
}
