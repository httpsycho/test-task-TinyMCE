import './style.css';

const store = (() => {
  let templates = [
    { id: crypto.randomUUID(), text: 'template 1' },
    { id: crypto.randomUUID(), text: 'template 2' },
    { id: crypto.randomUUID(), text: 'template 3' },
  ];
  const subs = new Set();
  const api = {
    getAll: () => templates.map((t) => ({ ...t })),
    add() {
      templates = [...templates, { id: crypto.randomUUID(), text: 'template' }];
      api.emit();
    },
    remove(id) {
      templates = templates.filter((t) => t.id !== id);
      api.emit();
    },
    update(id, text) {
      templates = templates.map((t) => (t.id === id ? { ...t, text } : t));
      api.emit();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    emit() {
      subs.forEach((fn) => fn(api.getAll()));
    },
  };
  return api;
})();

class TemplateManager extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="tplList" class="list" aria-label="Templates list"></div>

      <div class="sidebar__titles">Edit template</div>
      <input id="tplEdit" type="text" placeholder="" disabled>
      <div style="height:.5rem"></div>
      <div class="row">
        <button id="btn-del" class="btn" disabled>-</button>
        <button id="btn-add" class="btn">+</button>
      </div>
    `;

    this.listEl = this.querySelector('#tplList');
    this.editEl = this.querySelector('#tplEdit');
    this.addBtn = this.querySelector('#btn-add');
    this.delBtn = this.querySelector('#btn-del');

    this.selectedTemplateId = null;

    this.unsubscribe = store.subscribe(() => {
      this.renderTemplateList(store.getAll());
      refreshAllComponents();
    });

    this.renderTemplateList(store.getAll());

    this.editEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitTemplateEdit();
        this.editEl.blur();
      }
    });
    this.editEl.addEventListener('blur', () => this.commitTemplateEdit());

    this.addBtn.onclick = () => {
      store.add();
      const arr = store.getAll();
      const last = arr[arr.length - 1];
      if (last) this.selectTemplate(last.id);
    };

    this.delBtn.onclick = () => {
      if (!this.selectedTemplateId) return;
      store.remove(this.selectedTemplateId);
      this.selectedTemplateId = null;
      this.editEl.value = '';
      this.editEl.disabled = true;
      this.delBtn.disabled = true;
    };
  }

  disconnectedCallback() {
    if (this.unsubscribe) this.unsubscribe();
  }

  renderTemplateList(items) {
    this.listEl.innerHTML = '';
    items.forEach((item) => {
      const div = document.createElement('div');
      div.className =
        'item' + (item.id === this.selectedTemplateId ? ' is-active' : '');
      div.textContent = item.text;
      div.dataset.id = item.id;
      div.onclick = () => this.selectTemplate(item.id);
      this.listEl.appendChild(div);
    });
  }

  selectTemplate(id) {
    const item = store.getAll().find((t) => t.id === id);

    if (!item) {
      this.selectedTemplateId = null;
      this.editEl.disabled = true;
      this.editEl.value = '';
      this.delBtn.disabled = true;
      this.renderTemplateList(store.getAll());
      return;
    }

    this.selectedTemplateId = item.id;
    this.editEl.disabled = false;
    this.editEl.value = item.text;
    this.delBtn.disabled = false;
    this.renderTemplateList(store.getAll());
  }

  commitTemplateEdit() {
    if (!this.selectedTemplateId) return;
    store.update(
      this.selectedTemplateId,
      this.editEl.value.trim() || 'template'
    );
  }
}
customElements.define('template-manager', TemplateManager);

let editorRef;
tinymce.init({
  selector: '#editor',
  menubar: false,
  toolbar: false,
  plugins: 'noneditable',
  branding: false,
  height: '100%',
  noneditable_class: 'mceNonEditable',
  statusbar: false,
  resize: false,
  content_style: `
    body {
      margin:14px;          
      color:#e9eef3;
      background:#1e2126;
      font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,Arial
    }
    .special-component {
      display:inline-flex;
      align-items:center;
      gap:.4rem;
      padding:.1rem .4rem;
      border:1px solid #374151;
      border-radius:.35rem;
      background:#111827;
      color:#e5e7eb
    }
    .special-component.error {
      background:#2a1111;
      border-color:#7f1d1d;
      color:#fecaca
    }
      ::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: #1e1e1e;
}

