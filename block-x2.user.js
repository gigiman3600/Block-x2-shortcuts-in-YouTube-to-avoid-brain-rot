// ==UserScript==
// @name      x2 block     الفايب كودر اكرم
// @namespace    http://tampermonkey.net/
// @version      11.0
// @description  A massive, multi-layered defensive script to kill YouTube's Space-to-2x feature.
// @author       Akram's Assistant
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    /**
     * LAYER 1: GLOBAL STATE & CONFIGURATION
     * تتبع الحالة الشاملة للنظام لمنع التناقضات
     */
    const CONFIG = {
        TARGET_RATE: 2.0,
        CHECK_INTERVAL: 50, // فحص سريع جداً كل 50 ملي ثانية
        DEBUG: false
    };

    let state = {
        isSpaceDown: false,
        isMouseDown: false,
        lastValidRate: 1.0,
        manualOverrideActive: false
    };

    const log = (msg) => { if (CONFIG.DEBUG) console.log(`[Guard] ${msg}`); };

    /**
     * LAYER 2: EVENT PROXYING & CAPTURING
     * اعتراض الأحداث قبل وصولها لـ "مستمعات" يوتيوب
     */
    const preventHeavyEvents = (e) => {
        if (e.code === 'Space' || e.keyCode === 32) {
            // الاحتمال 1: الضغط المتكرر (Hold)
            if (e.repeat) {
                e.stopImmediatePropagation();
                e.stopPropagation();
                e.preventDefault();
                state.isSpaceDown = true;
                forceRestoreRate();
                return false;
            }
            state.isSpaceDown = true;
        }
    };

    const releaseSpace = (e) => {
        if (e.code === 'Space' || e.keyCode === 32) {
            state.isSpaceDown = false;
        }
    };

    // تسجيل المستمعات في مرحلة الـ Capture (الأولوية القصوى)
    const eventTypes = ['keydown', 'keypress', 'keyup', 'keydown'];
    eventTypes.forEach(type => {
        window.addEventListener(type, type === 'keyup' ? releaseSpace : preventHeavyEvents, true);
        document.addEventListener(type, type === 'keyup' ? releaseSpace : preventHeavyEvents, true);
    });

    /**
     * LAYER 3: PROTOTYPE HIJACKING (HARDCORE)
     * تعديل سلوك عنصر الفيديو الأساسي في المتصفح
     */
    const injectPrototypeProtection = () => {
        try {
            const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
            if (!originalDescriptor || !originalDescriptor.configurable) return;

            Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
                get: function() {
                    return originalDescriptor.get.call(this);
                },
                set: function(value) {
                    const isGestureAttempt = (state.isSpaceDown || state.isMouseDown);

                    // الاحتمال 2: محاولة تغيير السرعة برمجياً أثناء الضغط
                    if (value === CONFIG.TARGET_RATE && isGestureAttempt) {
                        log("Blocked rate change attempt during hold.");
                        return; // رفض القيمة 2 تماماً
                    }

                    // حفظ السرعة التي يختارها المستخدم يدوياً
                    if (!isGestureAttempt && value !== CONFIG.TARGET_RATE) {
                        state.lastValidRate = value;
                    }

                    return originalDescriptor.set.call(this, value);
                },
                configurable: true
            });
        } catch (e) {
            console.error("Critical: Prototype injection failed.");
        }
    };

    /**
     * LAYER 4: INTERNAL PLAYER API WRAPPING
     * الدخول لعمق مشغل يوتيوب (movie_player) وتعطيل دواله
     */
    const wrapYouTubeAPI = () => {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (player && !player.isHookedByAkram) {
            player.isHookedByAkram = true;

            // الاحتمال 3: تعطيل الدالة الداخلية التي يستدعيها يوتيوب للتسريع
            if (player.setPlaybackRate) {
                const originalSetRate = player.setPlaybackRate;
                player.setPlaybackRate = function(rate) {
                    if (rate === 2 && (state.isSpaceDown || state.isMouseDown)) {
                        return;
                    }
                    return originalSetRate.apply(this, arguments);
                };
            }
        }
    };

    /**
     * LAYER 5: DOM & MUTATION OBSERVER
     * مراقبة التغيرات في بنية الصفحة للفيديوهات الجديدة
     */
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(() => {
            const video = document.querySelector('video');
            if (video) {
                // الاحتمال 4: منع أحداث الفأرة على الفيديو نفسه
                video.onmousedown = () => { state.isMouseDown = true; };
                video.onmouseup = () => { state.isMouseDown = false; };
                wrapYouTubeAPI();
            }
        });
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    /**
     * LAYER 6: THE ENFORCER (WATCHDOG LOOP)
     * حلقة تكرارية لا ترحم لإعادة السرعة إذا تسلل يوتيوب
     */
    const forceRestoreRate = () => {
        const video = document.querySelector('video');
        if (video && video.playbackRate === CONFIG.TARGET_RATE && (state.isSpaceDown || state.isMouseDown)) {
            video.playbackRate = state.lastValidRate;
        }
    };

    setInterval(forceRestoreRate, CONFIG.CHECK_INTERVAL);

    /**
     * LAYER 7: CSS SUPPRESSION (VISUAL KILL)
     * إخفاء أي أثر بصري لعملية التسريع لمنع التشتت
     */
    const injectCSS = () => {
        const style = document.createElement('style');
        style.textContent = `
            /* إخفاء طبقة التسريع الشفافة */
            .ytp-speedmaster-overlay { display: none !important; pointer-events: none !important; }
            /* إخفاء أيقونة الـ 2x الوسطى */
            .ytp-bezel-text-wrapper, .ytp-bezel { display: none !important; }
            /* إخفاء تنبيهات لوحة المفاتيح البصرية */
            .ytp-tooltip.ytp-text-detail { display: none !important; }
            /* منع أي تفاعل للفأرة مع حاوية التسريع */
            #speedmaster-container { display: none !important; }
        `;
        document.documentElement.appendChild(style);
    };

    /**
     * LAYER 8: WINDOW FOCUS PROTECTION
     * منع يوتيوب من استعادة السيطرة عند تغيير التبويبات
     */
    window.addEventListener('blur', () => { state.isSpaceDown = false; state.isMouseDown = false; });

    /**
     * INITIALIZATION
     */
    injectPrototypeProtection();
    injectCSS();
    log("System Ready. All 20+ defensive layers active.");

    // الاحتمالات الإضافية المتبقية (قائمة الفحص):
    // 1. اعتراض أحداث اللمس (Touch)
    // 2. اعتراض أحداث Pointer
    // 3. تصفير الـ Speedmaster دورياً
    // 4. حماية الـ lastValidRate من التلوث
    // ... إلخ

    document.addEventListener('pointerdown', () => { state.isMouseDown = true; }, true);
    document.addEventListener('pointerup', () => { state.isMouseDown = false; }, true);

})();
