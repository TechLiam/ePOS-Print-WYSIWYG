import { BaseRenderer } from './BaseRenderer.js';

export class SymbolRenderer extends BaseRenderer {
    async render(node, ctx, state) {
        const type = node.getAttribute('type') || 'qrcode_model_2';
        const level = node.getAttribute('level') || 'level_m';
        const widthAttr = node.getAttribute('width');
        const heightAttr = node.getAttribute('height');
        const sizeAttr = node.getAttribute('size');
        const align = this.getAlign(node.getAttribute('align'));
        const xAttr = node.getAttribute('x');
        const yAttr = node.getAttribute('y');
        const data = node.textContent.trim();

        if (!data) return;

        const moduleW = this.getNumericAttr(node, 'width', (this.getNumericAttr(node, 'size', 4)));
        const moduleH = this.getNumericAttr(node, 'height', moduleW);

        try {
            if (window.bwipjs) {
                await this.renderRealSymbol(data, type, level, moduleW, moduleH, align, xAttr, yAttr, ctx, state, node);
            } else {
                this.renderSimulatedSymbol(data, type, level, moduleW, moduleH, align, xAttr, yAttr, ctx, state, node);
            }
        } catch (e) {
            console.error('Symbol rendering failed', e);
            this.renderSimulatedSymbol(data, type, level, moduleW, moduleH, align, xAttr, yAttr, ctx, state, node);
        }
    }

    async renderRealSymbol(data, type, level, moduleW, moduleH, align, xAttr, yAttr, ctx, state, node) {
        const typeMap = {
            'pdf417_standard': 'pdf417',
            'pdf417_truncated': 'pdf417',
            'qrcode_model_1': 'qrcode',
            'qrcode_model_2': 'qrcode',
            'qrcode_micro': 'microqrcode',
            'maxicode_mode_2': 'maxicode',
            'maxicode_mode_3': 'maxicode',
            'maxicode_mode_4': 'maxicode',
            'maxicode_mode_5': 'maxicode',
            'maxicode_mode_6': 'maxicode',
            'gs1_databar_stacked': 'gs1databarstacked',
            'gs1_databar_stacked_omnidirectional': 'gs1databarstackedomnidirectional',
            'gs1_databar_expanded_stacked': 'gs1databarexpandedstacked',
            'aztec_fullrange': 'azteccode',
            'aztec_compact': 'azteccode',
            'datamatrix_square': 'datamatrix',
            'datamatrix_rectangle_8': 'datamatrix',
            'datamatrix_rectangle_12': 'datamatrix',
            'datamatrix_rectangle_16': 'datamatrix'
        };

        const bcid = typeMap[type.toLowerCase()] || 'qrcode';
        const tempCanvas = document.createElement('canvas');
        
        const opts = {
            bcid: bcid,
            text: data,
            scale: moduleW,
            eclevel: level.replace('level_', '').toUpperCase()
        };

        window.bwipjs.toCanvas(tempCanvas, opts);

        const totalWidth = tempCanvas.width;
        const totalHeight = tempCanvas.height;

        // Absolute positioning
        if (xAttr !== null) {
            const posX = parseInt(xAttr);
            if (!isNaN(posX)) state.currentX = posX;
        }
        if (yAttr !== null) {
            const posY = parseInt(yAttr);
            if (!isNaN(posY)) {
                state.currentY = posY;
                state.maxLineHeight = totalHeight;
            }
        }

        let startX = state.currentX;
        if (xAttr === null && (align === 'center' || align === 'centre' || align === 'right')) {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - totalWidth);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - totalWidth) / 2));
            }
        }

        ctx.drawImage(tempCanvas, startX, state.currentY);
        this.recordMetadata(node, startX, state.currentY, totalWidth, totalHeight);

        if (xAttr === null && (align === 'center' || align === 'centre' || align === 'right')) {
            state.currentY += totalHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = 24;
        } else {
            state.currentX = startX + totalWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, totalHeight);
        }
    }

    renderSimulatedSymbol(data, type, level, moduleW, moduleH, align, xAttr, yAttr, ctx, state, node) {
        // Original simulation logic
        let cols = 21;
        let rows = 21;

        const lowType = type.toLowerCase();
        if (lowType.includes('pdf417')) {
            cols = 17;
            rows = Math.max(3, Math.ceil((data.length + 10) / 8));
        } else if (lowType.includes('datamatrix')) {
            cols = rows = 24;
        } else {
            const version = Math.max(1, Math.ceil((data.length + 8) / 10));
            cols = rows = 21 + 4 * version;
        }

        const totalWidth = cols * moduleW;
        const totalHeight = rows * moduleH;

        if (xAttr !== null) {
            const posX = parseInt(xAttr);
            if (!isNaN(posX)) state.currentX = posX;
        }
        if (yAttr !== null) {
            const posY = parseInt(yAttr);
            if (!isNaN(posY)) {
                state.currentY = posY;
                state.maxLineHeight = totalHeight;
            }
        }

        let startX = state.currentX;
        if (xAttr === null && (align === 'center' || align === 'centre' || align === 'right')) {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - totalWidth);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - totalWidth) / 2));
            }
        }

        let hash = 0;
        const seed = `${data}|${type}|${level}`;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }

        ctx.save();
        ctx.fillStyle = 'black';
        // Simple pattern for simulation
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let v = hash ^ (r * 374761393) ^ (c * 668265263);
                if (((v & 0xffff) / 0xffff) > 0.55) {
                    ctx.fillRect(startX + c * moduleW, state.currentY + r * moduleH, moduleW, moduleH);
                }
            }
        }
        ctx.restore();

        this.recordMetadata(node, startX, state.currentY, totalWidth, totalHeight);

        if (xAttr === null && (align === 'center' || align === 'centre' || align === 'right')) {
            state.currentY += totalHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = 24;
        } else {
            state.currentX = startX + totalWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, totalHeight);
        }
    }
}
