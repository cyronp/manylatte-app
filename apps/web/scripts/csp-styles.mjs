import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Generate exact style hashes from the installed components, so dependency updates
// cannot leave the deployed policy with stale hashes. No script exceptions added.
const dom = new JSDOM(
  '<!doctype html><html><head></head><body style="margin:0;padding:0"><div id="root"></div></body></html>',
  { pretendToBeVisual: true, url: 'http://localhost' },
);
for (const name of [
  'window',
  'document',
  'HTMLElement',
  'Element',
  'Node',
  'NodeFilter',
  'MutationObserver',
  'CustomEvent',
  'Event',
  'getComputedStyle',
  'HTMLInputElement',
])
  globalThis[name] =
    name === 'getComputedStyle'
      ? dom.window.getComputedStyle.bind(dom.window)
      : dom.window[name];
globalThis.self = dom.window;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(
  dom.window,
);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
const { createElement: h } = await import('react');
const { createRoot } = await import('react-dom/client');
const { flushSync } = await import('react-dom');
const { default: PickerModule } = await import('emoji-picker-react');
const Picker = PickerModule.default ?? PickerModule;
const { HexColorPicker } = await import('react-colorful');
const { Dialog, ScrollArea } = await import('radix-ui');
let renderError;
const root = createRoot(document.getElementById('root'), {
  onUncaughtError: (error) => {
    renderError = error;
  },
});
const hashes = new Set();
const collect = () =>
  document
    .querySelectorAll('style')
    .forEach((style) =>
      hashes.add(
        `'sha256-${createHash('sha256').update(style.textContent).digest('base64')}'`,
      ),
    );
// Input OTP creates an empty stylesheet, then inserts rules through the CSSOM.
hashes.add(`'sha256-${createHash('sha256').update('').digest('base64')}'`);
for (let gap = 0; gap <= 32; gap++) {
  Object.defineProperty(document.documentElement, 'clientWidth', {
    configurable: true,
    value: window.innerWidth - gap,
  });
  flushSync(() =>
    root.render(
      h(
        Dialog.Root,
        { open: true, key: gap },
        h(
          Dialog.Portal,
          null,
          h(Dialog.Overlay),
          h(
            Dialog.Content,
            { 'aria-describedby': undefined },
            h(Dialog.Title, null, 'Style policy build'),
            h(ScrollArea.Root, null, h(ScrollArea.Viewport, null, 'Content')),
            h(HexColorPicker),
            h(Picker, {
              emojiStyle: 'native',
              previewConfig: { showPreview: false },
            }),
          ),
        ),
      ),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  if (renderError) throw renderError;
  collect();
  flushSync(() => root.render(null));
}
root.unmount();
dom.window.close();
const template = await readFile(
  new URL('../public/_headers', import.meta.url),
  'utf8',
);
await writeFile(
  new URL('../dist/_headers', import.meta.url),
  template.replace(
    "style-src-elem 'self'",
    `style-src-elem 'self' ${[...hashes].sort().join(' ')}`,
  ),
);
console.log(
  `Generated CSP allowlist for ${hashes.size} installed component styles.`,
);
