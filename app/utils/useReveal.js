import { useEffect, useRef } from 'react';

/**
 * useReveal — triggers fade-in animation when element enters viewport.
 *
 * Adds 'visible' class to elements with 'reveal' class when they
 * scroll into view. Triggers once, never re-animates.
 *
 * Usage:
 *   const revealRef = useReveal();
 *   <div ref={revealRef} className="reveal">...</div>
 *
 * For staggered children:
 *   <div ref={revealRef} className="stagger">
 *     <div className="reveal">child 1</div>
 *     <div className="reveal">child 2</div>
 *   </div>
 *
 * Options:
 *   useReveal({ threshold: 0.1, rootMargin: '50px' })
 */
export default function useReveal(opts = {}) {
  // Support legacy signature: useReveal(0.15)
  const options = typeof opts === 'number'
    ? { threshold: opts }
    : opts;

  const {
    threshold = 0.15,
    rootMargin = '40px 0px',
  } = options;

  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      const targets = el.classList.contains('reveal')
        ? [el]
        : el.querySelectorAll('.reveal');
      targets.forEach((t) => t.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (el.classList.contains('reveal')) {
              el.classList.add('visible');
            }
            if (el.classList.contains('stagger')) {
              const children = el.querySelectorAll('.reveal');
              children.forEach((child) => child.classList.add('visible'));
            }
            observer.unobserve(el);
          }
        });
      },
      { threshold, rootMargin }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}
