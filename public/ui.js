const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file: '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h5"/>',
  blog: '<path d="m16 3 5 5-11 11-7 2 2-7Z"/><path d="m14 5 5 5M5 14l5 5"/>',
  link: '<path d="m10 13 4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m2 1 2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  external: '<path d="M7 17 17 7M7 7h10v10"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  save: '<path d="M5 3h12l4 4v14H3V3Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
  undo: '<path d="M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-6-6L3 21"/>',
  text: '<path d="M4 5h16M12 5v16M8 21h8"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  message: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/><path d="M7 9h10M7 13h6"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  logout: '<path d="M9 3H4v18h5M13 7l5 5-5 5M8 12h12"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  grip: '<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',
  chart: '<path d="M3 3v18h18M7 15l4-5 4 3 6-8"/>',
  palette: '<circle cx="8" cy="8" r=".7"/><circle cx="15" cy="6" r=".7"/><circle cx="6" cy="14" r=".7"/><path d="M21 12a9 9 0 1 0-9 9h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a3 3 0 0 0 3-3Z"/>',
  game: '<path d="M7 7h10c3 0 5 10 3 12-2 1-5-4-5-4H9s-3 5-5 4C2 17 4 7 7 7Z"/><path d="M6 11h5M8.5 8.5v5M16 10h.01M18 12h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'
};

export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.65');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `ui-icon ${className}`.trim());
  svg.innerHTML = iconPaths[name] || iconPaths.file;
  return svg;
}

export function withIcon(control, name) {
  control.prepend(icon(name));
  return control;
}

let dialogId = 0;
export function openDialog({ title, description = '', content, className = '' }) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = `ui-dialog ${className}`.trim();
  const header = document.createElement('header');
  header.className = 'dialog-header';
  const copy = document.createElement('div');
  const heading = document.createElement('h2');
  heading.id = `dialog-title-${++dialogId}`;
  heading.textContent = title;
  copy.append(heading);
  if (description) {
    const text = document.createElement('p');
    text.textContent = description;
    copy.append(text);
  }
  dialog.setAttribute('aria-labelledby', heading.id);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'icon-button';
  closeButton.setAttribute('aria-label', '关闭面板');
  closeButton.append(icon('close'));
  closeButton.addEventListener('click', () => dialog.close());
  header.append(copy, closeButton);
  dialog.append(header, content);
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close: () => dialog.close() };
}

export function confirmAction({ title, description, confirmLabel = '确认', destructive = false }) {
  return new Promise(resolve => {
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'button';
    cancel.textContent = '取消';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = destructive ? 'button destructive' : 'button primary';
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    const { dialog, close } = openDialog({ title, description, content: actions, className: 'confirm-dialog' });
    cancel.addEventListener('click', close);
    confirm.addEventListener('click', () => { resolve(true); close(); });
    dialog.addEventListener('close', () => resolve(false), { once: true });
    cancel.focus();
  });
}

export function notify(message, { error = false } = {}) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = `ui-toast${error ? ' is-error' : ''}`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon(error ? 'info' : 'check'), text);
  region.replaceChildren(toast);
  window.setTimeout(() => toast.remove(), error ? 6500 : 4200);
}

export function bindNavigation(root, sidebar, trigger, scrim) {
  const media = window.matchMedia('(max-width: 860px)');
  let open = false;
  const setOpen = value => {
    open = value && media.matches;
    root.classList.toggle('mobile-nav-open', open);
    document.body.classList.toggle('navigation-is-open', open);
    trigger.setAttribute('aria-expanded', String(open));
    sidebar.inert = root.dataset.saving === 'true' || (media.matches && !open);
    const main = root.querySelector(':scope > main');
    if (main) main.inert = open;
    if (open) sidebar.querySelector('a, button:not(:disabled), input')?.focus();
    else if (sidebar.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  };
  const toggle = () => { if (root.dataset.saving !== 'true') setOpen(!open); };
  const close = () => setOpen(false);
  const keydown = event => {
    if (!open || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') { close(); trigger.focus(); }
    if (event.key === 'Tab') {
      const items = [...sidebar.querySelectorAll('a[href], button:not(:disabled), input')].filter(item => !item.hidden && item.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  trigger.addEventListener('click', toggle);
  scrim.addEventListener('click', close);
  media.addEventListener('change', close);
  document.addEventListener('keydown', keydown);
  setOpen(false);
  return () => {
    document.body.classList.remove('navigation-is-open');
    trigger.removeEventListener('click', toggle);
    media.removeEventListener('change', close);
    document.removeEventListener('keydown', keydown);
  };
}