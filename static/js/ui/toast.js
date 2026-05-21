// ═══════════════════════════════════════════════════════════════
// js/ui/toast.js
// Toast notification system.
// Depends on: nothing
// ═══════════════════════════════════════════════════════════════

'use strict';

/**
 * @param {string} message  - Short summary shown by default
 * @param {string|null} detail - Expanded content behind "more" button
 * @param {'warn'|'error'|'info'} type
 * @param {number} duration - ms before auto-dismiss
 */
function showToast(message, detail = null, type = 'warn', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast     = document.createElement('div');
    toast.className = `toast ${type}`;

    if (detail) {
        toast.innerHTML = `
            <span class="toast-short">${message}
                <span class="toast-more">more</span>
            </span>
            <div class="toast-full">${detail}</div>`;

        toast.querySelector('.toast-more').addEventListener('click', () => {
            const full = toast.querySelector('.toast-full');
            const btn  = toast.querySelector('.toast-more');
            full.classList.toggle('visible');
            btn.textContent = full.classList.contains('visible') ? 'less' : 'more';
        });
    } else {
        toast.textContent = message;
    }

    container.appendChild(toast);

    // Double rAF ensures the transition fires after the element is painted
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('visible'));
    });

    setTimeout(() => {
        toast.classList.remove('visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    }, duration);
}
