import { BaseRenderer } from './BaseRenderer.js';

export class LayoutRenderer extends BaseRenderer {
    render(node, ctx, state) {
        if (node.localName === 'feed') {
            this.renderFeed(node, ctx, state);
        } else if (node.localName === 'cut') {
            this.renderCut(node, ctx, state);
        }
    }

    renderFeed(node, ctx, state) {
        const unit = node.getAttribute('unit');
        const line = node.getAttribute('line');
        const linespc = node.getAttribute('linespc');
        const pos = node.getAttribute('pos');

        const startY = state.currentY;
        let feedAmount = 0;
        let feedLabel = 'feed';

        if (unit !== null) {
            feedAmount = parseInt(unit) || 0;
            feedLabel = `feed: unit="${feedAmount}"`;
        } else if (line !== null) {
            const l = parseInt(line) || 0;
            const lspc = parseInt(linespc) || state.maxLineHeight;
            feedAmount = l * lspc;
            feedLabel = `feed: line="${l}"${linespc ? ' linespc="' + linespc + '"' : ''}`;
        } else if (pos !== null) {
            const p = parseInt(pos) || 0;
            feedAmount = Math.max(0, p - state.currentY);
            feedLabel = `feed: pos="${p}"`;
        }

        if (feedAmount > 0) {
            state.currentY += feedAmount;
            ctx.fillStyle = 'rgba(0, 0, 255, 0.05)';
            ctx.fillRect(0, startY, this.renderer.PRINT_WIDTH, feedAmount);
            ctx.fillStyle = '#999';
            ctx.font = '10px sans-serif';
            ctx.fillText(feedLabel, 5, startY + 12);
            
            this.recordMetadata(node, 0, startY, this.renderer.PRINT_WIDTH, feedAmount);
        }
        
        state.currentX = 0;
        state.maxLineHeight = 24;
    }

    renderCut(node, ctx, state) {
        // In ePOS, cut often happens at the end. We simulate it with a line.
        const type = node.getAttribute('type') || 'feed';
        const startY = state.currentY;
        const cutHeight = 30;

        state.currentY += cutHeight;
        
        ctx.strokeStyle = '#666';
        ctx.setLineDash([10, 5]);
        ctx.beginPath();
        ctx.moveTo(0, startY + cutHeight / 2);
        ctx.lineTo(this.renderer.PRINT_WIDTH, startY + cutHeight / 2);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#666';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`--- PAPER CUT (${type}) ---`, this.renderer.PRINT_WIDTH / 2 - 50, startY + cutHeight / 2 - 5);
        
        this.recordMetadata(node, 0, startY, this.renderer.PRINT_WIDTH, cutHeight);
        
        state.currentX = 0;
        state.maxLineHeight = 24;
    }
}
