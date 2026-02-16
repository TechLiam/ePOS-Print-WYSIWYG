import { DEFAULT_XML } from './Constants.js';

export class XmlHandler {
    constructor(inputElement) {
        this.inputElement = inputElement;
        this.parser = new DOMParser();
    }

    parse(xmlString) {
        if (!xmlString || !xmlString.trim()) {
            return { doc: null, error: null };
        }

        const doc = this.parser.parseFromString(xmlString, 'text/xml');
        const parserError = doc.getElementsByTagName('parsererror');
        
        if (parserError.length > 0) {
            return { 
                doc: null, 
                error: parserError[0].textContent || 'XML Parse Error' 
            };
        }

        return { doc, error: null };
    }

    serialize(doc) {
        const serializer = new XMLSerializer();
        let xml = serializer.serializeToString(doc);
        
        // Basic formatting
        xml = xml.replace(/(>)(<)(\/*)/g, '$1\r\n$2$3');
        return xml;
    }

    getValue() {
        return this.inputElement.value;
    }

    setValue(value) {
        this.inputElement.value = value;
    }

    addElement(doc, type, editingElement) {
        if (!doc || !doc.documentElement) {
            const result = this.parse(DEFAULT_XML);
            doc = result.doc;
        }

        const root = doc.documentElement;
        let newNode;

        switch (type) {
            case 'text':
                newNode = doc.createElement('text');
                newNode.textContent = 'New Text';
                break;
            case 'newline':
                newNode = doc.createElement('text');
                newNode.textContent = '\n';
                break;
            case 'hline':
                newNode = doc.createElement('hline');
                newNode.setAttribute('style', 'line_thin');
                break;
            case 'barcode':
                newNode = doc.createElement('barcode');
                newNode.setAttribute('type', 'code128');
                newNode.setAttribute('align', 'center');
                newNode.textContent = '12345678';
                break;
            case 'symbol':
                newNode = doc.createElement('symbol');
                newNode.setAttribute('type', 'qrcode_model_2');
                newNode.setAttribute('align', 'center');
                newNode.textContent = 'https://example.com';
                break;
            case 'image':
                newNode = doc.createElement('image');
                newNode.setAttribute('width', '64');
                newNode.setAttribute('height', '64');
                newNode.setAttribute('align', 'center');
                newNode.textContent = 'ffffffffffffffff';
                break;
            case 'logo':
                newNode = doc.createElement('logo');
                newNode.setAttribute('key1', '1');
                newNode.setAttribute('key2', '1');
                break;
            case 'feed':
                newNode = doc.createElement('feed');
                newNode.setAttribute('line', '1');
                break;
            case 'cut':
                newNode = doc.createElement('cut');
                newNode.setAttribute('type', 'feed');
                break;
        }

        if (newNode) {
            if (editingElement && editingElement.parentNode === root) {
                root.insertBefore(newNode, editingElement.nextSibling);
            } else {
                root.appendChild(newNode);
            }
        }
        
        return { doc, newNode };
    }
}
