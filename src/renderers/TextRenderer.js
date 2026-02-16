import { BaseRenderer } from './BaseRenderer.js';
import { isFullWidth, mapColor } from '../Utils.js';
import { FONTS } from '../Constants.js';

export class TextRenderer extends BaseRenderer {
    render(node, ctx, state) {
        const font = node.getAttribute('font') || 'font_a';
        const lang = node.getAttribute('lang') || 'en';
        const smooth = node.getAttribute('smooth') === 'true';
        const reverse = node.getAttribute('reverse') === 'true';
        const ul = node.getAttribute('ul') === 'true';
        const em = node.getAttribute('em') === 'true';
        const color = node.getAttribute('color') || 'color_1';
        const align = this.getAlign(node.getAttribute('align'));
        const xAttr = node.getAttribute('x');
        const yAttr = node.getAttribute('y');
        const linespcAttr = node.getAttribute('linespc');

        const dw = node.getAttribute('dw') === 'true';
        const dh = node.getAttribute('dh') === 'true';
        
        let width = this.getNumericAttr(node, 'width', (dw ? 2 : 1));
        let height = this.getNumericAttr(node, 'height', (dh ? 2 : 1));

        // Ensure valid ranges (1-8)
        width = Math.max(1, Math.min(8, width));
        height = Math.max(1, Math.min(8, height));

        const text = node.textContent.replace(/\\n/g, '\n');
        const lines = text.split('\n');
        
        const fontInfo = FONTS[font] || FONTS.font_a;
        const charWidth = fontInfo.charWidth * width;
        const lineHeight = fontInfo.lineHeight * height;
        const appliedLinespc = linespcAttr ? parseInt(linespcAttr) : null;

        // Apply absolute positioning if provided
        if (xAttr !== null) {
            const posX = parseInt(xAttr);
            if (!isNaN(posX)) state.currentX = posX;
        }
        if (yAttr !== null) {
            const posY = parseInt(yAttr);
            if (!isNaN(posY)) {
                state.currentY = posY;
                state.maxLineHeight = lineHeight;
            }
        }

        const fontStyle = em ? 'bold ' : '';
        ctx.font = `${fontStyle}${lineHeight}px "Courier New", Courier, monospace`;
        ctx.imageSmoothingEnabled = smooth;

        const textColor = mapColor(color);
        state.maxLineHeight = Math.max(state.maxLineHeight, lineHeight);

        lines.forEach((line, index) => {
            let remainingText = line;
            let isFirstSegmentOfLine = true;

            while (remainingText.length > 0 || (isFirstSegmentOfLine && line.length === 0)) {
                // If we are already beyond the print width, wrap first
                if (state.currentX >= this.renderer.PRINT_WIDTH) {
                    const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                    state.currentY += advanceY;
                    state.currentX = 0;
                    state.maxLineHeight = lineHeight;
                }

                // Calculate how much text fits in the remaining space
                let segmentWidth = 0;
                let segmentLength = 0;
                const availableWidth = this.renderer.PRINT_WIDTH - state.currentX;

                for (let i = 0; i < remainingText.length; i++) {
                    const char = remainingText[i];
                    const charW = isFullWidth(char, lang) ? charWidth * 2 : charWidth;
                    if (segmentWidth + charW > availableWidth) break;
                    segmentWidth += charW;
                    segmentLength++;
                }

                // If nothing fits and we're not at the start of a line, wrap and retry
                if (segmentLength === 0 && remainingText.length > 0 && state.currentX > 0) {
                    const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                    state.currentY += advanceY;
                    state.currentX = 0;
                    state.maxLineHeight = lineHeight;
                    continue;
                }

                // If we're at the start of a line and still nothing fits (very narrow paper or wide char),
                // force at least one character to prevent infinite loop.
                if (segmentLength === 0 && remainingText.length > 0) {
                    segmentLength = 1;
                    const char = remainingText[0];
                    segmentWidth = isFullWidth(char, lang) ? charWidth * 2 : charWidth;
                }

                const segment = remainingText.substring(0, segmentLength);
                
                // Apply alignment if starting at the beginning of a line and not absolutely positioned
                if (state.currentX === 0 && xAttr === null && align !== 'left') {
                    if (align === 'center' || align === 'centre') {
                        state.currentX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - segmentWidth) / 2));
                    } else if (align === 'right') {
                        state.currentX = Math.max(0, this.renderer.PRINT_WIDTH - segmentWidth);
                    }
                }

                const drawStartX = state.currentX;
                const drawStartY = state.currentY;

                // Draw each character in the segment
                for (let j = 0; j < segment.length; j++) {
                    const char = segment[j];
                    const isWide = isFullWidth(char, lang);
                    const actualCharWidth = isWide ? charWidth * 2 : charWidth;

                    if (textColor !== 'none') {
                        if (reverse) {
                            ctx.fillStyle = textColor;
                            ctx.fillRect(state.currentX, state.currentY, actualCharWidth, lineHeight);
                            ctx.fillStyle = 'white';
                        } else {
                            ctx.fillStyle = textColor;
                        }
                        ctx.fillText(char, state.currentX, state.currentY, actualCharWidth);
                        
                        if (ul) {
                            ctx.strokeStyle = reverse ? 'white' : textColor;
                            ctx.lineWidth = Math.max(1, height);
                            ctx.beginPath();
                            ctx.moveTo(state.currentX, state.currentY + lineHeight - 1);
                            ctx.lineTo(state.currentX + actualCharWidth, state.currentY + lineHeight - 1);
                            ctx.stroke();
                        }
                    }
                    state.currentX += actualCharWidth;
                }

                // Record metadata for this segment
                this.recordMetadata(node, drawStartX, drawStartY, state.currentX - drawStartX, state.maxLineHeight);

                remainingText = remainingText.substring(segmentLength);
                isFirstSegmentOfLine = false;
                
                // If there's more text in this line, it means we wrapped
                if (remainingText.length > 0) {
                    const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                    state.currentY += advanceY;
                    state.currentX = 0;
                    state.maxLineHeight = lineHeight;
                }

                if (line.length === 0) break; // Handle empty lines
            }

            // After finishing a split('\n') line, advance unless it's the last one
            if (index < lines.length - 1) {
                const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                state.currentY += advanceY;
                state.currentX = 0;
                state.maxLineHeight = lineHeight;
            }
        });
    }
}
