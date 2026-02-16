import { BaseRenderer } from './BaseRenderer.js';

export class LogoRenderer extends BaseRenderer {
    render(node, ctx, state) {
        const key1 = node.getAttribute('key1');
        const key2 = node.getAttribute('key2');
        const align = this.getAlign(node.getAttribute('align'));

        const logoWidth = 120;
        const logoHeight = 60;
        
        let startX = state.currentX;
        if (align === 'center' || align === 'centre' || align === 'right') {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - logoWidth);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - logoWidth) / 2));
            }
        }

        ctx.strokeStyle = '#999';
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(startX, state.currentY, logoWidth, logoHeight);
        ctx.setLineDash([]);
        ctx.fillStyle = '#666';
        ctx.font = '10px sans-serif';
        ctx.fillText(`LOGO [${key1},${key2}]`, startX + 5, state.currentY + logoHeight / 2);

        this.recordMetadata(node, startX, state.currentY, logoWidth, logoHeight);

        if (align === 'center' || align === 'centre' || align === 'right') {
            state.currentY += logoHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = 24;
        } else {
            state.currentX = startX + logoWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, logoHeight);
        }
    }
}
