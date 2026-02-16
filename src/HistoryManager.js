export class HistoryManager {
    constructor(updateCallback) {
        this.history = [];
        this.historyIndex = -1;
        this._applyingHistory = false;
        this.updateCallback = updateCallback;
    }

    push(state) {
        if (this._applyingHistory) return;
        
        if (this.historyIndex >= 0 && this.history[this.historyIndex] === state) return;
        
        // Truncate redo tail
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(state);
        if (this.history.length > 100) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
        
        this.updateButtons();
    }

    undo() {
        if (this.historyIndex <= 0) return null;
        return this.applyHistoryAt(this.historyIndex - 1);
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return null;
        return this.applyHistoryAt(this.historyIndex + 1);
    }

    applyHistoryAt(index) {
        if (index < 0 || index >= this.history.length) return null;
        
        this._applyingHistory = true;
        this.historyIndex = index;
        const state = this.history[this.historyIndex];
        this._applyingHistory = false;
        
        this.updateButtons();
        return state;
    }

    updateButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = !(this.historyIndex > 0);
        if (redoBtn) redoBtn.disabled = !(this.historyIndex < this.history.length - 1);
    }
}
