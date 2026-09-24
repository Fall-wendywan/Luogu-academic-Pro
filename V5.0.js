// ==UserScript==
// @name         洛谷强力学术Pro
// @namespace    http://tampermonkey.net/
// @version      10.71
// @author       wendywan
// @icon         https://cdn.luogu.com.cn/upload/image_hosting/psd5a03h.png
// @description  洛谷专注模式
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @license      MIT
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    /* ============ 常量 ============ */
    const KEY = {
        PIDS: 'luogu_study_plan_pids', SOLUTION: 'luogu_study_plan_solution',
        ACTIVE: 'luogu_focus_active', END: 'luogu_focus_end_time', STATE: 'luogu_focus_state',
        MODE: 'luogu_focus_current_mode', REMAINING: 'luogu_focus_remaining',
        WORK: 'luogu_focus_duration', REST: 'luogu_rest_duration',
        COLOR: 'luogu_focus_color', OPACITY: 'luogu_widget_opacity', POS: 'luogu_focus_position',
        URLWL: 'luogu_focus_url_whitelist', URLWL_ON: 'luogu_focus_url_whitelist_on', MIG: 'luogu_focus_migrated'
    };
    const DEFAULT = { WORK: 25, REST: 5, COLOR: '#ff6b6b', OPACITY: 0.9, POS: { x: 20, y: 100 }, WIDTH: 138, MAX_PIDS: 6, MAX_URLS: 10 };
    const RE = {
        PID: /^(P\d{3,6}|SP\d{3,5}|B\d{3,5}|CF\d+[A-Z0-9]*|AT_[a-z0-9_]+|UVA\d{3,5}|[A-Z]{2,6}\d+[A-Z0-9]*)$/i,
        HEX: /^#[0-9a-f]{6}$/i,
        URL_ENTRY: /^([a-z0-9*-]+\.)+[a-z*]{2,}(:\d+)?([/?#][\w./?#&=%+*-]*)?$/i,
        LUOGU: /^(https?:\/\/)?(www\.)?luogu\.com\.cn/i,
        SOLUTION: /\/problem\/solution\//i
    };
    const LUOGU_PATHS = [/^\/problem\//i, /^\/paste(\/.*)?$/i, /^\/record\//i, /^\/article(\/.*)?$/i, /^\/training(\/.*)?$/i];
    const onLuogu = () => RE.LUOGU.test(window.location.href);

    /* ============ 存储：GM 跨域共享，无 GM 回退 localStorage，双写保兼容 ============ */
    const safe = fn => { try { return fn(); } catch {} };
    const HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function' && typeof GM_deleteValue === 'function';
    const store = {
        get(k, d = null) { try { const v = HAS_GM ? GM_getValue(k) : localStorage.getItem(k); return v == null ? d : v; } catch { return d; } },
        set(k, v) { const s = String(v); if (HAS_GM) safe(() => GM_setValue(k, s)); safe(() => localStorage.setItem(k, s)); },
        del(k) { if (HAS_GM) safe(() => GM_deleteValue(k)); safe(() => localStorage.removeItem(k)); },
        int(k, d) { const n = parseInt(store.get(k), 10); return Number.isFinite(n) ? n : d; },
        num(k, d) { const n = parseFloat(store.get(k)); return Number.isFinite(n) ? n : d; },
        json(k, d) { try { const v = JSON.parse(store.get(k)); return v == null ? d : v; } catch { return d; } },
        setJson(k, v) { store.set(k, JSON.stringify(v)); }
    };
    const boolSetting = (key, dflt) => ({ get: () => store.get(key, String(dflt)) === 'true', set: v => store.set(key, v) });
    const listStore = key => ({
        get() { const a = store.json(key, []); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && x.trim()) : []; },
        save(a) { store.setJson(key, a); },
        add(v, max) { const a = this.get(); if (a.includes(v)) return 'dup'; if (a.length >= max) return 'full'; a.push(v); this.save(a); return 'ok'; },
        remove(v) { const a = this.get(), i = a.indexOf(v); if (i < 0) return false; a.splice(i, 1); this.save(a); return true; }
    });

    /* ============ 通用工具 ============ */
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    const hexToRgb = h => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const luma = h => { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
    const shiftHex = (h, pct) => '#' + hexToRgb(h).map(x => clamp(x + Math.round(2.55 * pct), 0, 255).toString(16).padStart(2, '0')).join('');
    const textOn = h => (luma(h) * 255 >= 128 ? '#111' : '#fff');
    const geoAlpha = h => clamp(0.4 - luma(h) * 0.22, 0.18, 0.4);
    const deepShade = h => (luma(h) > 0.45 ? '#' + hexToRgb(h).map(x => Math.round(x * 0.45).toString(16).padStart(2, '0')).join('') : h);
    const escRe = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

    /* ============ 设置与名单 ============ */
    const settings = {
        get work() { return clamp(store.int(KEY.WORK, DEFAULT.WORK), 1, 120); },
        get rest() { return clamp(store.int(KEY.REST, DEFAULT.REST), 1, 60); },
        get color() { const c = store.get(KEY.COLOR, DEFAULT.COLOR); return RE.HEX.test(c) ? c.toLowerCase() : DEFAULT.COLOR; },
        get opacity() { return clamp(store.num(KEY.OPACITY, DEFAULT.OPACITY), 0.3, 1); },
        get pos() { const p = store.json(KEY.POS, DEFAULT.POS) || DEFAULT.POS; return { x: Number(p.x) || 0, y: Number(p.y) || 0 }; }
    };
    const pids = listStore(KEY.PIDS);
    const urls = listStore(KEY.URLWL);
    const solutionAllowed = boolSetting(KEY.SOLUTION, true);
    const whitelistOn = boolSetting(KEY.URLWL_ON, false);
    const normUrl = raw => raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
    const saveDurations = (w, r) => { store.set(KEY.WORK, w); store.set(KEY.REST, r); };
    const saveColor = c => { if (RE.HEX.test(c)) store.set(KEY.COLOR, c.toLowerCase()); };
    function migrateLegacy() {
        if (!HAS_GM || !onLuogu() || store.get(KEY.MIG) === '1') return;
        for (const k of Object.values(KEY)) { const v = safe(() => localStorage.getItem(k)); if (v != null && GM_getValue(k) == null) GM_setValue(k, v); }
        store.set(KEY.MIG, '1');
    }

    /* ============ 专注状态机（跨页延续） ============ */
    const Focus = {
        get active() { return store.get(KEY.ACTIVE) === 'true'; },
        get state() { return store.get(KEY.STATE); },
        get mode() { return store.get(KEY.MODE) === 'rest' ? 'rest' : 'work'; },
        get expired() { return this.active && this.state === 'running' && Date.now() >= store.int(KEY.END, 0); },
        isActive() { return this.active && !this.expired; },
        get running() { return this.isActive() && this.state === 'running'; },
        get paused() { return this.isActive() && this.state === 'paused'; },
        begin(mode) {
            const m = mode === 'work' ? settings.work : settings.rest;
            store.set(KEY.ACTIVE, 'true'); store.set(KEY.END, Date.now() + m * 60000);
            store.set(KEY.STATE, 'running'); store.set(KEY.MODE, mode);
            if (mode === 'work') store.set(KEY.WORK, m);
            store.del(KEY.REMAINING);
        },
        resume(mode, sec) { store.set(KEY.ACTIVE, 'true'); store.set(KEY.END, Date.now() + sec * 1000); store.set(KEY.STATE, 'running'); store.set(KEY.MODE, mode); store.del(KEY.REMAINING); },
        pause(sec) { store.set(KEY.STATE, 'paused'); store.set(KEY.REMAINING, sec); store.del(KEY.END); },
        end() { [KEY.ACTIVE, KEY.END, KEY.STATE, KEY.REMAINING, KEY.MODE].forEach(k => store.del(k)); }
    };

    /* ============ 访问控制：洛谷白名单 / 题解阻断 / 站外网址白名单 / SPA 守卫 ============ */
    const Access = {
        redirectUrl() { const a = pids.get(); return 'https://www.luogu.com.cn/problem/' + (a.length ? a[0] : 'list'); },
        urlRule(entry) {
            const tail = entry.endsWith('*') ? '' : '(?=[/?#:]|$)';
            const body = entry.startsWith('*.')
                ? '(?:[a-z0-9-]+\\.)*' + escRe(entry.slice(2)).split('*').join('[\\s\\S]*')
                : escRe(entry).split('*').join('[\\s\\S]*');
            return new RegExp('^(https?://)?(www\\.)?' + body + tail, 'i');
        },
        urlAllowed(href) { return urls.get().some(e => this.urlRule(e).test(href)); },
        solutionBlocked() { return onLuogu() && RE.SOLUTION.test(window.location.pathname) && !solutionAllowed.get(); },
        externalBlocked() { return whitelistOn.get() && !onLuogu() && !this.urlAllowed(window.location.href); },
        luoguAllowed() {
            if (!Focus.isActive() || Focus.paused || Focus.mode === 'rest') return true;
            const p = window.location.pathname.toLowerCase();
            if (RE.SOLUTION.test(p)) return solutionAllowed.get();
            return LUOGU_PATHS.some(re => re.test(p));
        },
        enforce() {
            const denied = this.solutionBlocked() || this.externalBlocked() || (onLuogu() && Focus.isActive() && !this.luoguAllowed());
            if (denied) window.location.replace(this.redirectUrl());
            return denied;
        },
        watchRouter() {
            if (window.__lapGuard) return;
            window.__lapGuard = true;
            for (const fn of ['pushState', 'replaceState']) {
                const raw = history[fn];
                history[fn] = function () { raw.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
            }
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
            window.addEventListener('locationchange', () => this.enforce());
            let last = location.pathname + location.hash;
            setInterval(() => { const cur = location.pathname + location.hash; if (cur !== last) { last = cur; this.enforce(); } }, 800);
        }
    };

    /* ============ 题解入口隐藏（observer 全局唯一） ============ */
    const SolutionHider = {
        SEL: 'a[href*="/problem/solution/"],[class*="solution"],[class*="answer"],.lg-article-content',
        observer: null,
        hide(root) {
            if (!root.querySelectorAll) return;
            safe(() => {
                for (const el of [root, ...root.querySelectorAll(this.SEL)]) {
                    if (el.nodeType !== 1 || !el.matches?.(this.SEL)) continue;
                    if (!(el.textContent || '').includes('题解') && !(el.href || '').includes('/problem/solution/')) continue;
                    Object.assign(el.style, { display: 'none', visibility: 'hidden', height: '0', overflow: 'hidden', pointerEvents: 'none' });
                }
            });
        },
        sync() {
            if (solutionAllowed.get()) { if (this.observer) { this.observer.disconnect(); this.observer = null; } return; }
            if (this.observer || !document.body) return;
            this.observer = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) this.hide(n); })));
            this.observer.observe(document.body, { childList: true, subtree: true });
            this.hide(document.body);
        }
    };

    /* ============ 主题：全局唯一 <style>，改色整体重写 ============ */
    const Theme = {
        palette(c) { return { main: c, light: shiftHex(c, 85), dark: shiftHex(c, -20), onMain: textOn(c), chip: deepShade(c), geo: geoAlpha(c).toFixed(2) }; },
        css(c) { const p = this.palette(c); return this.widgetCSS(p) + this.modalCSS(p); },
        widgetCSS(p) {
            return `
#luogu-widget{position:fixed;z-index:2147483644;box-sizing:border-box;width:${DEFAULT.WIDTH}px;background:rgba(255,255,255,var(--lap-a,.9));backdrop-filter:blur(6px) saturate(1.1);-webkit-backdrop-filter:blur(6px) saturate(1.1);border:1px solid #e2e5ea;border-radius:12px;box-shadow:0 4px 16px rgba(30,40,60,.16);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden;cursor:grab;transition:box-shadow .25s,background-color .2s}
#luogu-widget *,#luogu-widget *::before,#luogu-widget *::after{box-sizing:border-box}
#luogu-widget:hover{box-shadow:0 6px 20px rgba(30,40,60,.22)}
#luogu-widget.dragging{cursor:grabbing;box-shadow:0 10px 28px rgba(30,40,60,.28)}
#luogu-widget.work-running{border-color:${p.main};box-shadow:0 0 0 2px ${p.main}55,0 4px 16px ${p.main}40}
@keyframes luogu-pulse{0%{transform:scale(1)}35%{transform:scale(1.06)}100%{transform:scale(1)}}
#luogu-widget.pulse{animation:luogu-pulse .6s ease}
#luogu-widget .lg-head{display:flex;align-items:center;justify-content:space-between;height:30px;padding:6px 6px 0 10px}
#luogu-mode{font-size:11px;font-weight:600;color:#8a919c;letter-spacing:1px}
#luogu-widget.work-running #luogu-mode{color:${p.dark}}
#luogu-widget.paused #luogu-mode{color:#d97706}
#luogu-settings{width:22px;height:22px;flex:0 0 22px;border:0;border-radius:6px;background:${p.main};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .15s,filter .15s;box-shadow:0 1px 3px rgba(0,0,0,.2)}
#luogu-settings:hover{transform:scale(1.1);filter:brightness(1.05)}
#luogu-settings svg{width:13px;height:13px;fill:${p.onMain};pointer-events:none}
#luogu-time{font-size:26px;font-weight:700;line-height:1.15;text-align:center;color:#2b3138;font-variant-numeric:tabular-nums;padding:0 6px 5px;white-space:nowrap}
#luogu-widget .lg-track{height:4px;margin:0 10px;border-radius:2px;background:#edeff2;overflow:hidden}
#luogu-bar{height:100%;width:0;background:${p.main};border-radius:2px;transition:width .3s linear}
#luogu-widget .lg-controls{display:flex;gap:6px;padding:9px 8px 8px}
#luogu-widget .lg-btn{flex:1;min-width:0;height:26px;border:0;border-radius:7px;font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:filter .15s,transform .1s}
#luogu-widget .lg-btn:active:not(:disabled){transform:scale(.96)}
#luogu-widget .lg-btn:disabled{opacity:.45;cursor:default}
#luogu-widget .lg-btn.primary{background:${p.main};color:${p.onMain}}
#luogu-widget .lg-btn.primary:hover:not(:disabled){filter:brightness(.92)}
#luogu-widget .lg-btn.secondary{background:${p.light};color:${p.dark}}
#luogu-widget .lg-btn.secondary:hover:not(:disabled){filter:brightness(.97)}`;
        },
        modalCSS(p) {
            return `
#luogu-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:2147483645;display:none;backdrop-filter:blur(2px)}
#luogu-modal-box{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:360px;max-width:92vw;max-height:92vh;overflow:hidden;padding:16px 18px 18px;background:rgba(255,255,255,.7);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.5);box-shadow:0 12px 40px rgba(0,0,0,.15);border-radius:14px;z-index:2147483646;display:none;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC",sans-serif}
#luogu-modal-box *,#luogu-modal-box *::before,#luogu-modal-box *::after{box-sizing:border-box}
#luogu-modal-box .lg-inner{position:relative;z-index:2;max-height:calc(92vh - 36px);overflow-y:auto;scrollbar-width:none;-ms-overflow-style:none}
#luogu-modal-box .lg-inner::-webkit-scrollbar{width:0;height:0}
#luogu-modal-box .lg-geo{position:absolute;pointer-events:none;z-index:1;filter:blur(1px)}
#luogu-modal-box h3{margin:0 0 12px;color:#1a1a1a;text-align:center;font-size:18px;font-weight:700}
#luogu-modal-box .setting-section{margin-bottom:10px}
#luogu-modal-box .setting-label{display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#4a5568;letter-spacing:.3px}
#luogu-pid-input,#luogu-url-input{width:100%;padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;transition:all .2s;background:rgba(255,255,255,.6)}
#luogu-pid-input:focus,#luogu-url-input:focus{border-color:${p.main};outline:none;box-shadow:0 0 0 3px ${p.main}22;background:#fff}
#luogu-url-input{margin-top:8px}
#luogu-modal-box .pid-list{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;min-height:24px}
#luogu-modal-box .pid-item{background:linear-gradient(135deg,${p.main}26,${p.main}40);border:1px solid ${p.main}66;color:${p.chip};font-weight:600;padding:3px 9px;border-radius:12px;font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;transition:all .2s}
#luogu-modal-box .pid-item:hover{transform:translateY(-1px);box-shadow:0 2px 8px ${p.main}55;background:linear-gradient(135deg,${p.main}33,${p.main}4d)}
#luogu-modal-box .pid-item>span:first-child{max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#luogu-modal-box .pid-item .remove{color:#ef4444;font-weight:bold;cursor:pointer;line-height:1}
#luogu-modal-box .pid-empty{color:#cbd5e1;font-size:12px;padding:4px;width:100%;text-align:center}
#luogu-modal-box .setting-row{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:rgba(248,250,252,.5);border-radius:10px;border:1px solid #e2e8f0}
#luogu-modal-box .setting-text{font-size:13px;color:#4a5568;font-weight:500}
#luogu-modal-box .switch{position:relative;width:44px;height:24px;flex:0 0 44px}
#luogu-modal-box .switch input{opacity:0;width:0;height:0}
#luogu-modal-box .switch-slider{position:absolute;cursor:pointer;inset:0;background:#cbd5e1;transition:.3s;border-radius:24px}
#luogu-modal-box .switch-slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:#fff;transition:.3s;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,.1)}
#luogu-modal-box input:checked+.switch-slider{background:linear-gradient(135deg,${p.main},${p.main}cc)}
#luogu-modal-box input:checked+.switch-slider:before{transform:translateX(20px)}
#luogu-modal-box .duration-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#luogu-modal-box .duration-item{display:flex;flex-direction:column;gap:4px}
#luogu-modal-box .duration-item label{font-size:11px;color:#718096;font-weight:500}
#luogu-modal-box .duration-input{width:100%;padding:7px 10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;background:rgba(255,255,255,.6);transition:all .2s}
#luogu-modal-box .duration-input:focus{outline:none;border-color:${p.main};background:#fff}
#luogu-modal-box .color-row{display:flex;align-items:center;gap:10px}
#luogu-color-input{width:64px;flex:0 0 64px;height:32px;padding:2px;border:1.5px solid #e2e8f0;border-radius:8px;cursor:pointer;background:#fff}
#luogu-modal-box .opacity-slider{flex:1;display:flex;align-items:center;gap:10px}
#luogu-modal-box .opacity-slider input[type="range"]{flex:1;height:6px;border-radius:3px;background:#e2e8f0;outline:none;-webkit-appearance:none;appearance:none}
#luogu-modal-box .opacity-slider input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:18px;height:18px;border-radius:50%;background:${p.main};cursor:pointer;box-shadow:0 2px 4px rgba(0,0,0,.2)}
#luogu-modal-box .opacity-value{min-width:42px;text-align:right;font-size:13px;font-weight:600;color:#4a5568}
#luogu-modal-box .hint{font-size:11px;color:#a0aec0;margin-top:4px;line-height:1.4}
#luogu-modal-box .btn-group{display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:12px}
#luogu-modal-box .btn{padding:9px;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit;transition:all .2s}
#luogu-save-btn{background:linear-gradient(135deg,${p.main},${p.main}bb);color:#fff;box-shadow:0 4px 12px ${p.main}44}
#luogu-save-btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px ${p.main}66}
#luogu-cancel-btn{background:#f1f5f9;color:#64748b}
#luogu-cancel-btn:hover{background:#e2e8f0}
#luogu-modal-box .lg-geo-op{opacity:${p.geo}}`;
        },
        apply() {
            let st = document.getElementById('luogu-theme-style');
            if (!st) { st = document.createElement('style'); st.id = 'luogu-theme-style'; (document.head || document.documentElement).appendChild(st); }
            st.textContent = this.css(settings.color);
        },
        applyOpacity() { const w = document.getElementById('luogu-widget'); if (w) w.style.setProperty('--lap-a', settings.opacity); }
    };

    /* ============ 钟面 ============ */
    const GEAR_SVG = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>';

    function makeDraggable(el) {
        const place = (x, y) => {
            el.style.left = Math.round(clamp(x, 0, Math.max(0, innerWidth - el.offsetWidth))) + 'px';
            el.style.top = Math.round(clamp(y, 0, Math.max(0, innerHeight - el.offsetHeight))) + 'px';
        };
        let drag = null;
        el.addEventListener('pointerdown', e => {
            if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button')) return;
            const r = el.getBoundingClientRect();
            drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
            el.classList.add('dragging');
            safe(() => el.setPointerCapture(e.pointerId));
            e.preventDefault();
        });
        el.addEventListener('pointermove', e => { if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy); });
        const drop = () => {
            if (!drag) return;
            drag = null; el.classList.remove('dragging');
            const r = el.getBoundingClientRect();
            store.setJson(KEY.POS, { x: Math.round(r.left), y: Math.round(r.top) });
        };
        el.addEventListener('pointerup', drop);
        el.addEventListener('pointercancel', drop);
        window.addEventListener('resize', () => { const r = el.getBoundingClientRect(); place(r.left, r.top); });
        return place;
    }

    const Widget = {
        api: null,
        create() {
            if (this.api || !onLuogu()) return;
            const el = document.createElement('div');
            el.id = 'luogu-widget';
            el.innerHTML = `<div class="lg-head"><span id="luogu-mode">专注</span><button id="luogu-settings" title="设置" aria-label="设置">${GEAR_SVG}</button></div><div id="luogu-time">--:--</div><div class="lg-track"><div id="luogu-bar"></div></div><div class="lg-controls"><button class="lg-btn primary" id="luogu-main">开始</button><button class="lg-btn secondary" id="luogu-stop">结束</button></div>`;
            document.body.appendChild(el);

            const $ = id => el.querySelector('#' + id);
            const ui = { mode: $('luogu-mode'), time: $('luogu-time'), bar: $('luogu-bar'), main: $('luogu-main'), stop: $('luogu-stop') };
            let mode = Focus.mode, remaining = 0, ticker = null;
            const durOf = m => (m === 'work' ? settings.work : settings.rest) * 60;

            const render = () => {
                ui.time.textContent = fmtTime(remaining);
                ui.bar.style.width = clamp((1 - remaining / durOf(mode)) * 100, 0, 100) + '%';
                ui.mode.textContent = Focus.paused ? '已暂停' : (mode === 'work' ? '专注' : '休息');
                ui.main.textContent = Focus.running ? '暂停' : (Focus.paused ? '继续' : '开始');
                ui.stop.disabled = !Focus.isActive();
                el.classList.toggle('work-running', Focus.running && mode === 'work');
                el.classList.toggle('paused', Focus.paused);
            };
            const startTicker = () => { stopTicker(); ticker = setInterval(tick, 250); };
            function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
            function tick() {
                const r = Math.max(0, Math.ceil((store.int(KEY.END, 0) - Date.now()) / 1000));
                if (r !== remaining) { remaining = r; render(); }
                if (r <= 0 && Focus.active && Focus.state === 'running') return nextPhase();
                if (!Focus.running) stopTicker();
            }
            function nextPhase() {
                mode = mode === 'work' ? 'rest' : 'work';
                Focus.begin(mode); remaining = durOf(mode);
                el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
                render(); startTicker();
            }

            ui.main.addEventListener('click', () => {
                if (Focus.running) { Focus.pause(remaining); stopTicker(); }
                else if (Focus.paused) { Focus.resume(mode, remaining); startTicker(); }
                else { Focus.begin(mode); remaining = durOf(mode); startTicker(); }
                render();
            });
            ui.stop.addEventListener('click', () => { stopTicker(); Focus.end(); mode = 'work'; remaining = durOf(mode); render(); });
            $('luogu-settings').addEventListener('click', () => Panel.open());
            document.addEventListener('visibilitychange', () => { if (!document.hidden && Focus.running) tick(); });

            this.api = { refresh() { if (!Focus.isActive()) remaining = durOf(mode); render(); } };
            remaining = Focus.running ? Math.max(0, Math.ceil((store.int(KEY.END, 0) - Date.now()) / 1000))
                : (Focus.paused ? Math.max(0, store.int(KEY.REMAINING, 0)) : durOf(mode));
            makeDraggable(el)(settings.pos.x, settings.pos.y);
            Theme.applyOpacity(); render();
            if (Focus.active && Focus.state === 'running') { if (Focus.expired) nextPhase(); else startTicker(); }
        }
    };

    /* ============ 设置面板（全局唯一，每次打开重建） ============ */
    const Panel = {
        nodes: null,
        close() {
            if (!this.nodes) return;
            this.nodes.mask.remove(); this.nodes.box.remove();
            document.removeEventListener('keydown', this.nodes.onKey);
            this.nodes = null;
        },
        chip(text, onRemove, onOpen) {
            const it = document.createElement('div');
            it.className = 'pid-item';
            const label = document.createElement('span');
            label.textContent = text;
            const rm = document.createElement('span');
            rm.className = 'remove'; rm.title = '删除'; rm.textContent = '×';
            it.append(label, rm);
            it.onclick = e => { if (e.target === rm) { e.stopPropagation(); onRemove(); } else onOpen(); };
            return it;
        },
        markup(p, g, cur) {
            return `<div class="lg-geo lg-geo-op" style="top:-30px;right:-30px;width:130px;height:130px;border-radius:50%;background:${p.main}"></div><div class="lg-geo" style="bottom:-20px;left:-25px;width:100px;height:100px;transform:rotate(45deg);border-radius:16px;background:${p.main};opacity:${(g * .75).toFixed(2)}"></div><div class="lg-geo" style="top:40%;right:25px;width:0;height:0;border-left:30px solid transparent;border-right:30px solid transparent;border-bottom:50px solid ${p.main};opacity:${(g * .85).toFixed(2)};transform:rotate(-15deg)"></div><div class="lg-geo" style="top:15%;left:-20px;width:60px;height:60px;border-radius:50%;border:6px solid ${p.main};opacity:${(g * .6).toFixed(2)}"></div><div class="lg-inner"><h3>设置</h3><div class="setting-section"><label class="setting-label">题目计划</label><input type="text" id="luogu-pid-input" placeholder="输入题号（如：P1000、CF1628D、AT_abc001_a）"><div class="pid-list" id="pid-list"></div><div class="hint">最多 ${DEFAULT.MAX_PIDS} 题，回车添加。</div></div><div class="setting-section"><div class="setting-row"><span class="setting-text">允许查看题解</span><label class="switch"><input type="checkbox" id="luogu-solution-checkbox"><span class="switch-slider"></span></label></div></div><div class="setting-section"><div class="setting-row"><span class="setting-text">启用全网阻断</span><label class="switch"><input type="checkbox" id="luogu-urlwl-checkbox"><span class="switch-slider"></span></label></div><input type="text" id="luogu-url-input" placeholder="输入网址（如 bilibili.com/video、oi-wiki.org/*）"><div class="pid-list" id="url-list"></div><div class="hint">开启后，名单外网站访问将被阻断。支持 * 通配符，回车添加，最多 ${DEFAULT.MAX_URLS} 条</div></div><div class="setting-section"><label class="setting-label">番茄钟时长（分钟）</label><div class="duration-row"><div class="duration-item"><label>工作</label><input type="number" id="luogu-work-input" class="duration-input" min="1" max="120"></div><div class="duration-item"><label>休息</label><input type="number" id="luogu-rest-input" class="duration-input" min="1" max="60"></div></div></div><div class="setting-section"><label class="setting-label">主题颜色</label><div class="color-row"><input type="color" id="luogu-color-input"><div class="opacity-slider"><input type="range" id="luogu-opacity-slider" min="0.3" max="1" step="0.05"><span class="opacity-value" id="opacity-value">${Math.round(cur * 100)}%</span></div></div><div class="hint">右侧滑块调节钟面背景透明度</div></div><div class="btn-group"><button id="luogu-cancel-btn" class="btn">取消</button><button id="luogu-save-btn" class="btn">保存</button></div></div>`;
        },
        open() {
            if (!onLuogu()) return;
            this.close();
            const c = settings.color, p = Theme.palette(c), cur = settings.opacity;
            const mask = document.createElement('div'); mask.id = 'luogu-modal-mask';
            const box = document.createElement('div'); box.id = 'luogu-modal-box';
            box.innerHTML = this.markup(p, geoAlpha(c), cur);
            document.body.append(mask, box);
            this.nodes = { mask, box, onKey: e => { if (e.key === 'Escape') this.close(); } };
            document.addEventListener('keydown', this.nodes.onKey);

            const $ = id => box.querySelector('#' + id);
            const pidInput = $('luogu-pid-input'), pidList = $('pid-list');
            const urlInput = $('luogu-url-input'), urlList = $('url-list');
            const slider = $('luogu-opacity-slider');

            const renderPidList = () => {
                pidList.innerHTML = '';
                const items = pids.get();
                if (!items.length) { pidList.innerHTML = '<div class="pid-empty">暂无题目</div>'; return; }
                for (const pid of items) pidList.appendChild(this.chip(pid, () => { pids.remove(pid); renderPidList(); }, () => { window.location.href = 'https://www.luogu.com.cn/problem/' + pid; }));
            };
            const renderUrlList = () => {
                urlList.innerHTML = '';
                const items = urls.get();
                if (!items.length) { urlList.innerHTML = '<div class="pid-empty">暂无网址</div>'; return; }
                for (const u of items) urlList.appendChild(this.chip(u, () => { urls.remove(u); renderUrlList(); }, () => { window.location.href = 'https://' + u.replace(/\*/g, ''); }));
            };
            const addPid = () => {
                const raw = pidInput.value.trim();
                if (!raw) return;
                const pid = raw.startsWith('AT_') ? raw : raw.toUpperCase();
                if (!RE.PID.test(pid)) return alert('题号格式错误：' + raw);
                const r = pids.add(pid, DEFAULT.MAX_PIDS);
                if (r === 'dup') { pidInput.value = ''; return alert('该题已在计划中'); }
                if (r === 'full') return alert('最多添加 ' + DEFAULT.MAX_PIDS + ' 题');
                pidInput.value = ''; renderPidList();
            };
            const addUrl = () => {
                const raw = urlInput.value.trim();
                if (!raw) return;
                const u = normUrl(raw);
                if (!RE.URL_ENTRY.test(u)) return alert('网址格式错误：' + raw);
                const r = urls.add(u, DEFAULT.MAX_URLS);
                if (r === 'dup') { urlInput.value = ''; return alert('该网址已在白名单中'); }
                if (r === 'full') return alert('最多添加 ' + DEFAULT.MAX_URLS + ' 条网址');
                urlInput.value = ''; renderUrlList();
            };
            const doSave = () => {
                const work = parseInt($('luogu-work-input').value, 10) || DEFAULT.WORK;
                const rest = parseInt($('luogu-rest-input').value, 10) || DEFAULT.REST;
                if (work < 1 || work > 120) return alert('工作时长 1-120');
                if (rest < 1 || rest > 60) return alert('休息时长 1-60');
                addPid(); addUrl();
                saveDurations(work, rest);
                saveColor($('luogu-color-input').value);
                solutionAllowed.set($('luogu-solution-checkbox').checked);
                whitelistOn.set($('luogu-urlwl-checkbox').checked);
                store.set(KEY.OPACITY, clamp(parseFloat(slider.value) || DEFAULT.OPACITY, 0.3, 1));
                Theme.apply(); Theme.applyOpacity(); SolutionHider.sync();
                if (Widget.api) Widget.api.refresh();
                this.close();
            };

            $('luogu-save-btn').onclick = doSave;
            $('luogu-cancel-btn').onclick = () => this.close();
            mask.onclick = () => this.close();
            pidInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addPid(); } };
            urlInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } };
            slider.value = cur;
            slider.oninput = e => {
                const v = parseFloat(e.target.value) || DEFAULT.OPACITY;
                $('opacity-value').textContent = Math.round(v * 100) + '%';
                const w = document.getElementById('luogu-widget');
                if (w) w.style.setProperty('--lap-a', v);
            };

            $('luogu-solution-checkbox').checked = solutionAllowed.get();
            $('luogu-urlwl-checkbox').checked = whitelistOn.get();
            $('luogu-work-input').value = settings.work;
            $('luogu-rest-input').value = settings.rest;
            $('luogu-color-input').value = c;
            renderPidList(); renderUrlList();
            mask.style.display = 'block'; box.style.display = 'block';
            pidInput.focus();
        }
    };

    /* ============ 启动 ============ */
    migrateLegacy();
    if (Access.enforce()) return;
    const boot = () => { if (onLuogu()) { Theme.apply(); Widget.create(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
    window.addEventListener('load', () => { if (onLuogu()) SolutionHider.sync(); Access.watchRouter(); }, { once: true });
})();
