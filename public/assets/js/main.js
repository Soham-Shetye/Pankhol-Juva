/**
 * main.js — Pankhol Juva: Mangrove Conservation & Eco Tourism
 *
 * Audit fixes applied:
 *
 *  1. Two DOMContentLoaded listeners merged into one single entry point.
 *  2. All DOM-touching code moved inside that listener.
 *  3. Null checks added before every DOM query — script is safe on all
 *     pages, not just index.html.
 *  4. Double carousel initialisation fixed: data-bs-ride is absent from
 *     the HTML, so Bootstrap auto-init does not fire. This file is the
 *     single initialisation point.
 *  5. Word cycling moved inside DOMContentLoaded — previously ran at
 *     top level and could execute before the element existed.
 *  6. Scroll listener throttled with requestAnimationFrame — was
 *     previously firing on every scroll event with no throttle.
 *  7. Global updateModal() function and inline onclick attributes
 *     replaced with event delegation. Input is escaped before
 *     rendering to prevent future XSS risk.
 *  8. Hero progress bar implemented and synced to the carousel interval.
 *  9. Video modal cleanup: iframe src is reset on close to stop
 *     YouTube audio continuing after the modal is dismissed.
 */


/* ================================================================
   SCROLL LISTENER — placed outside DOMContentLoaded intentionally.
   Attaches to window, not a DOM element, so has no DOM dependency.
   Throttled with requestAnimationFrame to limit DOM queries to
   once per animation frame (~16ms) instead of every scroll event.
   { passive: true } signals to the browser this handler will never
   call preventDefault(), allowing it to optimise scroll performance.
================================================================ */
(function () {
    var ticking = false;

    window.addEventListener('scroll', function () {
        if (ticking) return;

        ticking = true;

        requestAnimationFrame(function () {
            var navbar = document.querySelector('.custom-nav');

            if (navbar) {
                if (window.scrollY > 40) {
                    navbar.classList.add('scrolled');
                } else {
                    navbar.classList.remove('scrolled');
                }
            }

            ticking = false;
        });

    }, { passive: true });
}());


