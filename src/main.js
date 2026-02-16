import { Renderer } from './Renderer.js';
import { XmlHandler } from './XmlHandler.js';
import { HistoryManager } from './HistoryManager.js';
import { UIManager } from './UIManager.js';
import { debounce, formatXml } from './Utils.js';
import { PRINT_WIDTH_DEFAULT, DEFAULT_XML } from './Constants.js';

const RANGE_DEFS = {
    'text': {
        'width': { min: 1, max: 8 },
        'height': { min: 1, max: 8 },
        'linespc': { min: 0, max: 255 }
    },
    'barcode': {
        'width': { min: 2, max: 6 },
        'height': { min: 1, max: 255 }
    },
    'symbol': {
        'size': { min: 1, max: 16 }
    },
    'feed': {
        'line': { min: 1, max: 255 },
        'unit': { min: 0, max: 255 },
        'linespc': { min: 0, max: 255 }
    }
};

class EposApp {
    constructor() {
        this.xmlInput = document.getElementById('xml-input');
        this.printWidth = parseInt(localStorage.getItem('paper-size')) || PRINT_WIDTH_DEFAULT;
        
        this.renderer = new Renderer('preview', this.printWidth);
        this.xmlHandler = new XmlHandler(this.xmlInput);
        this.historyManager = new HistoryManager();
        this.uiManager = new UIManager(this);

        this.hoveredElement = null;
        this.editingElement = null;
        this.xmlDoc = null;

        // Viewport
        this.scale = parseFloat(localStorage.getItem('scale') || '1');
        this.panX = parseFloat(localStorage.getItem('panX') || '0');
        this.panY = parseFloat(localStorage.getItem('panY') || '0');

        // Outline visibility
        this.outlineVisible = localStorage.getItem('outline-visible') !== 'false';

        this.init();
    }

    init() {
        this.uiManager.initTheme();
        this.applyTransform();
        this.updateOutlineVisibility();

        // Paper size
        const paperSizeSelect = document.getElementById('paper-size-select');
        if (paperSizeSelect) {
            paperSizeSelect.value = this.printWidth;
            paperSizeSelect.addEventListener('change', (e) => this.setPaperSize(e.target.value));
        }

        // XML Input with Debounce
        const debouncedRender = debounce(() => {
            this.render();
            this.historyManager.push(this.xmlInput.value);
            this.updateShareUrl();
        }, 300);

        this.xmlInput.addEventListener('input', debouncedRender);

        // Initial Load
        if (!this.parseShareOnInit()) {
            this.xmlInput.value = DEFAULT_XML;
        }
        
        this.render().then(() => {
            this.historyManager.push(this.xmlInput.value);
            this.closeProperties();
        });

        this.setupEventListeners();
    }

    async render(skipParse = false) {
        if (!skipParse) {
            const oldEditingNode = this.editingElement;
            const oldHoveredNode = this.hoveredElement ? this.hoveredElement.node : null;

            const { doc, error } = this.xmlHandler.parse(this.xmlInput.value);
            if (error) {
                this.renderer.showError(error);
                return;
            }
            this.xmlDoc = doc;

            // Try to re-sync nodes after full parse
            if (oldEditingNode) {
                this.editingElement = this.findEquivalentNode(oldEditingNode, this.xmlDoc);
                if (!this.editingElement) this.closeProperties();
            }
            if (oldHoveredNode) {
                const newHoveredNode = this.findEquivalentNode(oldHoveredNode, this.xmlDoc);
                this.hoveredElement = newHoveredNode ? { node: newHoveredNode } : null;
            }
        }

        await this.renderer.refreshDisplay(this.xmlDoc, this.hoveredElement, this.editingElement);
        
        // Update metadata references to match new render
        if (this.hoveredElement) {
            this.hoveredElement = this.renderer.elementsMetadata.find(m => m.node === this.hoveredElement.node) || null;
        }

        // Update Outline
        this.uiManager.updateOutline(this.xmlDoc, this.editingElement, (node) => {
            const meta = this.renderer.elementsMetadata.find(m => m.node === node);
            if (meta) {
                this.showProperties(meta);
            }
        });
    }

