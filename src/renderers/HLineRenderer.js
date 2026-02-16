import { BaseRenderer } from './BaseRenderer.js';
import { mapColor } from '../Utils.js';

export class HLineRenderer extends BaseRenderer {
    render(node, ctx, state) {
        const x1Attr = node.getAttribute('x1');
        const x2Attr = node.getAttribute('x2');
        const style = node.getAttribute('style') || 'line_thin';
        const color = node.getAttribute('color') || 'color_1';

        const x1 = x1Attr ? parseInt(x1Attr) : 0;
        const x2 = x2Attr ? parseInt(x2Attr) : this.renderer.PRINT_WIDTH;
        const drawColor = mapColor(color);

        ctx.strokeStyle = drawColor;
        ctx.beginPath();

        switch (style) {
            case 'line_thick':
                ctx.lineWidth = 4;
                break;
            case 'line_double':
                // Double line is two thin lines
                ctx.lineWidth = 1;
                ctx.moveTo(x1, state.currentY + 2);
                ctx.lineTo(x2, state.currentY + 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x1, state.currentY + 6);
                ctx.lineTo(x2, state.currentY + 6);
                break;
            case 'line_thin':
            default:
                ctx.lineWidth = 2;
                break;
        }

        ctx.moveTo(x1, state.currentY + 4);
        ctx.lineTo(x2, state.currentY + 4);
        ctx.stroke();

        this.recordMetadata(node, x1, state.currentY, x2 - x1, 8);
        
        state.currentY += 8;
        state.currentX = 0;
    }
}