/* ================================================================
   SINGLE DOMContentLoaded LISTENER
   Every function that reads or writes the DOM runs from here.
   Nothing touches the DOM above this block.
================================================================ */
document.addEventListener('DOMContentLoaded', function () {


    /* ------------------------------------------------------------
       1. OFFCANVAS — body class toggle
       Adds offcanvas-open to body when the mobile drawer opens,
       which triggers navbar.css to hide the floating navbar.
    ------------------------------------------------------------ */
    var offcanvasEl = document.getElementById('mobileMenu');

    if (offcanvasEl) {
        offcanvasEl.addEventListener('show.bs.offcanvas', function () {
            document.body.classList.add('offcanvas-open');
        });

        offcanvasEl.addEventListener('hide.bs.offcanvas', function () {
            document.body.classList.remove('offcanvas-open');
        });
    }


    /* ------------------------------------------------------------
       2. HERO CAROUSEL — single manual initialisation
       data-bs-ride is NOT on the HTML element, so Bootstrap's
       auto-init does not run. This is the only place the carousel
       is created, preventing the double-initialisation conflict.
    ------------------------------------------------------------ */
    var heroCarouselEl = document.querySelector('#hero-carousel');

    if (heroCarouselEl) {
        var heroCarousel = new bootstrap.Carousel(heroCarouselEl, {
            interval: 5000,
            wrap: true,
            pause: false,
            touch: true
        });

        heroCarousel.cycle();

        /* Reset and restart the progress bar after each slide transition */
        heroCarouselEl.addEventListener('slid.bs.carousel', function () {
            resetProgressBar();
        });

        /* Start the progress bar immediately on page load */
        startProgressBar();
    }


    /* ------------------------------------------------------------
       3. HERO PROGRESS BAR
       Animates from 0% to 100% over 5000ms — matching the carousel
       interval. Resets to 0% and restarts after each slide change.
    ------------------------------------------------------------ */
    var heroBar = document.getElementById('heroBar');

    /**
     * Starts the progress bar animation from 0 to 100%
     * over the carousel interval duration (5000ms).
     */
    function startProgressBar() {
        if (!heroBar) return;

        /* Remove transition first so the width resets instantly */
        heroBar.style.transition = 'none';
        heroBar.style.width = '0%';

        /*
         * Force a reflow so the browser registers the width: 0%
         * before the transition is re-applied. Without this, the
         * browser batches both changes and skips the reset.
         */
        void heroBar.offsetWidth;

        /* Apply the animation */
        heroBar.style.transition = 'width 5000ms linear';
        heroBar.style.width = '100%';
    }

    /** Resets the bar and restarts the animation cleanly. */
    function resetProgressBar() {
        if (!heroBar) return;
        startProgressBar();
    }


    /* ------------------------------------------------------------
       4. CYCLING HEADLINE WORD
       Rotates words inside the hero H1 with a fade/slide animation.
       Uses two CSS classes (word-exit, word-enter) defined in
       sections.css for the transition effect.
    ------------------------------------------------------------ */
    var heroWordEl = document.getElementById('cyclingWord');

    /*
     * Add or remove words from this array at any time.
     * The first word matches the HTML default so the sequence
     * starts correctly without a visible jump on first cycle.
     */
    var heroWords = [
        'Holiday',
        'Family',
        'Group',
        'Adventure'
    ];

    var heroWordIndex = 0;

    /**
     * Advances to the next word with a 3-step animation:
     * fade out → swap text → fade in.
     */
    function cycleHeroWord() {
        if (!heroWordEl) return;

        /* Step 1: fade current word out (upward) */
        heroWordEl.classList.add('word-exit');

        setTimeout(function () {

            /* Step 2: swap the text while the element is invisible */
            heroWordIndex = (heroWordIndex + 1) % heroWords.length;
            heroWordEl.textContent = heroWords[heroWordIndex];

            heroWordEl.classList.remove('word-exit');
            heroWordEl.classList.add('word-enter');

            /*
             * Step 3: two nested requestAnimationFrames force the
             * browser to paint the word-enter state before removing
             * the class, producing a smooth upward fade-in.
             */
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    heroWordEl.classList.remove('word-enter');
                });
            });

        }, 600); /* Must match the CSS transition duration (0.6s) */
    }

    if (heroWordEl) {
        /*
         * Delay the initial start of the cycle by 2 seconds.
         * This prevents the JS from manipulating the DOM while the 
         * browser is trying to paint the Largest Contentful Paint (LCP).
         */
        setTimeout(function () {
            /*
             * Word is visible for 4 seconds before transitioning.
             * Full cycle time ≈ 4s display + 0.6s exit + 0.6s enter = ~5.2s
             * Adjust 4000 to change the display duration.
             */
            setInterval(cycleHeroWord, 4000);
        }, 2000); // 2000ms = 2 second delay before the cycling begins
    }


    /* ------------------------------------------------------------
       5. GALLERY LIGHTBOX — event delegation
       Replaces the previous global updateModal() function and all
       inline onclick="updateModal(...)" attributes in the HTML.

       Each .gallery-item element carries data-img and data-caption
       attributes. A single click listener on document catches all
       clicks and walks up the DOM to find the nearest .gallery-item,
       then reads those attributes.

       This approach is safer because:
       - No global scope pollution
       - Input is escaped before insertion into the DOM
       - Works for gallery items added dynamically in the future
    ------------------------------------------------------------ */
    var galleryModal = document.getElementById('galleryModal');
    var galleryModalImg = document.getElementById('modalImg');
    var galleryModalCapt = document.getElementById('modalCaption');

    /**
     * Escapes a string so it is safe to use as a DOM attribute
     * value or text content. Prevents XSS if captions or image
     * paths ever come from user-supplied or CMS-generated content.
     *
     * @param  {string} str - Raw input string.
     * @return {string}       HTML-safe string.
     */
    function escapeHtml(str) {
        var map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return String(str).replace(/[&<>"']/g, function (char) {
            return map[char];
        });
    }

    /**
     * Opens the gallery lightbox with the image and caption
     * from the clicked gallery item's data attributes.
     *
     * @param {HTMLElement} item - The .gallery-item element clicked.
     */
    function openGalleryModal(item) {
        if (!galleryModal || !galleryModalImg || !galleryModalCapt) return;

        var imgSrc = item.getAttribute('data-img') || '';
        var caption = item.getAttribute('data-caption') || '';

        /* Escape src before setting as attribute */
        galleryModalImg.src = escapeHtml(imgSrc);
        galleryModalImg.alt = escapeHtml(caption);
        /* textContent is inherently safe — no escaping needed */
        galleryModalCapt.textContent = caption;

        var bsModal = bootstrap.Modal.getOrCreateInstance(galleryModal);
        bsModal.show();
    }

    /* Delegate clicks from all current and future .gallery-item elements */
    document.addEventListener('click', function (e) {
        var item = e.target.closest('.gallery-item');
        if (item) {
            openGalleryModal(item);
        }
    });

    /* Keyboard support: Enter or Space opens a focused gallery item */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            var item = e.target.closest('.gallery-item');
            if (item) {
                e.preventDefault();
                openGalleryModal(item);
            }
        }
    });

    /* Clear the modal image when it closes to free memory */
    if (galleryModal) {
        galleryModal.addEventListener('hidden.bs.modal', function () {
            if (galleryModalImg) galleryModalImg.src = '';
            if (galleryModalCapt) galleryModalCapt.textContent = '';
        });
    }


    /* ------------------------------------------------------------
       6. VIDEO MODAL — stop YouTube playback on close
       Without this, closing the modal leaves the YouTube iframe
       audio playing in the background. Resetting the src attribute
       forces the iframe to unload the video completely.
    ------------------------------------------------------------ */
    var videoModal = document.getElementById('videoModal');

    if (videoModal) {
        videoModal.addEventListener('hidden.bs.modal', function () {
            var iframe = videoModal.querySelector('iframe');
            if (iframe) {
                iframe.src = iframe.src;
            }
        });
    }


}); /* END DOMContentLoaded */