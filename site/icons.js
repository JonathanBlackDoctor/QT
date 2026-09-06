const ICONS = {
  book: '<svg viewBox="0 0 16 16"><path d="M2 2.5h4.2A1.8 1.8 0 0 1 8 4.3v9.2a2 2 0 0 0-2-2H2zM14 2.5H9.8A1.8 1.8 0 0 0 8 4.3v9.2a2 2 0 0 1 2-2h4z"/></svg>',
  cross: '<svg viewBox="0 0 16 16"><path d="M8 1v14M3 5h10"/></svg>',
  note: '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 6h6M5 9h6"/></svg>',
  compass: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="m10.5 5.5-1.4 3.6-3.6 1.4 1.4-3.6z"/></svg>',
  question: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M6.2 6.2A2 2 0 1 1 9 8c-.8.4-1 .8-1 1.5M8 12h.01"/></svg>',
  prayer: '<svg viewBox="0 0 16 16"><path d="M8 1.5 14 14H2zM8 5v5"/></svg>',
  context: '<svg viewBox="0 0 16 16"><path d="m8 1.5 6.5 6.5L8 14.5 1.5 8z"/></svg>',
  film: '<svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="2"/><path d="M5 3v10M11 3v10M1.5 6h3.5M11 6h3.5M1.5 10h3.5M11 10h3.5"/></svg>',
  lines: '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 8h12M2 13h8"/></svg>',
  language: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M2.7 10.5h10.6M5 3.8c.5 5.5 2 8 3 8s2.5-2.5 3-8"/></svg>',
  link: '<svg viewBox="0 0 16 16"><path d="M6.3 9.7 9.7 6.3M5.2 11.7l-1 .9a2.7 2.7 0 0 1-3.8-3.8l2.4-2.4a2.7 2.7 0 0 1 3.8 0M10.8 4.3l1-.9a2.7 2.7 0 1 1 3.8 3.8l-2.4 2.4a2.7 2.7 0 0 1-3.8 0"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="m2 8 4 4 8-8"/></svg>',
  close: '<svg viewBox="0 0 16 16"><path d="m3 3 10 10M13 3 3 13"/></svg>',
  chevronLeft: '<svg viewBox="0 0 12 16"><path d="m9 2-6 6 6 6"/></svg>',
  chevronRight: '<svg viewBox="0 0 12 16"><path d="m3 2 6 6-6 6"/></svg>',
  calendar: '<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1.5v3M11 1.5v3M2 6.5h12"/></svg>',
};

export function icon(name) {
  const node = document.createElement('span');
  node.className = 'line-icon';
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name] || ICONS.lines;
  return node;
}
