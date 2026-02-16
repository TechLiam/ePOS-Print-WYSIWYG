import { BaseRenderer } from './BaseRenderer.js';
import { mapColor } from '../Utils.js';

export class ImageRenderer extends BaseRenderer {
    render(node, ctx, state, octx) {
        const width = parseInt(node.getAttribute('width'));
        const height = parseInt(node.getAttribute('height'));
        const color = node.getAttribute('color') || 'color_1';
        const align = this.getAlign(node.getAttribute('align'));
        const mode = node.getAttribute('mode') || 'mono';
        const data = node.textContent.trim();

        if (isNaN(width) || isNaN(height) || !data) return;

        let startX = state.currentX;
        if (align === 'center' || align === 'centre' || align === 'right') {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
            }
            if (align === 'right') {
                startX = Math.max(0, this.renderer.PRINT_WIDTH - width);
            } else {
                startX = Math.max(0, Math.floor((this.renderer.PRINT_WIDTH - width) / 2));
            }
        }

        try {
            const binary = atob(data);
            const rasterData = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                rasterData[i] = binary.charCodeAt(i);
            }

            const imgData = ctx.createImageData(width, height);
            const pixels = imgData.data;
            const textColor = mapColor(color);
            
            // Get RGB components of textColor
            const dummy = document.createElement('div');
            dummy.style.color = textColor === 'none' ? 'black' : textColor;
            document.body.appendChild(dummy);
            const style = window.getComputedStyle(dummy);
            const rgb = style.color.match(/\d+/g).map(Number);
            document.body.removeChild(dummy);

            if (mode === 'gray16') {
                const bytesPerRow = Math.ceil(width / 2);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const byteIdx = y * bytesPerRow + Math.floor(x / 2);
                        let intensity;
                        if (x % 2 === 0) {
                            intensity = (rasterData[byteIdx] >> 4) & 0x0F;
                        } else {
                            intensity = rasterData[byteIdx] & 0x0F;
                        }
                        
                        const alpha = Math.round((intensity / 15) * 255);
                        const pixelIdx = (y * width + x) * 4;
                        pixels[pixelIdx] = rgb[0];
                        pixels[pixelIdx + 1] = rgb[1];
                        pixels[pixelIdx + 2] = rgb[2];
                        pixels[pixelIdx + 3] = alpha;
                    }
                }
            } else {
                const bytesPerRow = Math.ceil(width / 8);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const byteIdx = y * bytesPerRow + Math.floor(x / 8);
                        const bitIdx = 7 - (x % 8);
                        const isBlack = (rasterData[byteIdx] >> bitIdx) & 1;
                        
                        const pixelIdx = (y * width + x) * 4;
                        pixels[pixelIdx] = rgb[0];
                        pixels[pixelIdx + 1] = rgb[1];
                        pixels[pixelIdx + 2] = rgb[2];
                        pixels[pixelIdx + 3] = isBlack ? 255 : 0;
                    }
                }
            }

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            tempCanvas.getContext('2d').putImageData(imgData, 0, 0);
            
            ctx.drawImage(tempCanvas, startX, state.currentY);
            this.recordMetadata(node, startX, state.currentY, width, height);

            if (align === 'center' || align === 'centre' || align === 'right') {
                state.currentY += height + 10;
                state.currentX = 0;
                state.maxLineHeight = 24;
            } else {
                state.currentX = startX + width;
                state.maxLineHeight = Math.max(state.maxLineHeight, height);
            }
        } catch (e) {
            console.error('Image rendering error', e);
        }
    }
}
