export class UIManager {
    constructor(app) {
        this.app = app;
        this.setupAccessibility();
    }

    setupAccessibility() {
        // Add ARIA labels to icon-only buttons
        const btnHelp = document.getElementById('btn-help');
        if (btnHelp) btnHelp.setAttribute('aria-label', 'Show Help');

        const btnTheme = document.getElementById('theme-toggle');
        if (btnTheme) btnTheme.setAttribute('aria-label', 'Toggle Dark/Light Mode');

        const btnShare = document.getElementById('btn-share');
        if (btnShare) btnShare.setAttribute('aria-label', 'Copy Shareable URL');

        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) btnUndo.setAttribute('aria-label', 'Undo');

        const btnRedo = document.getElementById('btn-redo');
        if (btnRedo) btnRedo.setAttribute('aria-label', 'Redo');
    }

    showProperties(meta, allowedAttributesFn, createPropertyFieldFn, autoFocus = false) {
        const type = meta.node.localName;
        const panel = document.getElementById('properties-panel');
        const title = document.getElementById('properties-title');
        const content = document.getElementById('properties-content');
        const footer = document.getElementById('properties-footer');
        
        if (title) title.textContent = `Edit <${type}>`;
        if (content) content.innerHTML = '';
        if (panel) panel.classList.add('show');
        if (footer) footer.style.display = 'block';

        // Add content field
        if (['text', 'barcode', 'symbol', 'image'].includes(type)) {
            createPropertyFieldFn(content, 'textContent', meta.node.textContent, type, true);
        }

        // Add attributes
        const attributes = allowedAttributesFn(type);
        attributes.forEach(attr => {
            const val = meta.node.getAttribute(attr) || '';
            createPropertyFieldFn(content, attr, val, type);
        });
        
        if (autoFocus) {
            // Focus the first input for keyboard navigation
            const firstInput = content.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
        } else if (title) {
            // Focus the title so the panel is the active keyboard context but not trapped in an input
            title.focus();
        }
    }

    get isModalOpen() {
        const helpModal = document.getElementById('help-modal');
        const dialogModal = document.getElementById('dialog-modal');
        return (helpModal && helpModal.style.display === 'block') ||
               (dialogModal && dialogModal.style.display === 'block');
    }

    closeProperties() {
        const panel = document.getElementById('properties-panel');
        if (panel) panel.classList.remove('show');

        const title = document.getElementById('properties-title');
        const content = document.getElementById('properties-content');
        const footer = document.getElementById('properties-footer');

        if (title) title.textContent = 'Properties';
        if (content) {
            content.innerHTML = `
                <div class="properties-empty">
                    <p>No element selected.</p>
                    <p style="font-size: 0.85em; margin-top: 10px;">Click an element on the canvas to edit its properties.</p>
                </div>
            `;
        }
        if (footer) footer.style.display = 'none';
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
        const closeBtn = document.getElementById('help-close');

        modal.style.display = 'block';
        overlay.style.display = 'block';
        closeBtn.focus();

        const onHide = () => {
            this.hideHelp();
            overlay.removeEventListener('click', onHide);
            closeBtn.removeEventListener('click', onHide);
        };

        overlay.addEventListener('click', onHide);
        closeBtn.addEventListener('click', onHide);
    }

    hideHelp() {
        document.getElementById('help-modal').style.display = 'none';
        document.getElementById('popup-overlay').style.display = 'none';
    }

    showAlert(message, title = 'Alert') {
        return this._showDialog(title, message, false, false);
    }

    showConfirm(message, title = 'Confirm') {
        return this._showDialog(title, message, true, false);
    }

    showPrompt(message, defaultValue = '', title = 'Prompt') {
        return this._showDialog(title, message, true, true, defaultValue);
    }

    _showDialog(title, message, showCancel, showInput, defaultValue = '') {
        const modal = document.getElementById('dialog-modal');
        const overlay = document.getElementById('popup-overlay');
        const titleEl = document.getElementById('dialog-title');
        const messageEl = document.getElementById('dialog-message');
        const cancelBtn = document.getElementById('dialog-cancel');
        const okBtn = document.getElementById('dialog-ok');
        const inputContainer = document.getElementById('dialog-input-container');
        const inputEl = document.getElementById('dialog-input');

        titleEl.textContent = title;
        messageEl.textContent = message;
        cancelBtn.style.display = showCancel ? 'block' : 'none';
        inputContainer.style.display = showInput ? 'block' : 'none';
        
        if (showInput) {
            inputEl.value = defaultValue;
        }

        modal.style.display = 'block';
        overlay.style.display = 'block';

        if (showInput) {
            inputEl.focus();
            inputEl.select();
        } else {
            okBtn.focus();
        }

        return new Promise((resolve) => {
            const cleanup = () => {
                modal.style.display = 'none';
                overlay.style.display = 'none';
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                document.getElementById('dialog-close').removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onCancel);
            };

            const onOk = (e) => {
                if (e) e.preventDefault();
                cleanup();
                resolve(showInput ? inputEl.value : true);
            };

            const onCancel = (e) => {
                if (e) e.preventDefault();
                cleanup();
                resolve(showInput ? null : false);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            document.getElementById('dialog-close').addEventListener('click', onCancel);
            overlay.addEventListener('click', onCancel);
        });
    }
}