::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #888;
}

  `,
  setup(editor) {
    editorRef = editor;

    editor.on('click', (evt) => {
      const comp = evt.target.closest('.special-component');
      if (comp) openFloatingSelectFor(comp);
    });

    editor.on('keydown', (e) => handleTokenDeletionKeys(e));

    editor.on('PreInit', () => {
      editor.schema.addValidElements(
        'span[class|data-template-id|contenteditable]'
      );
    });
  },
});

document.getElementById('btn-insert').onclick = () => {
  const items = store.getAll();
  const first = items[0];
  const cls = 'special-component mceNonEditable' + (first ? '' : ' error');
  const label = first ? escapeHtml(first.text) : 'ERROR';
  const idAttr = first ? first.id : '';
  const html = `<span class="${cls}" contenteditable="false" data-template-id="${idAttr}">${label}</span>`;
  editorRef?.insertContent(html);
};

let floatingSelectEl = null;
function openFloatingSelectFor(comp) {
  closeFloatingSelect();

  const wrap = document.createElement('div');
  wrap.className = 'floating-select';
  const sel = document.createElement('select');

  store.getAll().forEach((it) => {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = it.text;
    sel.appendChild(opt);
  });

  sel.value = comp.dataset.templateId || '';

  sel.onchange = () => {
    updateComponentTemplate(comp, sel.value);
    closeFloatingSelect();
    editorRef?.focus();
  };

  wrap.appendChild(sel);
  document.body.appendChild(wrap);

  const rect = comp.getBoundingClientRect();
  wrap.style.left = rect.left + window.scrollX + 'px';
  wrap.style.top = rect.bottom + 6 + window.scrollY + 'px';

  floatingSelectEl = wrap;
}
function closeFloatingSelect() {
  if (floatingSelectEl) {
    floatingSelectEl.remove();
    floatingSelectEl = null;
  }
}

function updateComponentTemplate(comp, id) {
  const item = store.getAll().find((t) => t.id === id);
  if (item) {
    comp.dataset.templateId = item.id;
    comp.classList.remove('error');
    comp.textContent = item.text;
  } else {
    comp.dataset.templateId = '';
    comp.classList.add('error');
    comp.textContent = 'ERROR';
  }
}

function refreshAllComponents() {
  if (!editorRef) return;
  const body = editorRef.getBody();
  body.querySelectorAll('.special-component').forEach(updateComponentLabel);
}
function updateComponentLabel(comp) {
  const id = comp.dataset.templateId || '';
  const item = store.getAll().find((t) => t.id === id);
  if (item) {
    comp.classList.remove('error');
    comp.textContent = item.text;
  } else {
    comp.classList.add('error');
    comp.textContent = 'ERROR';
  }
}

function handleTokenDeletionKeys(e) {
  if (!editorRef) return;

  const isBackspace = e.key === 'Backspace';
  const isDelete = e.key === 'Delete';
  if (!isBackspace && !isDelete) return;

  const sel = editorRef.selection;
  const rng = sel.getRng();
  const node = rng.startContainer;
  const off = rng.startOffset;

  function isToken(el) {
    if (!el) return false;
    if (!el.classList) return false;
    return el.classList.contains('special-component');
  }

  if (node.nodeType === 3) {
    const textLen = node.nodeValue ? node.nodeValue.length : 0;
    if (isBackspace && off > 0) return;
    if (isDelete && off < textLen) return;
  }

  function getAdjacentToken() {
    if (node.nodeType === 3) {
      const textLen = node.nodeValue ? node.nodeValue.length : 0;

      if (isBackspace && off === 0) {
        const prev = node.previousSibling;
        return isToken(prev) ? prev : null;
      }
      if (isDelete && off === textLen) {
        const next = node.nextSibling;
        return isToken(next) ? next : null;
      }
      return null;
    }
    const children = node.childNodes;
    if (isBackspace && off > 0) {
      const left = children[off - 1];
      return isToken(left) ? left : null;
    }
    if (isDelete && off < children.length) {
      const right = children[off];
      return isToken(right) ? right : null;
    }
    return null;
  }

  const token = getAdjacentToken();
  if (token) {
    e.preventDefault();
    token.remove();
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
