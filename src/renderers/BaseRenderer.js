export class BaseRenderer {
    constructor(renderer) {
        this.renderer = renderer;
    }

    /**
     * Record element's position and size for interaction
     */
    recordMetadata(node, x, y, width, height) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        this.renderer.elementsMetadata.push({
            node: node,
            x: x,
            y: y,
            width: width,
            height: height
        });
    }

    /**
     * Abstract method to be implemented by specific renderers
     */
    render(node, ctx, state) {
        throw new Error('Render method must be implemented');
    }

    /**
     * Map alignment string to internal logic
     */
    getAlign(align) {
        return (align || 'left').toLowerCase();
    }

    /**
     * Get numeric attribute with default
     */
    getNumericAttr(node, attr, defaultValue) {
        const val = parseInt(node.getAttribute(attr));
        return isNaN(val) ? defaultValue : val;
    }
}
