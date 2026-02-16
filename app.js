class EposSimulator {
    constructor(canvasId, inputId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.xmlInput = document.getElementById(inputId);

        // Constants (203 dpi, 72mm width = 576 dots)
        this.PRINT_WIDTH = 576;
        this.LINE_HEIGHT = 24; // Standard Font A height
        this.CHAR_WIDTH = 12;  // Standard Font A width

        this.elementsMetadata = [];
        this.hoveredElement = null;
        this.editingElement = null;
        this.offscreenCanvas = null;
        this.contentHeight = 0;

        this.DEFAULT_XML = `<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
</epos-print>`;

        // Viewport and rendering flags
        this.scale = parseFloat(localStorage.getItem('scale') || '1');
        this.panX = parseFloat(localStorage.getItem('panX') || '0');
        this.panY = parseFloat(localStorage.getItem('panY') || '0');

        // History
        this.history = [];
        this.historyIndex = -1;
        this._applyingHistory = false;

        this.init();
    }

    /**
     * Initialize the simulator
     */
    init() {
        if (!this.canvas || !this.xmlInput) {
            console.error('Required elements not found');
            return;
        }

        const paperSizeSelect = document.getElementById('paper-size-select');
        const savedPaperSize = localStorage.getItem('paper-size');
        if (savedPaperSize) {
            this.PRINT_WIDTH = parseInt(savedPaperSize);
            if (paperSizeSelect) paperSizeSelect.value = savedPaperSize;
        }

        if (paperSizeSelect) {
            paperSizeSelect.addEventListener('change', (e) => this.setPaperSize(e.target.value));
        }

        this.canvas.width = this.PRINT_WIDTH;
        if (!this.parseShareOnInit()) {
            this.xmlInput.value = this.DEFAULT_XML;
        }
        
        this.xmlInput.addEventListener('input', () => { this.pushHistory(); this.updateShareUrl(); this.render(); });
        
        // Toolbar element events
        document.querySelectorAll('#toolbar [data-type]').forEach(button => {
            button.addEventListener('click', (e) => { e.preventDefault(); this.addElement(button.dataset.type); });
        });

        this.initToolbarTabs();

        // Canvas interaction
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.canvas.addEventListener('mouseleave', () => {
            this.hoveredElement = null;
            this.draw();
        });

        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.addEventListener('click', (e) => {
                if (e.target === canvasContainer) {
                    this.closeProperties();
                }
            });
        }

        // Properties panel events
        document.getElementById('properties-close').addEventListener('click', (e) => { e.preventDefault(); this.closeProperties(); });
        document.getElementById('properties-move-up').addEventListener('click', (e) => { e.preventDefault(); this.moveElement('up'); });
        document.getElementById('properties-move-down').addEventListener('click', (e) => { e.preventDefault(); this.moveElement('down'); });
        document.getElementById('properties-delete').addEventListener('click', (e) => { e.preventDefault(); this.deleteElement(); });

        // Global Utility events
        document.getElementById('btn-copy-xml').addEventListener('click', () => this.copyXmlToClipboard());
        document.getElementById('btn-clear-all').addEventListener('click', () => this.clearAll());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('btn-help').addEventListener('click', () => this.showHelp());
        document.getElementById('help-close').addEventListener('click', () => this.hideHelp());
        document.getElementById('popup-overlay').addEventListener('click', () => this.hideHelp());
        
        // Save/Load/Print events
        document.getElementById('btn-save').addEventListener('click', () => this.saveXmlToFile());
        const fileInput = document.getElementById('file-input');
        document.getElementById('btn-load').addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.loadXmlFromFile(e));
        document.getElementById('btn-print').addEventListener('click', () => this.printToPrinter());

        // Toolbar utility controls
        const btnZoomIn = document.getElementById('zoom-in');
        const btnZoomOut = document.getElementById('zoom-out');
        const btnZoomReset = document.getElementById('zoom-reset');
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const btnShare = document.getElementById('btn-share');

        if (btnZoomIn) btnZoomIn.addEventListener('click', () => this.setScale(this.scale * 1.2));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => this.setScale(this.scale / 1.2));
        if (btnZoomReset) btnZoomReset.addEventListener('click', () => { this.setScale(1); this.setPan(0,0); });
        if (btnUndo) btnUndo.addEventListener('click', () => this.undo());
        if (btnRedo) btnRedo.addEventListener('click', () => this.redo());
        if (btnShare) btnShare.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); btnShare.textContent = '✅'; setTimeout(()=> btnShare.textContent = '🔗', 1000); } catch(_){} });

        // Mouse wheel zoom and pan
        this.canvas.addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.altKey) {
                e.preventDefault();
                const delta = e.deltaY < 0 ? 1.1 : 0.9;
                this.setScale(this.scale * delta);
            }
        }, { passive: false });

        // Pan
        let panning = false;
        let panStart = { x: 0, y: 0 };
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && (this._spaceDown || false))) {
                panning = true;
                panStart.x = e.clientX - this.panX;
                panStart.y = e.clientY - this.panY;
                e.preventDefault();
            }
        });
        window.addEventListener('mousemove', (e) => {
            if (panning) {
                this.setPan(e.clientX - panStart.x, e.clientY - panStart.y);
            }
        });
        window.addEventListener('mouseup', (e) => {
            panning = false;
        });

        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => {
            const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
            if ((e.key === 'Delete' || e.key === 'Backspace') && !inField) {
                if (this.editingElement) this.deleteElement();
            }
            if ((e.ctrlKey || e.metaKey) && !inField) {
                if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
                if ((e.key.toLowerCase() === 'y') || (e.key.toLowerCase() === 'z' && e.shiftKey)) { e.preventDefault(); this.redo(); }
            }
            if (e.code === 'Space') { this._spaceDown = true; }
        });
        window.addEventListener('keyup', (e) => { if (e.code === 'Space') this._spaceDown = false; });

        // Initial render
        this.initTheme();
        this.applyTransformCSS();
        this.render();
        this.closeProperties();
        this.pushHistory();
        this.updateUndoRedoButtons();
    }

    setPaperSize(width) {
        this.PRINT_WIDTH = parseInt(width);
        localStorage.setItem('paper-size', width);
        this.canvas.width = this.PRINT_WIDTH;
        if (this.offscreenCanvas) {
            this.offscreenCanvas.width = this.PRINT_WIDTH;
        }
        this.render();
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.body.classList.add('dark-mode');
        }
    }

    toggleTheme() {
        const isDark = document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }

    showHelp() {
        const modal = document.getElementById('help-modal');
        const overlay = document.getElementById('popup-overlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    hideHelp() {
        const modal = document.getElementById('help-modal');
        const overlay = document.getElementById('popup-overlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    /**
     * Initialize the tabbed toolbar logic
     */
    initToolbarTabs() {
        const tabLinks = document.querySelectorAll('.tab-link');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTabId = link.dataset.tab;

                // Update active state of links
                tabLinks.forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Update visibility of panes
                tabPanes.forEach(pane => {
                    if (pane.id === targetTabId) {
                        pane.classList.add('active');
                    } else {
                        pane.classList.remove('active');
                    }
                });
            });
        });
    }

    /**
     * Record element's position and size for interaction
     */
    recordElementMetadata(node, x, y, width, height) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        this.elementsMetadata.push({
            node: node,
            x: x,
            y: y,
            width: width,
            height: height
        });
    }

    /**
     * Handle mouse movement over the canvas
     */
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / (this.scale || 1);
        const y = (e.clientY - rect.top) / (this.scale || 1);

        // Find the topmost element at this position (last in array is usually rendered later)
        let found = null;
        for (let i = this.elementsMetadata.length - 1; i >= 0; i--) {
            const meta = this.elementsMetadata[i];
            if (x >= meta.x && x <= meta.x + meta.width &&
                y >= meta.y && y <= meta.y + meta.height) {
                found = meta;
                break;
            }
        }

        if (this.hoveredElement !== found) {
            this.hoveredElement = found;
            this.draw(); // Redraw with the hover border using cached canvas
        }
    }

    /**
     * Handle canvas click
     */
    handleCanvasClick(e) {
        if (this.hoveredElement) {
            this.showProperties(this.hoveredElement);
        } else {
            this.closeProperties();
        }
    }

    /**
     * Draw highlight border around an element segment
     */
    drawHighlight(meta) {
        if (!meta) return;
        
        const { x, y, width, height } = meta;
        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 3]);
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.setLineDash([]);
    }

    /**
     * Add a new element to the XML
     */
    addElement(type) {
        if (!this.xmlDoc || !this.xmlDoc.documentElement) {
            this.xmlInput.value = this.DEFAULT_XML;
            const parser = new DOMParser();
            this.xmlDoc = parser.parseFromString(this.xmlInput.value, 'text/xml');
        }

        const root = this.xmlDoc.documentElement;
        let newNode;

        switch (type) {
            case 'text':
                newNode = this.xmlDoc.createElement('text');
                newNode.textContent = 'New Text';
                break;
            case 'newline':
                newNode = this.xmlDoc.createElement('text');
                newNode.textContent = '\n';
                break;
            case 'hline':
                newNode = this.xmlDoc.createElement('hline');
                newNode.setAttribute('style', 'line_thin');
                break;
            case 'barcode':
                newNode = this.xmlDoc.createElement('barcode');
                newNode.setAttribute('type', 'code128');
                newNode.setAttribute('align', 'center');
                newNode.textContent = '12345678';
                break;
            case 'symbol':
                newNode = this.xmlDoc.createElement('symbol');
                newNode.setAttribute('type', 'qrcode_model_2');
                newNode.setAttribute('align', 'center');
                newNode.textContent = 'https://example.com';
                break;
            case 'image':
                newNode = this.xmlDoc.createElement('image');
                newNode.setAttribute('width', '64');
                newNode.setAttribute('height', '64');
                newNode.setAttribute('align', 'center');
                newNode.textContent = 'ffffffffffffffff'; // Tiny white square placeholder
                break;
            case 'logo':
                newNode = this.xmlDoc.createElement('logo');
                newNode.setAttribute('key1', '1');
                newNode.setAttribute('key2', '1');
                break;
            case 'feed':
                newNode = this.xmlDoc.createElement('feed');
                newNode.setAttribute('line', '1');
                break;
            case 'cut':
                newNode = this.xmlDoc.createElement('cut');
                newNode.setAttribute('type', 'feed');
                break;
        }

        if (newNode) {
            // UX Improvement: Insert after selected element if one exists
            if (this.editingElement && this.editingElement.parentNode === root) {
                root.insertBefore(newNode, this.editingElement.nextSibling);
            } else {
                root.appendChild(newNode);
            }
            
            this.updateXmlInput();
            this.refreshDisplay();

            // Select the new node immediately
            // We need to find its metadata after refresh
            setTimeout(() => {
                const meta = this.elementsMetadata.find(m => m.node === newNode);
                if (meta) {
                    this.showProperties(meta);
                    // Scroll into view if needed
                    const container = document.getElementById('canvas-container');
                    const elementTop = meta.y;
                    if (elementTop < container.scrollTop || elementTop > container.scrollTop + container.clientHeight) {
                        container.scrollTo({ top: Math.max(0, elementTop - 100), behavior: 'smooth' });
                    }
                }
            }, 50);
        }
    }

    /**
     * Serialize xmlDoc back to the textarea
     */
    updateXmlInput() {
        // Remove whitespace-only text nodes from the document root to avoid blank lines after deletions
        if (this.xmlDoc && this.xmlDoc.documentElement) {
            const root = this.xmlDoc.documentElement;
            for (let i = root.childNodes.length - 1; i >= 0; i--) {
                const n = root.childNodes[i];
                if (n.nodeType === Node.TEXT_NODE && n.textContent.trim() === '') {
                    root.removeChild(n);
                }
            }
        }

        const serializer = new XMLSerializer();
        let xmlString = serializer.serializeToString(this.xmlDoc);
        
        // Simple regex-based pretty print for readability
        let formatted = '';
        let reg = /(>)(<)(\/*)/g;
        xmlString = xmlString.replace(reg, '$1\r\n$2$3');
        let pad = 0;
        xmlString.split('\r\n').forEach(function(node) {
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

        // Collapse excessive blank lines that can appear after formatting
        formatted = formatted.replace(/(\r?\n){3,}/g, '\r\n\r\n');
        
        this.xmlInput.value = formatted.trim();
        this.pushHistory();
        this.updateShareUrl();
    }

    /**
     * Show the properties panel for an element
     */
    showProperties(meta) {
        this.editingElement = meta.node;
        const type = meta.node.localName;
        
        const title = document.getElementById('properties-title');
        const content = document.getElementById('properties-content');
        const footer = document.getElementById('properties-footer');
        const panel = document.getElementById('properties-panel');
        
        if (title) title.textContent = `Edit <${type}>`;
        if (content) content.innerHTML = '';
        if (footer) footer.style.display = 'block';
        if (panel) panel.classList.add('show');

        // Add content field if applicable (Move to top)
        if (['text', 'barcode', 'symbol', 'image'].includes(type)) {
            const val = meta.node.textContent;
            this.createPropertyField(content, 'textContent', val, type, true);
        }

        // Add fields based on attributes
        const attributes = this.getAllowedAttributes(type);
        attributes.forEach(attr => {
            const val = meta.node.getAttribute(attr) || '';
            this.createPropertyField(content, attr, val, type);
        });

        // Redraw to show selection highlight
        this.draw();
    }

    /**
     * Save the current XML to a file
     */
    saveXmlToFile() {
        const xml = this.xmlInput.value;
        const blob = new Blob([xml], { type: 'text/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'receipt.xml';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Load XML from a file
     */
    loadXmlFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.xmlInput.value = event.target.result;
            this.render();
            this.closeProperties();
            // Reset the input value to allow loading the same file again
            e.target.value = '';
        };
        reader.readAsText(file);
    }

    /**
     * Send the current XML to a network printer
     */
    printToPrinter() {
        const lastIp = localStorage.getItem('printer-ip') || '';
        const ip = prompt('Enter the printer IP address:', lastIp);
        
        if (!ip) return;
        
        localStorage.setItem('printer-ip', ip);
        
        const xml = this.xmlInput.value;
        const url = `http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`;
        
        const btn = document.getElementById('btn-print');
        const originalText = btn.textContent;
        btn.textContent = 'Printing...';
        btn.disabled = true;

        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'If-Modified-Since': 'Thu, 01 Jan 1970 00:00:00 GMT',
                'SOAPAction': '""'
            },
            body: xml
        })
        .then(response => {
            if (response.ok) {
                alert('Print job sent successfully!');
            } else {
                alert('Failed to send print job: ' + response.statusText);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error sending print job. Check console for details. \n\nNote: Browsers often block cross-origin (CORS) requests to local network devices. If this fails, you may need to use a browser extension to disable CORS or run the browser with security disabled for testing.');
        })
        .finally(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        });
    }

    /**
     * Copy the current XML to the clipboard
     */
    copyXmlToClipboard() {
        this.xmlInput.select();
        const xml = this.xmlInput.value;
        navigator.clipboard.writeText(xml).then(() => {
            const btn = document.getElementById('btn-copy-xml');
            const originalText = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.backgroundColor = '#c6f6d5';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.backgroundColor = '#ebf8ff';
            }, 2000);
        });
    }

    /**
     * Clear all elements from the document
     */
    clearAll() {
        if (confirm('Are you sure you want to clear all elements? This cannot be undone.')) {
            this.xmlInput.value = this.DEFAULT_XML;
            this.render();
            this.closeProperties();
        }
    }

    /**
     * Get user-friendly label for property names
     */
    getPropertyLabel(name) {
        const labels = {
            'textContent': 'Content / Data',
            'align': 'Alignment',
            'color': 'Color',
            'font': 'Font Type',
            'width': 'Width Scale',
            'height': 'Height Scale',
            'dw': 'Double Width',
            'dh': 'Double Height',
            'ul': 'Underline',
            'em': 'Bold (Emphasized)',
            'reverse': 'Reverse Video',
            'smooth': 'Smooth Fonts',
            'linespc': 'Line Spacing',
            'lang': 'Language',
            'style': 'Line Style',
            'hri': 'HRI Position',
            'level': 'Error Correction',
            'size': 'Symbol Size',
            'mode': 'Image Mode',
            'key1': 'Logo Key 1',
            'key2': 'Logo Key 2',
            'unit': 'Feed Units',
            'line': 'Feed Lines',
            'pos': 'Feed Position',
            'type': 'Type / Mode',
            'x': 'X Position',
            'y': 'Y Position',
            'x1': 'Start X',
            'x2': 'End X'
        };
        return labels[name] || name;
    }

    /**
     * Create a field in the properties panel
     */
    createPropertyField(container, name, value, type, isContent = false) {
        const fieldDiv = document.createElement('div');
        fieldDiv.className = 'popup-field';
        
        const label = document.createElement('label');
        label.textContent = this.getPropertyLabel(name);
        fieldDiv.appendChild(label);

        let input;
        const options = isContent ? null : this.getAttributeOptions(name, type);
        const numericInfo = isContent ? null : this.getAttributeNumericInfo(name, type);

        if (name === 'textContent' && (type === 'text' || type === 'image')) {
            input = document.createElement('textarea');
            input.rows = 4;

            if (type === 'image') {
                const uploadContainer = document.createElement('div');
                uploadContainer.style.marginTop = '8px';
                
                const uploadLabel = document.createElement('label');
                uploadLabel.textContent = 'Upload Image: ';
                uploadLabel.style.fontSize = '0.75rem';
                uploadLabel.style.display = 'block';
                uploadLabel.style.marginBottom = '4px';
                
                const uploadInput = document.createElement('input');
                uploadInput.type = 'file';
                uploadInput.accept = 'image/*';
                uploadInput.style.fontSize = '0.75rem';
                uploadInput.addEventListener('change', (e) => this.handleImageUpload(e));
                
                uploadContainer.appendChild(uploadLabel);
                uploadContainer.appendChild(uploadInput);
                fieldDiv.appendChild(uploadContainer);
            }
            fieldDiv.appendChild(input);
        } else if (options) {
            // Check if this is a boolean property (has only true/false options)
            const isBoolean = options.length === 2 && options.includes('true') && options.includes('false');

            if (isBoolean) {
                fieldDiv.classList.add('toggle-field');
                const toggleLabel = document.createElement('label');
                toggleLabel.className = 'toggle-switch';

                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = value === 'true';

                const slider = document.createElement('span');
                slider.className = 'slider';

                toggleLabel.appendChild(input);
                toggleLabel.appendChild(slider);
                fieldDiv.appendChild(toggleLabel);
            } else {
                input = document.createElement('select');
                // Add empty option if current value is empty and it's an attribute
                if (value === '' && !isContent) {
                    const emptyOpt = document.createElement('option');
                    emptyOpt.value = '';
                    emptyOpt.textContent = '-- default --';
                    input.appendChild(emptyOpt);
                }
                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    if (opt === value) option.selected = true;
                    input.appendChild(option);
                });
                fieldDiv.appendChild(input);
            }
        } else if (numericInfo) {
            if (numericInfo.type === 'range') {
                fieldDiv.classList.add('range-field');
                input = document.createElement('input');
                input.type = 'range';
                input.min = numericInfo.min;
                input.max = numericInfo.max;
                input.step = numericInfo.step;
                
                const valueDisplay = document.createElement('span');
                valueDisplay.className = 'range-value';
                valueDisplay.textContent = value || (numericInfo.default !== undefined ? numericInfo.default : numericInfo.min);
                
                const rangeWrapper = document.createElement('div');
                rangeWrapper.className = 'range-wrapper';
                rangeWrapper.appendChild(input);
                rangeWrapper.appendChild(valueDisplay);
                fieldDiv.appendChild(rangeWrapper);
                
                input.addEventListener('input', () => {
                    valueDisplay.textContent = input.value;
                });
            } else {
                input = document.createElement('input');
                input.type = 'number';
                input.min = numericInfo.min;
                input.max = numericInfo.max;
                input.step = numericInfo.step;
                if (numericInfo.default !== undefined) {
                    input.placeholder = `Default: ${numericInfo.default}`;
                }
                fieldDiv.appendChild(input);
            }
        } else {
            input = document.createElement('input');
            input.type = 'text';
            fieldDiv.appendChild(input);
        }
        
        if (input.type !== 'checkbox') {
            if (value === '' && numericInfo && numericInfo.type === 'range') {
                input.value = numericInfo.default !== undefined ? numericInfo.default : numericInfo.min;
            } else {
                input.value = value;
            }
        }
        
        input.dataset.name = name;
        input.dataset.isContent = isContent;

        // Add live update listener
        input.addEventListener('input', () => this.applyPropertyUpdate(input));
        if (input.tagName === 'SELECT' || input.type === 'checkbox') {
            input.addEventListener('change', () => this.applyPropertyUpdate(input));
        }

        container.appendChild(fieldDiv);
    }

    /**
     * Apply property change to the element immediately
     */
    applyPropertyUpdate(field) {
        if (!this.editingElement) return;

        const name = field.dataset.name;
        const value = field.type === 'checkbox' ? (field.checked ? 'true' : 'false') : field.value;
        const isContent = field.dataset.isContent === 'true';

        if (isContent) {
            this.editingElement.textContent = value;
        } else {
            if (value.trim() === '') {
                this.editingElement.removeAttribute(name);
            } else {
                this.editingElement.setAttribute(name, value);
            }
        }

        this.updateXmlInput();
        this.refreshDisplay();
    }

    /**
     * Handle image file upload and conversion to raster data
     */
    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.editingElement) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const mode = this.editingElement.getAttribute('mode') || 'mono';
                
                // Max width is 576 dots
                let targetWidth = img.width;
                let targetHeight = img.height;
                if (targetWidth > this.PRINT_WIDTH) {
                    const ratio = this.PRINT_WIDTH / targetWidth;
                    targetWidth = this.PRINT_WIDTH;
                    targetHeight = Math.round(targetHeight * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                const data = imageData.data;

                let rasterData;
                if (mode === 'gray16') {
                    const bytesPerRow = Math.ceil(targetWidth / 2);
                    rasterData = new Uint8Array(bytesPerRow * targetHeight);
                    for (let y = 0; y < targetHeight; y++) {
                        for (let x = 0; x < targetWidth; x++) {
                            const pixelIdx = (y * targetWidth + x) * 4;
                            const r = data[pixelIdx];
                            const g = data[pixelIdx + 1];
                            const b = data[pixelIdx + 2];
                            const a = data[pixelIdx + 3];
                            
                            const gray = (r + g + b) / 3;
                            // In gray16, 0 is white, 15 is black (max intensity)
                            const intensity = a < 128 ? 0 : Math.round((255 - gray) / 17);
                            
                            const byteIdx = y * bytesPerRow + Math.floor(x / 2);
                            if (x % 2 === 0) {
                                rasterData[byteIdx] |= (intensity << 4);
                            } else {
                                rasterData[byteIdx] |= (intensity & 0x0F);
                            }
                        }
                    }
                } else {
                    const bytesPerRow = Math.ceil(targetWidth / 8);
                    rasterData = new Uint8Array(bytesPerRow * targetHeight);
                    for (let y = 0; y < targetHeight; y++) {
                        for (let x = 0; x < targetWidth; x++) {
                            const pixelIdx = (y * targetWidth + x) * 4;
                            const r = data[pixelIdx];
                            const g = data[pixelIdx + 1];
                            const b = data[pixelIdx + 2];
                            const a = data[pixelIdx + 3];
                            
                            const gray = (r + g + b) / 3;
                            // Threshold for mono
                            const isBlack = a > 128 && gray < 128;
                            
                            if (isBlack) {
                                const byteIdx = y * bytesPerRow + Math.floor(x / 8);
                                const bitIdx = 7 - (x % 8);
                                rasterData[byteIdx] |= (1 << bitIdx);
                            }
                        }
                    }
                }

                // Convert Uint8Array to Base64
                let binary = '';
                const len = rasterData.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(rasterData[i]);
                }
                const base64Data = btoa(binary);
                
                // Update element
                this.editingElement.setAttribute('width', targetWidth.toString());
                this.editingElement.setAttribute('height', targetHeight.toString());
                this.editingElement.textContent = base64Data;

                this.updateXmlInput();
                this.refreshDisplay();
                
                // Re-populate properties panel to show new values
                const meta = this.elementsMetadata.find(m => m.node === this.editingElement);
                if (meta) {
                    this.showProperties(meta);
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
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

    getAttributeOptions(name, elementType) {
        const options = {
            'font': ['font_a', 'font_b', 'font_c', 'font_d', 'font_e', 'special_a', 'special_b'],
            'align': ['left', 'center', 'right'],
            'color': ['color_1', 'color_2', 'color_3', 'color_4', 'none'],
            'dw': ['true', 'false'],
            'dh': ['true', 'false'],
            'ul': ['true', 'false'],
            'em': ['true', 'false'],
            'reverse': ['true', 'false'],
            'smooth': ['true', 'false'],
            'style': ['line_thin', 'line_medium', 'line_thick', 'line_thin_double', 'line_medium_double', 'line_thick_double'],
            'hri': ['none', 'above', 'below', 'both'],
            'mode': ['mono', 'gray16'],
            'pos': ['peeling', 'cutting', 'current_tof', 'next_tof'],
            'lang': ['en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'th', 'vi', 'multi']
        };

        if (name === 'type') {
            if (elementType === 'barcode') {
                return ['upc_a', 'upc_e', 'jan13', 'jan8', 'code39', 'itf', 'codabar', 'code93', 'code128', 'gs1_128', 'gs1_databar_omnidirectional', 'gs1_databar_truncated', 'gs1_databar_limited', 'gs1_databar_expanded'];
            }
            if (elementType === 'symbol') {
                return ['pdf417', 'qrcode_model_1', 'qrcode_model_2', 'maxicode_model_2', 'maxicode_model_3', 'maxicode_model_4', 'maxicode_model_5', 'maxicode_model_6', 'datamatrix', 'gs1_databar_stacked', 'gs1_databar_stacked_omnidirectional', 'gs1_databar_expanded_stacked', 'aztec', 'data_mono_back'];
            }
            if (elementType === 'cut') {
                return ['no_feed', 'feed', 'reserve'];
            }
        }

        if (name === 'level' && elementType === 'symbol') {
            return ['level_l', 'level_m', 'level_q', 'level_h', 'level_0', 'level_1', 'level_2', 'level_3', 'level_4', 'level_5', 'level_6', 'level_7', 'level_8'];
        }

        return options[name] || null;
    }

    getAttributeNumericInfo(name, elementType) {
        const numericAttributes = ['width', 'height', 'x', 'y', 'x1', 'x2', 'unit', 'line', 'linespc', 'size', 'key1', 'key2'];
        if (!numericAttributes.includes(name)) return null;

        // Default constraints
        let info = { min: 0, max: 1000, step: 1, type: 'number' };

        if (name === 'width' || name === 'height') {
            if (elementType === 'text') {
                info = { min: 1, max: 8, step: 1, type: 'range', default: 1 };
            } else if (elementType === 'barcode') {
                if (name === 'width') info = { min: 2, max: 6, step: 1, type: 'range', default: 3 };
                else info = { min: 1, max: 255, step: 1, type: 'number', default: 162 };
            } else if (elementType === 'symbol') {
                info = { min: 0, max: 1000, step: 1, type: 'number' };
            } else if (elementType === 'image') {
                info = { min: 1, max: 1000, step: 1, type: 'number' };
            }
        } else if (name === 'size' && elementType === 'symbol') {
            info = { min: 1, max: 16, step: 1, type: 'range', default: 3 };
        } else if (['x', 'y', 'x1', 'x2'].includes(name)) {
            info = { min: 0, max: this.PRINT_WIDTH, step: 1, type: 'number' };
        } else if (['unit', 'line', 'linespc', 'key1', 'key2'].includes(name)) {
            info = { min: 0, max: 255, step: 1, type: 'number' };
        }

        return info;
    }

    closeProperties() {
        const title = document.getElementById('properties-title');
        const content = document.getElementById('properties-content');
        const footer = document.getElementById('properties-footer');
        const panel = document.getElementById('properties-panel');
        
        if (title) title.textContent = 'Properties';
        if (content) content.innerHTML = '<p style="color: #666; font-style: italic;">Select an element in the preview to edit its properties.</p>';
        if (footer) footer.style.display = 'none';
        if (panel) panel.classList.remove('show');

        this.editingElement = null;
        this.draw();
    }

    deleteElement() {
        if (!this.editingElement) return;
        if (confirm('Are you sure you want to delete this element?')) {
            this.editingElement.remove();
            this.updateXmlInput();
            this.refreshDisplay();
            this.closeProperties();
        }
    }

    /**
     * Move the editing element up or down in the XML tree
     */
    moveElement(direction) {
        if (!this.editingElement) return;
        const node = this.editingElement;
        const parent = node.parentNode;
        if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return;

        if (direction === 'up') {
            const prev = node.previousElementSibling;
            if (prev) {
                parent.insertBefore(node, prev);
            } else {
                return; // Already at top
            }
        } else {
            const next = node.nextElementSibling;
            if (next) {
                // To move down, we insert the node AFTER the next element
                // parent.insertBefore(node, next.nextElementSibling) will append to parent if next.nextElementSibling is null
                parent.insertBefore(node, next.nextElementSibling);
            } else {
                return; // Already at bottom
            }
        }

        this.updateXmlInput();
        this.refreshDisplay();

        // Maintain selection by finding the node in the rebuilt metadata
        const meta = this.elementsMetadata.find(m => m.node === node);
        if (meta) {
            this.showProperties(meta);
            
            // Scroll into view if it moved off-screen
            const container = document.getElementById('canvas-container');
            if (container) {
                const elementTop = meta.y;
                if (elementTop < container.scrollTop || elementTop > container.scrollTop + container.clientHeight) {
                    container.scrollTo({ top: Math.max(0, elementTop - 100), behavior: 'smooth' });
                }
            }
        }
    }

    /**
     * Clear a canvas context with a specific color
     */
    clearCanvas(ctx, width, height, color = 'white') {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * Main render function - parses XML and triggers full redraw
     */
    render() {
        const xmlString = this.xmlInput.value;
        
        if (!xmlString.trim()) {
            this.clearCanvas(this.ctx, this.canvas.width, this.canvas.height);
            this.elementsMetadata = [];
            this.xmlDoc = null;
            return;
        }

        const parser = new DOMParser();
        const newXmlDoc = parser.parseFromString(xmlString, 'text/xml');
        
        const parserError = newXmlDoc.getElementsByTagName('parsererror');
        if (parserError.length > 0) {
            this.showError('XML Parse Error');
            this.elementsMetadata = [];
            return;
        }

        this.xmlDoc = newXmlDoc;
        this.refreshDisplay();
    }

    /**
     * Re-renders the XML nodes to the offscreen canvas and updates metadata
     */
    refreshDisplay() {
        const previousNode = this.hoveredElement ? this.hoveredElement.node : null;
        this.elementsMetadata = [];

        // Use an offscreen canvas to handle dynamic height
        if (!this.offscreenCanvas) {
            this.offscreenCanvas = document.createElement('canvas');
        }
        this.offscreenCanvas.width = this.PRINT_WIDTH;
        
        this.offscreenCanvas.height = 8000; // Reset height to buffer
        const octx = this.offscreenCanvas.getContext('2d');

        this.clearCanvas(octx, this.offscreenCanvas.width, this.offscreenCanvas.height);
        
        octx.fillStyle = 'black';
        octx.font = `${this.LINE_HEIGHT}px monospace`; 
        octx.textBaseline = 'top';

        const state = {
            currentX: 0,
            currentY: 0,
            maxLineHeight: this.LINE_HEIGHT,
            activeVlines: [],
            pendingCutType: null
        };

        if (this.xmlDoc && this.xmlDoc.documentElement) {
            this.processNode(this.xmlDoc.documentElement, octx, state);
        }

        // Draw any vertical lines that weren't explicitly ended
        if (state.activeVlines && state.activeVlines.length > 0) {
            state.activeVlines.forEach(vline => {
                const endY = state.currentX > 0 ? state.currentY + state.maxLineHeight : state.currentY;
                this.drawVerticalLine(octx, vline.x, vline.startY, endY, vline.style, vline.color);
            });
        }

        // Perform reserved cut if any
        if (state.pendingCutType) {
            this.renderCut(state.pendingCutType, octx, state, state.pendingCutNode);
            state.pendingCutType = null;
            state.pendingCutNode = null;
        }

        // Restore hovered element reference from new metadata if it still exists
        if (previousNode) {
            this.hoveredElement = this.elementsMetadata.find(m => m.node === previousNode) || null;
        }

        this.contentHeight = Math.max(state.currentY + state.maxLineHeight, 100);
        this.draw();
    }

    /**
     * Draws the cached offscreen canvas to the main canvas and add overlays
     */
    draw() {
        if (!this.offscreenCanvas) return;

        this.canvas.height = this.contentHeight;
        this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.PRINT_WIDTH, this.contentHeight, 0, 0, this.PRINT_WIDTH, this.contentHeight);

        // Draw highlights for editing element (all segments)
        if (this.editingElement) {
            this.elementsMetadata.forEach(meta => {
                if (meta.node === this.editingElement) {
                    this.drawHighlight(meta);
                }
            });
        }

        // Draw highlight for hovered element (single segment)
        // If it's already highlighted as part of editingElement, we can skip
        if (this.hoveredElement && this.hoveredElement.node !== this.editingElement) {
            this.drawHighlight(this.hoveredElement);
        }
    }

    /**
     * Check if a character should be rendered as full-width (double cell)
     */
    isFullWidth(char, lang) {
        if (!lang || lang === 'en') return false;
        const cjkLangs = ['ja', 'zh-cn', 'zh-tw', 'ko', 'multi'];
        if (!cjkLangs.includes(lang)) return false;

        const code = char.charCodeAt(0);
        // CJK Unified Ideographs, Hangul, Hiragana, Katakana, and Fullwidth forms
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
     * Recursively process XML nodes
     */
    processNode(node, ctx, state) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        if (node.localName === 'text') {
            const font = node.getAttribute('font') || 'font_a';
            const lang = node.getAttribute('lang') || 'en';
            const smooth = node.getAttribute('smooth') === 'true';
            const reverse = node.getAttribute('reverse') === 'true';
            const ul = node.getAttribute('ul') === 'true';
            const em = node.getAttribute('em') === 'true';
            const color = node.getAttribute('color') || 'color_1';
            const align = node.getAttribute('align') || 'left';
            const x = node.getAttribute('x');
            const y = node.getAttribute('y');
            const linespc = node.getAttribute('linespc');

            const dw = node.getAttribute('dw') === 'true';
            const dh = node.getAttribute('dh') === 'true';
            const widthAttr = node.getAttribute('width');
            const heightAttr = node.getAttribute('height');

            let width = widthAttr ? parseInt(widthAttr) : (dw ? 2 : 1);
            let height = heightAttr ? parseInt(heightAttr) : (dh ? 2 : 1);

            // Ensure valid ranges (1-8) and handle NaN
            width = Math.max(1, Math.min(8, isNaN(width) ? 1 : width));
            height = Math.max(1, Math.min(8, isNaN(height) ? 1 : height));

            this.renderText(node.textContent, font, smooth, width, height, reverse, ul, em, color, align, x, y, linespc, lang, ctx, state, node);
        } else if (node.localName === 'image') {
            const width = parseInt(node.getAttribute('width'));
            const height = parseInt(node.getAttribute('height'));
            const color = node.getAttribute('color') || 'color_1';
            const align = node.getAttribute('align') || 'left';
            const mode = node.getAttribute('mode') || 'mono';
            const data = node.textContent;

            if (!isNaN(width) && !isNaN(height) && data) {
                this.renderImage(data, width, height, color, align, mode, ctx, state, node);
            }
        } else if (node.localName === 'logo') {
            const key1 = parseInt(node.getAttribute('key1'));
            const key2 = parseInt(node.getAttribute('key2'));
            const align = node.getAttribute('align') || 'left';

            if (!isNaN(key1) && !isNaN(key2)) {
                this.renderLogo(key1, key2, align, ctx, state, node);
            }
        } else if (node.localName === 'hline') {
            const x1 = node.getAttribute('x1');
            const x2 = node.getAttribute('x2');
            const style = node.getAttribute('style');
            const color = node.getAttribute('color');
            this.renderHline(x1, x2, style, color, ctx, state, node);
        } else if (node.localName === 'barcode') {
            const type = node.getAttribute('type') || 'code128';
            const hri = node.getAttribute('hri') || 'none';
            const font = node.getAttribute('font') || 'font_a';
            const widthAttr = node.getAttribute('width');
            const heightAttr = node.getAttribute('height');
            const align = node.getAttribute('align') || 'left';
            const data = node.textContent.trim();

            const width = widthAttr ? parseInt(widthAttr) : 3;
            const height = heightAttr ? parseInt(heightAttr) : 162;

            if (data) {
                this.renderBarcode(data, type, hri, font, width, height, align, ctx, state, node);
            }
        } else if (node.localName === 'symbol') {
            const type = node.getAttribute('type') || 'qrcode_model_2';
            const level = node.getAttribute('level') || 'level_m';
            const widthAttr = node.getAttribute('width');
            const heightAttr = node.getAttribute('height');
            const sizeAttr = node.getAttribute('size');
            const align = node.getAttribute('align') || 'left';
            const x = node.getAttribute('x');
            const y = node.getAttribute('y');
            const data = node.textContent.trim();

            const width = widthAttr ? parseInt(widthAttr) : NaN;
            const height = heightAttr ? parseInt(heightAttr) : NaN;
            const size = sizeAttr ? parseInt(sizeAttr) : NaN;

            if (data) {
                this.renderSymbol(data, type, level, width, height, size, align, x, y, ctx, state, node);
            }
        } else if (node.localName === 'feed') {
            const unit = node.getAttribute('unit');
            const line = node.getAttribute('line');
            const linespc = node.getAttribute('linespc');
            const pos = node.getAttribute('pos');

            const startY = state.currentY;
            let feedAmount = 0;
            let feedLabel = 'feed';

            if (unit !== null) {
                const u = parseInt(unit);
                if (!isNaN(u)) {
                    feedAmount = u;
                    feedLabel = `feed: unit="${u}"`;
                }
            } else if (line !== null) {
                const l = parseInt(line);
                if (!isNaN(l)) {
                    const lspc = (linespc !== null) ? parseInt(linespc) : state.maxLineHeight;
                    feedAmount = l * lspc;
                    feedLabel = `feed: line="${l}"${linespc ? ' linespc="' + linespc + '"' : ''}`;
                }
            } else if (pos !== null) {
                switch (pos) {
                    case 'peeling':
                        feedAmount = 30;
                        break;
                    case 'cutting':
                        feedAmount = 50;
                        break;
                    case 'current_tof':
                        feedAmount = 0;
                        break;
                    case 'next_tof':
                        feedAmount = 120;
                        break;
                }
                feedLabel = `feed: pos="${pos}"`;
            }

            if (feedAmount > 0) {
                this.recordElementMetadata(node, 0, startY, this.PRINT_WIDTH, feedAmount);
                ctx.save();
                // Visual indicator for feed space
                ctx.fillStyle = '#e0e0e0';
                ctx.fillRect(0, startY, this.PRINT_WIDTH, feedAmount);

                // Boundaries
                ctx.strokeStyle = '#cccccc';
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(0, startY);
                ctx.lineTo(this.PRINT_WIDTH, startY);
                ctx.moveTo(0, startY + feedAmount);
                ctx.lineTo(this.PRINT_WIDTH, startY + feedAmount);
                ctx.stroke();

                // Label
                if (feedAmount >= 12) {
                    ctx.fillStyle = '#777777';
                    ctx.font = '10px monospace';
                    ctx.setLineDash([]);
                    ctx.fillText(`[${feedLabel}]`, 5, startY + 1);
                }
                ctx.restore();

                state.currentY += feedAmount;
            }

            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT; // Reset to default after a feed
        } else if (node.localName === 'cut') {
            const typeAttr = node.getAttribute('type');
            const type = (typeAttr ? typeAttr : 'feed').toLowerCase();
            if (type === 'reserve') {
                state.pendingCutType = 'feed';
                state.pendingCutNode = node;
            } else if (type === 'no_feed') {
                this.renderCut('no_feed', ctx, state, node);
            } else {
                this.renderCut('feed', ctx, state, node);
            }
        } else if (node.localName === 'vline-begin') {
            const x = node.getAttribute('x');
            const style = node.getAttribute('style');
            const color = node.getAttribute('color');
            state.activeVlines.push({
                x: x !== null ? parseInt(x) : 0,
                style: style || 'line_thin',
                color: color || 'color_1',
                startY: state.currentY
            });
        } else if (node.localName === 'vline-end') {
            const x = node.getAttribute('x');
            const posX = x !== null ? parseInt(x) : 0;
            // Find the most recently started line at this X position
            let index = -1;
            for (let i = state.activeVlines.length - 1; i >= 0; i--) {
                if (state.activeVlines[i].x === posX) {
                    index = i;
                    break;
                }
            }
            if (index !== -1) {
                const vline = state.activeVlines.splice(index, 1)[0];
                const endY = state.currentX > 0 ? state.currentY + state.maxLineHeight : state.currentY;
                this.drawVerticalLine(ctx, vline.x, vline.startY, endY, vline.style, vline.color);
            }
        } else {
            for (let child of node.childNodes) {
                this.processNode(child, ctx, state);
            }
        }
    }

    /**
     * Render text content with support for line breaks and wrapping
     */
    renderText(text, font, smooth, width, height, reverse, ul, em, color, align, x, y, linespc, lang, ctx, state, node) {
        const lines = text.replace(/\\n/g, '\n').split('\n');
        
        const startY = state.currentY;
        const startX = state.currentX;

        let baseCharWidth = this.CHAR_WIDTH;
        let baseLineHeight = this.LINE_HEIGHT;

        switch (font) {
            case 'font_b':
                baseCharWidth = 10;
                baseLineHeight = 24;
                break;
            case 'font_c':
                baseCharWidth = 8;
                baseLineHeight = 16;
                break;
            case 'font_d':
                baseCharWidth = 9;
                baseLineHeight = 17;
                break;
            case 'font_e':
                baseCharWidth = 7;
                baseLineHeight = 15;
                break;
            case 'font_a':
            default:
                baseCharWidth = 12;
                baseLineHeight = 24;
                break;
        }

        const charWidth = baseCharWidth * width;
        const lineHeight = baseLineHeight * height;
        const appliedLinespc = linespc ? parseInt(linespc) : null;

        // Apply absolute positioning if provided
        if (x !== null) {
            const posX = parseInt(x);
            if (!isNaN(posX)) state.currentX = posX;
        }
        if (y !== null) {
            const posY = parseInt(y);
            if (!isNaN(posY)) {
                state.currentY = posY;
                state.maxLineHeight = lineHeight;
            }
        }

        const fontStyle = em ? 'bold ' : '';
        ctx.font = `${fontStyle}${lineHeight}px "Courier New", Courier, monospace`;
        
        ctx.imageSmoothingEnabled = smooth;

        const textColor = this.mapColor(color);

        state.maxLineHeight = Math.max(state.maxLineHeight, lineHeight);

        lines.forEach((line, index) => {
            // Apply alignment if no absolute X is provided
            if (x === null && align !== 'left') {
                let totalWidth = 0;
                for (let char of line) {
                    totalWidth += this.isFullWidth(char, lang) ? charWidth * 2 : charWidth;
                }
                
                if (align === 'center' || align === 'centre') {
                    state.currentX = Math.max(0, Math.floor((this.PRINT_WIDTH - totalWidth) / 2));
                } else if (align === 'right') {
                    state.currentX = Math.max(0, this.PRINT_WIDTH - totalWidth);
                }
            }
            
            let lineStartX = state.currentX;
            let lineStartY = state.currentY;
            let lineMaxX = state.currentX;

            if (line.length > 0) {
                for (let char of line) {
                    const isWide = this.isFullWidth(char, lang);
                    const actualCharWidth = isWide ? charWidth * 2 : charWidth;

                    // Basic wrapping
                    if (state.currentX + actualCharWidth > this.PRINT_WIDTH) {
                        this.recordElementMetadata(node, lineStartX, lineStartY, lineMaxX - lineStartX, state.maxLineHeight);

                        const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                        state.currentY += advanceY;
                        state.currentX = 0;
                        state.maxLineHeight = lineHeight;
                        
                        lineStartX = 0;
                        lineStartY = state.currentY;
                        lineMaxX = 0;
                    }
                    
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
                            ctx.lineWidth = Math.max(1, height); // Scale underline with height
                            ctx.beginPath();
                            ctx.moveTo(state.currentX, state.currentY + lineHeight - 1);
                            ctx.lineTo(state.currentX + actualCharWidth, state.currentY + lineHeight - 1);
                            ctx.stroke();
                        }
                    }

                    state.currentX += actualCharWidth;
                    lineMaxX = Math.max(lineMaxX, state.currentX);
                }
            }
            
            // Handle explicit newlines from split
            if (index < lines.length - 1) {
                // Draw a visual block for the newline character
                ctx.save();
                ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
                ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
                ctx.lineWidth = 1;
                const blockWidth = charWidth;
                
                // Draw block at current position (end of line)
                ctx.fillRect(state.currentX, state.currentY, blockWidth, lineHeight);
                ctx.strokeRect(state.currentX, state.currentY, blockWidth, lineHeight);
                
                // Draw return symbol
                ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
                ctx.font = `${lineHeight * 0.7}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('↵', state.currentX + blockWidth / 2, state.currentY + lineHeight / 2);
                ctx.restore();

                lineMaxX = Math.max(lineMaxX, state.currentX + blockWidth);
                this.recordElementMetadata(node, lineStartX, lineStartY, lineMaxX - lineStartX, state.maxLineHeight);

                const advanceY = (appliedLinespc !== null && !isNaN(appliedLinespc)) ? appliedLinespc : state.maxLineHeight;
                state.currentY += advanceY;
                state.currentX = 0;
                state.maxLineHeight = lineHeight;
            } else {
                // Last line
                if (line.length > 0) {
                    this.recordElementMetadata(node, lineStartX, lineStartY, lineMaxX - lineStartX, state.maxLineHeight);
                }
            }
        });
    }

    /**
     * Render a placeholder for a logo stored in the printer
     */
    renderLogo(key1, key2, align, ctx, state, node) {
        const logoWidth = 128; // Default placeholder width
        const logoHeight = 64;  // Default placeholder height

        const startY_original = state.currentY;

        // Alignment and positioning
        let startX = state.currentX;
        const lowAlign = align ? align.toLowerCase() : 'left';
        
        if (lowAlign === 'center' || lowAlign === 'centre') {
            startX = Math.max(0, Math.floor((this.PRINT_WIDTH - logoWidth) / 2));
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
        } else if (lowAlign === 'right') {
            startX = Math.max(0, this.PRINT_WIDTH - logoWidth);
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
        }

        // Draw placeholder box
        ctx.save();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(startX, state.currentY, logoWidth, logoHeight);

        // Draw "LOGO" text
        ctx.fillStyle = 'black';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('LOGO', startX + logoWidth / 2, state.currentY + logoHeight / 2 - 10);
        
        ctx.font = '10px monospace';
        ctx.fillText(`key1=${key1}, key2=${key2}`, startX + logoWidth / 2, state.currentY + logoHeight / 2 + 10);
        ctx.restore();

        this.recordElementMetadata(node, startX, state.currentY, logoWidth, logoHeight);

        // Update state
        if (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right') {
            state.currentY += logoHeight;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        } else {
            state.currentX = startX + logoWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, logoHeight);
        }
    }

    /**
     * Render horizontal line
     */
    renderHline(x1, x2, style, color, ctx, state, node) {
        const startX = (x1 !== null && x1 !== undefined) ? parseInt(x1) : 0;
        const endX = (x2 !== null && x2 !== undefined) ? parseInt(x2) : (this.PRINT_WIDTH - 1);
        
        const startY_original = state.currentY;
        
        const lineColor = this.mapColor(color);
        if (lineColor === 'none') return;

        let thickness = 1;
        let isDouble = false;
        
        const lowStyle = style ? style.toLowerCase() : 'line_thin';
        
        switch (lowStyle) {
            case 'line_medium':
                thickness = 2;
                break;
            case 'line_thick':
                thickness = 3;
                break;
            case 'line_thin_double':
                thickness = 1;
                isDouble = true;
                break;
            case 'line_medium_double':
                thickness = 2;
                isDouble = true;
                break;
            case 'line_thick_double':
                thickness = 3;
                isDouble = true;
                break;
            case 'line_thin':
            default:
                thickness = 1;
                break;
        }
        
        ctx.fillStyle = lineColor;
        
        // Ensure we are at the start of a new line if we were mid-text
        if (state.currentX !== 0) {
            state.currentY += state.maxLineHeight;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        }

        const drawLine = (y) => {
            ctx.fillRect(startX, y, Math.max(0, endX - startX + 1), thickness);
        };
        
        if (isDouble) {
            drawLine(state.currentY);
            drawLine(state.currentY + thickness + 1); // 1 dot gap
            state.currentY += (thickness * 2) + 1;
        } else {
            drawLine(state.currentY);
            state.currentY += thickness;
        }
        
        // Add a small 1-dot margin after the line
        state.currentY += 1;
        
        this.recordElementMetadata(node, startX, startY_original, Math.max(0, endX - startX + 1), state.currentY - startY_original);

        state.currentX = 0;
        state.maxLineHeight = this.LINE_HEIGHT;
    }

    /**
     * Draw vertical line
     */
    drawVerticalLine(ctx, x, startY, endY, style, color) {
        const lineColor = this.mapColor(color);
        if (lineColor === 'none') return;

        let thickness = 1;
        let isDouble = false;
        
        const lowStyle = style ? style.toLowerCase() : 'line_thin';
        
        switch (lowStyle) {
            case 'line_medium':
                thickness = 2;
                break;
            case 'line_thick':
                thickness = 3;
                break;
            case 'line_thin_double':
                thickness = 1;
                isDouble = true;
                break;
            case 'line_medium_double':
                thickness = 2;
                isDouble = true;
                break;
            case 'line_thick_double':
                thickness = 3;
                isDouble = true;
                break;
            case 'line_thin':
            default:
                thickness = 1;
                break;
        }
        
        ctx.fillStyle = lineColor;
        
        const drawLine = (xPos) => {
            ctx.fillRect(xPos, startY, thickness, Math.max(0, endY - startY));
        };
        
        if (isDouble) {
            drawLine(x);
            drawLine(x + thickness + 1); // 1 dot gap
        } else {
            drawLine(x);
        }
    }
    
    /**
     * Render a cut mark (simulated)
     */
    renderCut(type, ctx, state, node) {
        const startY_original = state.currentY;

        // If mid-line, move to next line
        if (state.currentX !== 0) {
            state.currentY += state.maxLineHeight;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        }

        const lowType = (type || 'feed').toLowerCase();

        const drawCutMarker = (y, labelType) => {
            ctx.save();
            ctx.strokeStyle = '#000000';
            ctx.setLineDash([10, 5]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.PRINT_WIDTH, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#777777';
            ctx.font = '10px monospace';
            ctx.fillText(`[cut: type="${labelType}"]`, 5, y + 1);
            ctx.restore();
        };

        if (lowType === 'no_feed') {
            drawCutMarker(state.currentY, 'no_feed');
            // small gap after the line
            state.currentY += 2;
        } else {
            // Default to feed to cutting position then cut
            const feedAmount = 50;
            const startY = state.currentY;

            ctx.save();
            // Visual indicator for feed space
            ctx.fillStyle = '#e0e0e0';
            ctx.fillRect(0, startY, this.PRINT_WIDTH, feedAmount);

            // Boundaries
            ctx.strokeStyle = '#cccccc';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(0, startY);
            ctx.lineTo(this.PRINT_WIDTH, startY);
            ctx.moveTo(0, startY + feedAmount);
            ctx.lineTo(this.PRINT_WIDTH, startY + feedAmount);
            ctx.stroke();

            // Label
            if (feedAmount >= 12) {
                ctx.fillStyle = '#777777';
                ctx.font = '10px monospace';
                ctx.setLineDash([]);
                ctx.fillText(`[feed: pos="cutting"]`, 5, startY + 1);
            }
            ctx.restore();

            state.currentY += feedAmount;

            drawCutMarker(state.currentY, 'feed');

            // small margin after cut
            state.currentY += 2;
        }

        this.recordElementMetadata(node, 0, startY_original, this.PRINT_WIDTH, state.currentY - startY_original);

        state.currentX = 0;
        state.maxLineHeight = this.LINE_HEIGHT;
    }
    
    /**
     * Render a barcode (simulated)
     */
    renderBarcode(data, type, hri, font, width, height, align, ctx, state, node) {
        const startY_original = state.currentY;
        const moduleWidth = Math.max(2, Math.min(6, isNaN(width) ? 3 : width));
        const barcodeHeight = Math.max(1, Math.min(255, isNaN(height) ? 162 : height));
        
        // Font settings for HRI
        let hriFontHeight = 24;
        switch (font) {
            case 'font_b': hriFontHeight = 18; break;
            case 'font_c': hriFontHeight = 14; break;
            case 'font_d': hriFontHeight = 12; break;
            case 'font_e': hriFontHeight = 10; break;
            default: hriFontHeight = 24; break;
        }

        // Calculate estimated modules based on type
        let modulesCount = 0;
        const lowType = type.toLowerCase();
        if (lowType.includes('upc_a') || lowType.includes('jan13')) {
            modulesCount = 95;
        } else if (lowType.includes('upc_e') || lowType.includes('jan8')) {
            modulesCount = 67;
        } else if (lowType.includes('code39')) {
            modulesCount = (data.length + 2) * 16;
        } else {
            // General formula for other types
            modulesCount = (data.length + 2) * 11;
        }
        
        const totalBarcodeWidth = modulesCount * moduleWidth;

        // Alignment and line breaking
        let startX = state.currentX;
        const lowAlign = align ? align.toLowerCase() : 'left';
        
        if (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right') {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
            if (lowAlign === 'right') {
                startX = Math.max(0, this.PRINT_WIDTH - totalBarcodeWidth);
            } else {
                startX = Math.max(0, Math.floor((this.PRINT_WIDTH - totalBarcodeWidth) / 2));
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

        // Draw Barcode
        ctx.save();
        ctx.fillStyle = 'black';
        
        // Use a simple hash of the data + type to make the barcode look "real" and consistent
        const combined = data + type;
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
            hash = ((hash << 5) - hash) + combined.charCodeAt(i);
            hash |= 0;
        }
        
        const getBar = (i) => {
            const val = Math.abs(Math.sin(hash + i * 1.5));
            return val > 0.4; // Slightly more black than white
        };

        for (let i = 0; i < modulesCount; i++) {
            if (getBar(i)) {
                ctx.fillRect(startX + i * moduleWidth, currentY, moduleWidth, barcodeHeight);
            }
        }
        ctx.restore();
        
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

        this.recordElementMetadata(node, startX, startY_original, totalBarcodeWidth, totalElementHeight);

        // Update state
        if (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right') {
            state.currentY += totalElementHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        } else {
            state.currentX = startX + totalBarcodeWidth;
            state.maxLineHeight = Math.max(state.maxLineHeight, totalElementHeight);
        }
    }

    /**
     * Render a 2D symbol (QR, PDF417, DataMatrix) — simulated
     */
    renderSymbol(data, type, level, width, height, size, align, x, y, ctx, state, node) {
        const startY_original = state.currentY;
        const lowType = (type || 'qrcode_model_2').toLowerCase();
        const lvl = (level || 'level_m').toLowerCase();

        // Determine module size (pixel size of one module)
        const moduleW = Math.max(1, Math.min(16, isNaN(width) ? (isNaN(size) ? 4 : size) : width));
        const moduleH = Math.max(1, Math.min(16, isNaN(height) ? moduleW : height));

        // Compute matrix dimensions based on type and data length (approximation)
        let cols = 21; // default for QR ver1
        let rows = 21;

        if (lowType.includes('pdf417')) {
            cols = Math.max(10, Math.min(34, 17)); // fixed-ish columns for look
            rows = Math.max(3, Math.min(90, Math.ceil((data.length + 10) / 8)));
        } else if (lowType.includes('datamatrix')) {
            const sizes = [10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48];
            const idx = Math.min(sizes.length - 1, Math.max(0, Math.floor(data.length / 6)));
            cols = rows = sizes[idx];
        } else { // QR Code (qrcode_model_2 etc.)
            const version = Math.max(1, Math.min(10, Math.ceil((data.length + 8) / 10)));
            cols = rows = 21 + 4 * version;
        }

        // Apply absolute positioning if provided
        if (x !== null && x !== undefined) {
            const posX = parseInt(x);
            if (!isNaN(posX)) state.currentX = posX;
        }
        if (y !== null && y !== undefined) {
            const posY = parseInt(y);
            if (!isNaN(posY)) {
                state.currentY = posY;
                state.maxLineHeight = rows * moduleH;
            }
        }

        const totalWidth = cols * moduleW;
        const totalHeight = rows * moduleH;

        // Alignment logic similar to barcode/image when no absolute X provided
        let startX = state.currentX;
        const lowAlign = align ? align.toLowerCase() : 'left';
        if ((x === null || x === undefined) && (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right')) {
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
            if (lowAlign === 'right') {
                startX = Math.max(0, this.PRINT_WIDTH - totalWidth);
            } else {
                startX = Math.max(0, Math.floor((this.PRINT_WIDTH - totalWidth) / 2));
            }
        }

        // Pseudo-random but stable fill pattern based on data and type
        let hash = 0;
        const seed = `${data}|${type}|${level}`;
        for (let i = 0; i < seed.length; i++) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(i);
            hash |= 0;
        }
        const rand = (i, j) => {
            // mix i, j and hash
            let v = hash ^ (i * 374761393) ^ (j * 668265263);
            v = (v ^ (v >>> 13)) * 1274126177;
            v ^= v >>> 16;
            return (v & 0xffff) / 0xffff;
        };

        ctx.save();
        ctx.fillStyle = 'black';

        if (lowType.includes('pdf417')) {
            // Draw quiet zone
            const qz = 2;
            const offX = startX + qz * moduleW;
            const offY = state.currentY + qz * moduleH;

            // Simple start/stop bars top/bottom for visual
            ctx.fillRect(offX, offY, totalWidth - 2 * qz * moduleW, moduleH);
            ctx.fillRect(offX, offY + (rows - 1) * moduleH, totalWidth - 2 * qz * moduleW, moduleH);

            // Body
            for (let r = 1; r < rows - 1; r++) {
                for (let c = 0; c < cols; c++) {
                    if (rand(r, c) > 0.5) {
                        ctx.fillRect(offX + c * moduleW, offY + r * moduleH, moduleW, moduleH);
                    }
                }
            }
        } else if (lowType.includes('datamatrix')) {
            // Quiet zone
            const qz = 1;
            const offX = startX + qz * moduleW;
            const offY = state.currentY + qz * moduleH;

            // L-shaped solid finder + alternating borders
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const atBorder = (r === 0 || c === 0 || r === rows - 1 || c === cols - 1);
                    let on = false;
                    if (c === 0 || r === rows - 1) {
                        on = true; // solid borders
                    } else if (r === 0 || c === cols - 1) {
                        on = ((r + c) % 2 === 0); // alternating borders
                    } else {
                        on = rand(r, c) > 0.55;
                    }
                    if (on) {
                        ctx.fillRect(offX + c * moduleW, offY + r * moduleH, moduleW, moduleH);
                    }
                }
            }
        } else {
            // QR Code like rendering
            const qz = 4; // quiet zone modules
            const offX = startX + qz * moduleW;
            const offY = state.currentY + qz * moduleH;

            // Finder pattern size is 7x7 modules
            const fp = 7;
            const drawFinder = (fx, fy) => {
                ctx.fillRect(offX + fx * moduleW, offY + fy * moduleH, fp * moduleW, fp * moduleH);
                ctx.clearRect(offX + (fx + 1) * moduleW, offY + (fy + 1) * moduleH, (fp - 2) * moduleW, (fp - 2) * moduleH);
                ctx.fillRect(offX + (fx + 2) * moduleW, offY + (fy + 2) * moduleH, (fp - 4) * moduleW, (fp - 4) * moduleH);
            };

            drawFinder(0, 0);
            drawFinder(cols - fp, 0);
            drawFinder(0, rows - fp);

            // Timing patterns along row 6 and column 6 if in bounds
            if (rows > 8 && cols > 8) {
                for (let i = 0; i < cols; i++) {
                    if (i % 2 === 0) ctx.fillRect(offX + i * moduleW, offY + 6 * moduleH, moduleW, moduleH);
                }
                for (let j = 0; j < rows; j++) {
                    if (j % 2 === 0) ctx.fillRect(offX + 6 * moduleW, offY + j * moduleH, moduleW, moduleH);
                }
            }

            // Data area (skip regions overlapping finders and timing lines)
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const inTL = (c < fp && r < fp);
                    const inTR = (c >= cols - fp && r < fp);
                    const inBL = (c < fp && r >= rows - fp);
                    const onTiming = (r === 6 || c === 6);
                    if (inTL || inTR || inBL || onTiming) continue;
                    // Heuristic density influenced by level
                    const thresh = (lvl.includes('h') ? 0.65 : lvl.includes('q') ? 0.6 : lvl.includes('m') ? 0.55 : 0.5);
                    if (rand(r, c) > (1 - thresh)) {
                        ctx.fillRect(offX + c * moduleW, offY + r * moduleH, moduleW, moduleH);
                    }
                }
            }
        }
        ctx.restore();

        const extraQuiet = (lowType.includes('pdf417') ? 4 : lowType.includes('datamatrix') ? 2 : 8);
        const finalHeight = totalHeight + extraQuiet * moduleH;

        this.recordElementMetadata(node, startX, startY_original, totalWidth + extraQuiet * moduleW, finalHeight);

        // Update state
        if ((x === null || x === undefined) && (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right')) {
            state.currentY += finalHeight + 10;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        } else {
            state.currentX = startX + totalWidth + extraQuiet * moduleW;
            state.maxLineHeight = Math.max(state.maxLineHeight, finalHeight);
        }
    }

    /**
     * Render image content from raster data
     */
    renderImage(data, width, height, color, align, mode, ctx, state, node) {
        const startY_original = state.currentY;
        const imageColor = this.mapColor(color);
        if (imageColor === 'none') return;

        // Alignment and positioning
        let startX = state.currentX;
        const lowAlign = align ? align.toLowerCase() : 'left';
        
        if (lowAlign === 'center' || lowAlign === 'centre') {
            startX = Math.max(0, Math.floor((this.PRINT_WIDTH - width) / 2));
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
        } else if (lowAlign === 'right') {
            startX = Math.max(0, this.PRINT_WIDTH - width);
            if (state.currentX !== 0) {
                state.currentY += state.maxLineHeight;
                state.currentX = 0;
                state.maxLineHeight = this.LINE_HEIGHT;
            }
        }

        const bytes = this.decodeRasterData(data);
        if (bytes.length === 0) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tctx = tempCanvas.getContext('2d');
        const imageData = tctx.createImageData(width, height);

        const rgb = this.colorToRgb(imageColor);

        if (mode === 'gray16') {
            const bytesPerRow = Math.ceil(width / 2);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const byteIdx = y * bytesPerRow + Math.floor(x / 2);
                    if (byteIdx >= bytes.length) break;
                    const byte = bytes[byteIdx];
                    const nibble = (x % 2 === 0) ? (byte >> 4) : (byte & 0x0F);
                    const intensity = nibble / 15;
                    const pixelIdx = (y * width + x) * 4;
                    imageData.data[pixelIdx] = rgb.r;
                    imageData.data[pixelIdx + 1] = rgb.g;
                    imageData.data[pixelIdx + 2] = rgb.b;
                    imageData.data[pixelIdx + 3] = Math.round(intensity * 255);
                }
            }
        } else { // mono
            const bytesPerRow = Math.ceil(width / 8);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const byteIdx = y * bytesPerRow + Math.floor(x / 8);
                    if (byteIdx >= bytes.length) break;
                    const byte = bytes[byteIdx];
                    const bitIdx = 7 - (x % 8);
                    const isSet = (byte >> bitIdx) & 1;
                    const pixelIdx = (y * width + x) * 4;
                    if (isSet) {
                        imageData.data[pixelIdx] = rgb.r;
                        imageData.data[pixelIdx + 1] = rgb.g;
                        imageData.data[pixelIdx + 2] = rgb.b;
                        imageData.data[pixelIdx + 3] = 255;
                    } else {
                        imageData.data[pixelIdx + 3] = 0;
                    }
                }
            }
        }

        tctx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, startX, state.currentY);

        this.recordElementMetadata(node, startX, state.currentY, width, height);

        // Update state
        if (lowAlign === 'center' || lowAlign === 'centre' || lowAlign === 'right') {
            state.currentY += height;
            state.currentX = 0;
            state.maxLineHeight = this.LINE_HEIGHT;
        } else {
            state.currentX = startX + width;
            state.maxLineHeight = Math.max(state.maxLineHeight, height);
        }
    }

    /**
     * Decode raster data from either hexadecimal or Base64 format
     */
    decodeRasterData(data) {
        if (!data) return [];
        let cleanData = data.replace(/\s+/g, '');
        if (cleanData.length === 0) return [];

        // Detect format: Hexadecimal or Base64
        // Hexadecimal only uses 0-9, a-f, A-F and has an even length
        const isHex = /^[0-9a-fA-F]+$/.test(cleanData) && cleanData.length % 2 === 0;
        
        if (isHex) {
            const bytes = [];
            for (let i = 0; i < cleanData.length; i += 2) {
                bytes.push(parseInt(cleanData.substr(i, 2), 16));
            }
            return bytes;
        }

        // Try Base64
        try {
            // Clean non-base64 characters just in case
            cleanData = cleanData.replace(/[^A-Za-z0-9+/=]/g, '');
            const binaryString = atob(cleanData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return Array.from(bytes);
        } catch (e) {
            console.error('Failed to decode image data as Hex or Base64', e);
            return [];
        }
    }

    /**
     * Map color name to RGB values
     */
    colorToRgb(colorName) {
        switch (colorName) {
            case 'red': return { r: 255, g: 0, b: 0 };
            case 'blue': return { r: 0, g: 0, b: 255 };
            case 'green': return { r: 0, g: 128, b: 0 };
            case 'black':
            default: return { r: 0, g: 0, b: 0 };
        }
    }

    /**
     * Display an error message on the canvas
     */
    showError(message) {
        this.clearCanvas(this.ctx, this.canvas.width, this.canvas.height);
        this.ctx.fillStyle = 'red';
        this.ctx.font = '16px monospace';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText(message, 10, 10);
    }

    // ==== Added: History, Sharing, Zoom/Pan, and Toggles ====
    pushHistory() {
        if (this._applyingHistory) return;
        const curr = this.xmlInput.value;
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === curr) return;
        // Truncate redo tail
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        this.history.push(curr);
        if (this.history.length > 100) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
        this.updateUndoRedoButtons();
    }

    updateUndoRedoButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = !(this.historyIndex > 0);
        if (redoBtn) redoBtn.disabled = !(this.historyIndex < this.history.length - 1);
    }

    undo() {
        if (this.historyIndex <= 0) return;
        this.applyHistoryAt(this.historyIndex - 1);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return;
        this.applyHistoryAt(this.historyIndex + 1);
    }

    applyHistoryAt(index) {
        if (index < 0 || index >= this.history.length) return;
        this._applyingHistory = true;
        this.historyIndex = index;
        this.xmlInput.value = this.history[this.historyIndex];
        this._applyingHistory = false;
        this.updateShareUrl();
        this.render();
        this.updateUndoRedoButtons();
    }

    // Shareable URL (hash)
    updateShareUrl() {
        try {
            const params = new URLSearchParams();
            params.set('v', '1');
            params.set('ps', String(this.PRINT_WIDTH));
            const xml = this.xmlInput.value || '';
            const b64 = btoa(unescape(encodeURIComponent(xml)));
            params.set('xml', b64);
            const url = `${location.pathname}#${params.toString()}`;
            history.replaceState(null, '', url);
        } catch (e) { /* ignore */ }
    }

    parseShareOnInit() {
        if (!location.hash || location.hash.length < 2) return false;
        const hash = location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const ps = parseInt(params.get('ps'));
        if (!isNaN(ps)) {
            this.PRINT_WIDTH = ps;
            const select = document.getElementById('paper-size-select');
            if (select) select.value = String(ps);
            this.canvas.width = this.PRINT_WIDTH;
        }
        const b64 = params.get('xml');
        if (b64) {
            try {
                const xml = decodeURIComponent(escape(atob(b64)));
                this.xmlInput.value = xml;
            } catch (e) { /* ignore */ }
        }
        return true;
    }

    // View transforms
    setScale(newScale) {
        this.scale = Math.max(0.25, Math.min(4, newScale || 1));
        localStorage.setItem('scale', String(this.scale));
        this.applyTransformCSS();
    }

    setPan(x, y) {
        this.panX = x || 0;
        this.panY = y || 0;
        localStorage.setItem('panX', String(this.panX));
        localStorage.setItem('panY', String(this.panY));
        this.applyTransformCSS();
    }

    applyTransformCSS() {
        const el = this.canvas;
        if (!el) return;
        el.style.transformOrigin = 'top left';
        el.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;
    }

    // Color mapping
    mapColor(color) {
        const low = (color || 'color_1').toLowerCase();
        switch (low) {
            case 'color_1': return 'black';
            case 'color_2': return 'red';
            case 'color_3': return 'blue';
            case 'color_4': return 'green';
            case 'none': return 'none';
            default: return 'black';
        }
    }
}

// Initialize the simulator when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.eposSimulator = new EposSimulator('preview', 'xml-input');
});
