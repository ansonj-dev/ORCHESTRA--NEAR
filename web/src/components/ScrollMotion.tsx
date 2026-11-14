'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const VARIANTS = ['up', 'pop', 'left', 'right'] as const;
const TARGETS = [
  'h1', 'h2', 'section', 'article', 'form', 'table', 'pre',
  '[class*="rounded-2xl"][class*="border"]', '[class*="rounded-xl"][class*="border"]',
  '.tool-grid > *', '.starter-agent-card', '.agent-type-card', '.capability-card',
  '[data-reveal]',
].join(',');

export default function ScrollMotion() {
  const pathname = usePathname();

  useEffect(() => {
    document.documentElement.classList.add('motion-ready');
    const root = document.querySelector<HTMLElement>('#app-content');
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const seen = new WeakSet<Element>();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.add('is-visible');
        observer.unobserve(el);
        // Clear transforms afterwards so fixed-position modals are never trapped.
        const done = () => el.classList.add('reveal-done');
        el.addEventListener('animationend', done, { once: true });
        window.setTimeout(done, 1400);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

    const tag = () => {
      let index = 0;
      root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
        if (seen.has(el) || el.closest('[role="dialog"], .fixed, [data-no-reveal]')) return;
        seen.add(el);
        if (!el.hasAttribute('data-reveal')) {
          el.setAttribute('data-reveal', el.matches('h1, h2') ? 'up' : VARIANTS[index % VARIANTS.length]);
        }
        if (!el.hasAttribute('data-reveal-delay')) el.style.animationDelay = `${(index % 4) * 70}ms`;
        index += 1;
        observer.observe(el);
      });
    };
    tag();
    const mutations = new MutationObserver(tag);
    mutations.observe(root, { childList: true, subtree: true });

    // Pointer parallax for illustrated layers.
    const layers = () => document.querySelectorAll<HTMLElement>('[data-parallax]');
    const onMove = (event: PointerEvent) => {
      const x = event.clientX / window.innerWidth - 0.5;
      const y = event.clientY / window.innerHeight - 0.5;
      layers().forEach((layer) => {
        const depth = Number(layer.dataset.parallax || 10);
        layer.style.setProperty('--px', `${(x * depth).toFixed(1)}px`);
        layer.style.setProperty('--py', `${(y * depth).toFixed(1)}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [pathname]);

  return null;
}
