import { COLORS } from './Constants.js';

/**
 * Debounce function to limit the rate at which a function is executed
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Maps ePOS color strings to CSS/Canvas colors
 */
export function mapColor(color) {
    const low = (color || 'color_1').toLowerCase();
    return COLORS[low] || COLORS.color_1;
}

/**
 * Check if a character should be rendered as full-width
 */
export function isFullWidth(char, lang) {
    if (!lang || lang === 'en') return false;
    const cjkLangs = ['ja', 'zh-cn', 'zh-tw', 'ko', 'multi'];
    if (!cjkLangs.includes(lang)) return false;

    const code = char.charCodeAt(0);
    return (
        (code >= 0x1100 && code <= 0x11FF) || // Hangul Jamo
        (code >= 0x2E80 && code <= 0x9FFF) || // CJK Radicals to Unified Ideographs
        (code >= 0xAC00 && code <= 0xD7AF) || // Hangul Syllables
        (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility
        (code >= 0xFE30 && code <= 0xFE4F) || // CJK Compatibility Forms
        (code >= 0xFF01 && code <= 0xFF60) || // Fullwidth Forms
        (code >= 0xFFE0 && code <= 0xFFE6)    // Fullwidth Symbol Variants
    );
}

/**
 * Format XML with basic indentation
 */
export function formatXml(xml) {
    let formatted = '';
    const reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach(node => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
            indent = 0;
        } else if (node.match(/^<\/\w/)) {
            if (pad !== 0) {
                pad -= 1;
            }
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
            indent = 1;
        } else {
            indent = 0;
        }

        let padding = '';
        for (let i = 0; i < pad; i++) {
            padding += '    ';
        }

        formatted += padding + node + '\r\n';
        pad += indent;
    });

    // Remove extra blank lines
    return formatted.replace(/(\r?\n){3,}/g, '\r\n\r\n').trim();
}
