import { splitParagraphs } from './model.js';
import { icon } from './icons.js';

export function el(tag, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export function textEl(tag, className, text) {
  const node = el(tag, className);
  node.textContent = text ?? '';
  return node;
}

export function appendParagraphs(parent, text) {
  const paragraphs = splitParagraphs(text);
  if (!paragraphs.length) {
    parent.appendChild(textEl('p', 'empty-inline', '표시할 내용이 없습니다.'));
    return;
  }
  for (const paragraph of paragraphs) parent.appendChild(textEl('p', '', paragraph));
}

export function sectionHeading(label, iconName) {
  const heading = el('div', 'section-heading');
  heading.append(icon(iconName), textEl('h2', '', label));
  return heading;
}

export function actionButton(className, dialogId) {
  const button = el('button', className);
  button.type = 'button';
  button.dataset.dialog = dialogId;
  button.setAttribute('aria-haspopup', 'dialog');
  return button;
}

export function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}