    findEquivalentNode(oldNode, newDoc) {
        if (!oldNode || !newDoc || !newDoc.documentElement) return null;
        
        const path = [];
        let curr = oldNode;
        const root = oldNode.ownerDocument.documentElement;
        
        while (curr && curr !== root && curr.parentNode && curr.parentNode.nodeType === 1) {
            let index = 0;
            let prev = curr.previousSibling;
            while (prev) {
                if (prev.nodeType === 1) index++;
                prev = prev.previousSibling;
            }
            path.unshift(index);
            curr = curr.parentNode;
        }
        
        let target = newDoc.documentElement;
        for (const index of path) {
            let count = 0;
            let found = false;
            for (let child of target.childNodes) {
                if (child.nodeType === 1) {
                    if (count === index) {
                        target = child;
                        found = true;
                        break;
                    }
                    count++;
                }
            }
            if (!found) return null;
        }
        
        return target && target.localName === oldNode.localName ? target : null;
    }

    setupEventListeners() {
        // Toolbar Add buttons
        document.querySelectorAll('#toolbar [data-type]').forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.addElement(button.dataset.type);
            });
        });

        // Tabs
        this.initTabs();

        // Canvas interaction
        const canvas = this.renderer.canvas;
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('click', () => {
            if (this.hoveredElement) {
                this.showProperties(this.hoveredElement);
            } else {
                this.closeProperties();
            }
        });
        canvas.addEventListener('mouseleave', () => {
            this.hoveredElement = null;
            this.renderer.draw(this.hoveredElement, this.editingElement);
        });

        // Panning and Zooming
        this.setupZoomPan();

        // UI Buttons
        document.getElementById('properties-close').addEventListener('click', () => this.closeProperties());
        document.getElementById('outline-close').addEventListener('click', () => this.toggleOutline());
        document.getElementById('properties-move-up').addEventListener('click', () => this.moveElement('up'));
        document.getElementById('properties-move-down').addEventListener('click', () => this.moveElement('down'));
        document.getElementById('properties-delete').addEventListener('click', () => this.deleteElement());

        document.getElementById('theme-toggle').addEventListener('click', () => this.uiManager.toggleTheme());
        document.getElementById('btn-help').addEventListener('click', () => this.uiManager.showHelp());
        document.getElementById('help-close').addEventListener('click', () => this.uiManager.hideHelp());
        
        document.getElementById('btn-undo').addEventListener('click', () => this.undo());
        document.getElementById('btn-redo').addEventListener('click', () => this.redo());
        
        document.getElementById('btn-copy-xml').addEventListener('click', () => this.copyXml());
        document.getElementById('btn-clear-all').addEventListener('click', () => this.clearAll());
        document.getElementById('btn-save').addEventListener('click', () => this.saveToFile());
        
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.loadFromFile(e));
        
        document.getElementById('btn-print').addEventListener('click', () => this.printToPrinter());
        document.getElementById('btn-share').addEventListener('click', () => this.copyShareUrl());
        document.getElementById('btn-toggle-outline').addEventListener('click', () => this.toggleOutline());

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    addElement(type) {
        const { doc, newNode } = this.xmlHandler.addElement(this.xmlDoc, type, this.editingElement);
        this.xmlDoc = doc;
        this.updateXmlAndRender();
        
        // Select new node and auto-focus its first property
        setTimeout(() => {
            const meta = this.renderer.elementsMetadata.find(m => m.node === newNode);
            if (meta) this.showProperties(meta, true);
        }, 100);
    }

    async handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.editingElement) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const img = new Image();
            img.onload = () => {
                this.processUploadedImage(img);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    processUploadedImage(img) {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Default to a reasonable width if too large
        if (width > this.printWidth) {
            const ratio = this.printWidth / width;
            width = this.printWidth;
            height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const pixels = imgData.data;
        
        // Convert to monochrome bitmask (standard for ePOS)
        const bytesPerRow = Math.ceil(width / 8);
        const rasterData = new Uint8Array(bytesPerRow * height);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelIdx = (y * width + x) * 4;
                const r = pixels[pixelIdx];
                const g = pixels[pixelIdx + 1];
                const b = pixels[pixelIdx + 2];
                const a = pixels[pixelIdx + 3];
                
                // Simple threshold
                const brightness = (r + g + b) / 3;
                const isBlack = a > 128 && brightness < 128;
                
                if (isBlack) {
                    const byteIdx = y * bytesPerRow + Math.floor(x / 8);
                    const bitIdx = 7 - (x % 8);
                    rasterData[byteIdx] |= (1 << bitIdx);
                }
            }
        }

        // Convert raster data to base64
        let binary = '';
        for (let i = 0; i < rasterData.length; i++) {
            binary += String.fromCharCode(rasterData[i]);
        }
        const base64 = btoa(binary);

        this.editingElement.setAttribute('width', width.toString());
        this.editingElement.setAttribute('height', height.toString());
        this.editingElement.textContent = base64;
        
        this.updateXmlAndRender();
        
        // Refresh properties panel to show new width/height/content
        const meta = this.renderer.elementsMetadata.find(m => m.node === this.editingElement);
        if (meta) this.showProperties(meta);
    }

    updateXmlAndRender() {
        const formatted = formatXml(this.xmlHandler.serialize(this.xmlDoc));
        this.xmlInput.value = formatted;
        this.render(true);
        this.historyManager.push(this.xmlInput.value);
        this.updateShareUrl();
    }

    showProperties(meta, autoFocus = false) {
        this.editingElement = meta.node;
        this.uiManager.showProperties(meta, this.getAllowedAttributes.bind(this), this.createPropertyField.bind(this), autoFocus);
        this.renderer.draw(this.hoveredElement, this.editingElement);
        this.uiManager.updateOutlineActive(this.editingElement);

        // On mobile, close outline when selecting an element to give room for properties
        if (window.innerWidth <= 768 && this.outlineVisible) {
            this.toggleOutline();
        }
    }

    closeProperties() {
        this.editingElement = null;
        this.uiManager.closeProperties();
        this.renderer.draw(this.hoveredElement, this.editingElement);
    }

    toggleOutline() {
        this.outlineVisible = !this.outlineVisible;
        localStorage.setItem('outline-visible', this.outlineVisible);
        this.updateOutlineVisibility();
    }

    updateOutlineVisibility() {
        const panel = document.getElementById('outline-panel');
        const btn = document.getElementById('btn-toggle-outline');
        if (panel) {
            if (this.outlineVisible) {
                panel.classList.remove('hidden');
                btn.classList.add('active');
            } else {
                panel.classList.add('hidden');
                btn.classList.remove('active');
            }
        }
    }

    handleMouseMove(e) {
        const rect = this.renderer.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / this.scale;
        const y = (e.clientY - rect.top) / this.scale;

        let found = null;
        for (let i = this.renderer.elementsMetadata.length - 1; i >= 0; i--) {
            const meta = this.renderer.elementsMetadata[i];
            if (x >= meta.x && x <= meta.x + meta.width && y >= meta.y && y <= meta.y + meta.height) {
                found = meta;
                break;
            }
        }

        if (this.hoveredElement !== found) {
            this.hoveredElement = found;
            this.renderer.draw(this.hoveredElement, this.editingElement);
        }
    }

    setPaperSize(width) {
        this.printWidth = parseInt(width);
        localStorage.setItem('paper-size', width);
        this.renderer.setPrintWidth(this.printWidth);
        this.render();
    }

    // Logic for properties and manipulation moved here for brevity but still using modules
    moveElement(dir) {
        if (!this.editingElement) return;
        const parent = this.editingElement.parentNode;
        if (dir === 'up' && this.editingElement.previousSibling) {
            parent.insertBefore(this.editingElement, this.editingElement.previousSibling);
        } else if (dir === 'down' && this.editingElement.nextSibling) {
            parent.insertBefore(this.editingElement.nextSibling, this.editingElement);
        }
        this.updateXmlAndRender();
    }

    deleteElement() {
        if (!this.editingElement) return;
        this.editingElement.parentNode.removeChild(this.editingElement);
        this.closeProperties();
        this.updateXmlAndRender();
    }

    // ... (rest of the methods: copyXml, clearAll, saveToFile, loadFromFile, etc.)
    // I will implement them concisely.

    copyXml() {
        navigator.clipboard.writeText(this.xmlInput.value).then(() => {
            this.uiManager.showAlert('XML copied to clipboard!', 'Success');
        });
    }

    async clearAll() {
        const confirmed = await this.uiManager.showConfirm('Are you sure you want to clear the entire design? This cannot be undone.', 'Clear All');
        if (confirmed) {
            this.xmlInput.value = DEFAULT_XML;
            await this.render();
            this.historyManager.push(this.xmlInput.value);
            this.updateShareUrl();
            this.closeProperties();
        }
    }

    copyShareUrl() {
        navigator.clipboard.writeText(window.location.href).then(() => {
            this.uiManager.showAlert('Shareable URL copied to clipboard!', 'Link Copied');
        });
    }

    undo() {
        const state = this.historyManager.undo();
        if (state !== null) {
            this.xmlInput.value = state;
            this.render();
        }
    }

    redo() {
        const state = this.historyManager.redo();
        if (state !== null) {
            this.xmlInput.value = state;
            this.render();
        }
    }

    setupZoomPan() {
        let panning = false;
        let panStart = { x: 0, y: 0 };
        const container = document.getElementById('canvas-container');

        const btnIn = document.getElementById('zoom-in');
        const btnOut = document.getElementById('zoom-out');
        const btnReset = document.getElementById('zoom-reset');

        btnIn.onclick = () => this.setScale(this.scale * 1.2);
        btnOut.onclick = () => this.setScale(this.scale / 1.2);
        btnReset.onclick = () => { this.setScale(1); this.setPan(0, 0); };

        container.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
                panning = true;
                panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
                e.preventDefault();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (panning) this.setPan(e.clientX - panStart.x, e.clientY - panStart.y);
        });

        window.addEventListener('mouseup', () => panning = false);

        container.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                this.setScale(e.deltaY < 0 ? this.scale * 1.1 : this.scale / 1.1);
            }
        }, { passive: false });
    }

    setScale(s) {
        this.scale = Math.max(0.25, Math.min(4, s));
        localStorage.setItem('scale', this.scale);
        this.applyTransform();
    }

    setPan(x, y) {
        this.panX = x; this.panY = y;
        localStorage.setItem('panX', x); localStorage.setItem('panY', y);
        this.applyTransform();
    }

    applyTransform() {
        const el = this.renderer.canvas;
        el.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }

    handleKeyDown(e) {
        const active = document.activeElement;
        const isTextual = active && (
            active.tagName === 'TEXTAREA' || 
            (active.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'file', 'color'].includes(active.type))
        );

        if (this.uiManager.isModalOpen) return;

        if (e.code === 'Space') {
            if (!isTextual) {
                this._spaceDown = true;
                if (active.tagName !== 'BUTTON') e.preventDefault();
            }
        }

        const isCtrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();

        // Undo / Redo
        if (isCtrl && key === 'z') {
            e.preventDefault();
            this.undo();
            return;
        }
        if (isCtrl && key === 'y') {
            e.preventDefault();
            this.redo();
            return;
        }

        // Delete / Backspace
        if (key === 'delete' || key === 'backspace') {
            if (!isTextual) {
                e.preventDefault();
                this.deleteElement();
            }
        }

        // Zoom shortcuts
        if (key === '+' || key === '=') {
            if (!isTextual || isCtrl) {
                e.preventDefault();
                this.setScale(this.scale * 1.1);
            }
        } else if (key === '-' || key === '_') {
            if (!isTextual || isCtrl) {
                e.preventDefault();
                this.setScale(this.scale / 1.1);
            }
        } else if (isCtrl && (key === '0' || key === '1')) {
            e.preventDefault();
            this.setScale(1);
            this.setPan(0, 0);
        }
    }

    handleKeyUp(e) {
        if (e.code === 'Space') this._spaceDown = false;
    }

    // Property Field Creation (callback for UIManager)
    createPropertyField(container, name, value, type, isContent = false) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'popup-field';
        
        const label = document.createElement('label');
        label.textContent = (name === 'textContent') ? 'Content' : name;
        fieldDiv.appendChild(label);

        let input;
        const options = isContent ? null : this.getAttributeOptions(name, type);
        const isBoolean = options && options.length === 2 && options.includes('true') && options.includes('false');
        const rangeDef = !isContent && RANGE_DEFS[type] && RANGE_DEFS[type][name];

        if (isContent && (type === 'text' || type === 'image' || type === 'barcode' || type === 'symbol')) {
            input = document.createElement('textarea');
            input.rows = 3;
            input.value = value;
            fieldDiv.appendChild(input);
            input.addEventListener('input', () => {
                if (!this.editingElement) return;
                this.editingElement.textContent = input.value;
                this.updateXmlAndRender();
            });

            if (type === 'image') {
                const uploadBtn = document.createElement('button');
                uploadBtn.textContent = 'Upload Image...';
                uploadBtn.style.marginTop = '8px';
                uploadBtn.style.width = '100%';
                uploadBtn.type = 'button';
                fieldDiv.appendChild(uploadBtn);
                
                const imgInput = document.createElement('input');
                imgInput.type = 'file';
                imgInput.accept = 'image/*';
                imgInput.style.display = 'none';
                fieldDiv.appendChild(imgInput);
                
                uploadBtn.addEventListener('click', () => imgInput.click());
                imgInput.addEventListener('change', (e) => {
                    this.handleImageUpload(e);
                    e.target.value = ''; // Clear for next selection
                });
            }
        } else if (isBoolean) {
            fieldDiv.classList.add('toggle-field');
            const switchLabel = document.createElement('label');
            switchLabel.className = 'toggle-switch';
            
            input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value === 'true';
            
            const slider = document.createElement('span');
            slider.className = 'slider';
            
            switchLabel.appendChild(input);
            switchLabel.appendChild(slider);
            fieldDiv.appendChild(switchLabel);
            
            input.addEventListener('change', () => {
                if (!this.editingElement) return;
                this.editingElement.setAttribute(name, input.checked ? 'true' : 'false');
                this.updateXmlAndRender();
            });
        } else if (rangeDef) {
            const wrapper = document.createElement('div');
            wrapper.className = 'range-wrapper';
            
            input = document.createElement('input');
            input.type = 'range';
            input.min = rangeDef.min;
            input.max = rangeDef.max;
            input.value = (value === '' || value === null) ? rangeDef.min : parseInt(value);
            
            const valDisplay = document.createElement('span');
            valDisplay.className = 'range-value';
            valDisplay.textContent = input.value;
            
            wrapper.appendChild(input);
            wrapper.appendChild(valDisplay);
            fieldDiv.appendChild(wrapper);
            
            input.addEventListener('input', () => {
                valDisplay.textContent = input.value;
                if (!this.editingElement) return;
                this.editingElement.setAttribute(name, input.value);
                this.updateXmlAndRender();
            });
        } else if (options) {
            input = document.createElement('select');
            options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt;
                o.textContent = opt;
                if (opt === value) o.selected = true;
                input.appendChild(o);
            });
            fieldDiv.appendChild(input);
            input.addEventListener('change', () => {
                if (!this.editingElement) return;
                this.editingElement.setAttribute(name, input.value);
                this.updateXmlAndRender();
            });
        } else {
            input = document.createElement('input');
            input.value = value;
            // Basic numeric detection
            if (['width', 'height', 'size', 'x', 'y', 'x1', 'x2', 'line', 'unit', 'linespc'].includes(name)) {
                input.type = 'number';
            }
            fieldDiv.appendChild(input);
            input.addEventListener('input', () => {
                if (!this.editingElement) return;
                this.editingElement.setAttribute(name, input.value);
                this.updateXmlAndRender();
            });
        }

        container.appendChild(fieldDiv);
    }

    getAttributeOptions(name, type) {
        const options = {
            'align': ['left', 'center', 'right'],
            'color': ['color_1', 'color_2', 'color_3', 'color_4'],
            'font': ['font_a', 'font_b', 'font_c', 'font_d', 'font_e'],
            'style': ['line_thin', 'line_thick', 'line_double'],
            'type': type === 'barcode' ? 
                ['code128', 'code39', 'upc_a', 'upc_e', 'jan13', 'jan8', 'itf', 'codabar', 'code93', 'gs1_128'] : 
                (type === 'symbol' ? ['qrcode_model_1', 'qrcode_model_2', 'qrcode_micro', 'pdf417_standard', 'datamatrix_square'] : null),
            'hri': ['none', 'above', 'below', 'both'],
            'level': ['level_l', 'level_m', 'level_q', 'level_h'],
            'mode': ['mono', 'gray16'],
            'dw': ['true', 'false'],
            'dh': ['true', 'false'],
            'ul': ['true', 'false'],
            'em': ['true', 'false'],
            'reverse': ['true', 'false'],
            'smooth': ['true', 'false']
        };
        return options[name] || null;
    }

    getAllowedAttributes(type) {
        const common = ['align', 'color'];
        switch (type) {
            case 'text': return [...common, 'font', 'width', 'height', 'dw', 'dh', 'ul', 'em', 'reverse', 'smooth', 'x', 'y', 'linespc', 'lang'];
            case 'hline': return ['x1', 'x2', 'style', 'color'];
            case 'barcode': return [...common, 'type', 'hri', 'font', 'width', 'height'];
            case 'symbol': return [...common, 'type', 'level', 'width', 'height', 'size', 'x', 'y'];
            case 'image': return [...common, 'width', 'height', 'mode'];
            case 'logo': return ['key1', 'key2', 'align'];
            case 'feed': return ['unit', 'line', 'linespc', 'pos'];
            case 'cut': return ['type'];
            default: return [];
        }
    }

    initTabs() {
        const tabLinks = document.querySelectorAll('.tab-link');
        const tabPanes = document.querySelectorAll('.tab-pane');
        tabLinks.forEach(link => {
            link.addEventListener('click', () => {
                tabLinks.forEach(l => {
                    l.classList.remove('active');
                    l.setAttribute('aria-selected', 'false');
                });
                link.classList.add('active');
                link.setAttribute('aria-selected', 'true');
                tabPanes.forEach(p => p.classList.toggle('active', p.id === link.dataset.tab));
            });
        });
    }

    updateShareUrl() {
        try {
            const params = new URLSearchParams();
            params.set('ps', String(this.printWidth));
            params.set('xml', btoa(unescape(encodeURIComponent(this.xmlInput.value))));
            history.replaceState(null, '', `${location.pathname}#${params.toString()}`);
        } catch (e) {}
    }

    parseShareOnInit() {
        if (!location.hash) return false;
        try {
            const params = new URLSearchParams(location.hash.substring(1));
            const xml = decodeURIComponent(escape(atob(params.get('xml'))));
            if (xml) this.xmlInput.value = xml;
            return true;
        } catch (e) { return false; }
    }

    // More methods like saveToFile, loadFromFile, printToPrinter would go here.
    // I'll add them briefly to ensure parity with original.

    saveToFile() {
        const blob = new Blob([this.xmlInput.value], { type: 'text/xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'receipt.xml';
        a.click();
    }

    loadFromFile(e) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            this.xmlInput.value = ev.target.result;
            this.render();
        };
        reader.readAsText(e.target.files[0]);
    }

    async printToPrinter() {
        const lastIp = localStorage.getItem('printer-ip') || '';
        const ip = await this.uiManager.showPrompt('Enter the IP address of your Epson ePOS-Print compatible printer:', lastIp, 'Print to Network Printer');
        
        if (!ip) return;
        
        localStorage.setItem('printer-ip', ip);
        
        try {
            const response = await fetch(`http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer`, {
                method: 'POST',
                headers: { 'Content-Type': 'text/xml' },
                body: this.xmlInput.value
            });
            
            if (response.ok) {
                this.uiManager.showAlert('Receipt successfully sent to the printer!', 'Print Success');
            } else {
                this.uiManager.showAlert(`Printer returned an error (Status: ${response.status}). Please check the IP and printer status.`, 'Print Error');
            }
        } catch (e) {
            this.uiManager.showAlert(`Failed to connect to the printer: ${e.message}. Ensure the printer is on the same network and CORS is allowed.`, 'Connection Error');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new EposApp();
});
