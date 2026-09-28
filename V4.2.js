// ==UserScript==
// @name         洛谷强力学术Pro
// @namespace    http://tampermonkey.net/
// @version      4.2
// @author       wendywan
// @icon         https://cdn.luogu.com.cn/upload/image_hosting/psd5a03h.png
// @match        *://*/*
// @grant        none
// @license      MIT
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    const STORAGE_KEY_PID = "luogu_study_plan_pids";
    const STORAGE_KEY_SOLUTION = "luogu_study_plan_solution";
    const STORAGE_KEY_FOCUS_ACTIVE = "luogu_focus_active";
    const STORAGE_KEY_FOCUS_END = "luogu_focus_end_time";
    const STORAGE_KEY_FOCUS_DURATION = "luogu_focus_duration";
    const STORAGE_KEY_FOCUS_COLOR = "luogu_focus_color";
    const STORAGE_KEY_FOCUS_POS = "luogu_focus_position";
    const STORAGE_KEY_FOCUS_REMAINING = "luogu_focus_remaining";
    const STORAGE_KEY_FOCUS_STATE = "luogu_focus_state";
    const STORAGE_KEY_REST_DURATION = "luogu_rest_duration";
    const STORAGE_KEY_CURRENT_MODE = "luogu_focus_current_mode";
    const DEFAULT_WORK_DURATION = 25;
    const DEFAULT_REST_DURATION = 5;
    const DEFAULT_COLOR = "#ff6b6b";
    const DEFAULT_POSITION = { x: 20, y: 100 };
    const DEFAULT_SIZE = { width: 120, height: 100 };
    const MAX_PIDS = 6;

    // 颜色调整辅助函数
    function adjustColor(hex, percent) {
        const num = parseInt(hex.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, Math.min(255, (num >> 16) + amt));
        const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
        const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
        return '#' + [R, G, B].map(x => x.toString(16).padStart(2, '0')).join('');
    }

    // 对比度检测，决定按钮上的文字颜色是黑还是白
    function getContrastYIQ(hexcolor) {
        hexcolor = hexcolor.replace("#", "");
        const r = parseInt(hexcolor.substr(0,2),16);
        const g = parseInt(hexcolor.substr(2,2),16);
        const b = parseInt(hexcolor.substr(4,2),16);
        const yiq = ((r*299)+(g*587)+(b*114))/1000;
        return (yiq >= 128) ? '#111111' : '#ffffff';
    }

    // 根据颜色明度动态计算几何图形透明度
    function getAdaptiveOpacity(hex) {
        const c = hex.replace('#', '');
        const r = parseInt(c.substr(0, 2), 16);
        const g = parseInt(c.substr(2, 2), 16);
        const b = parseInt(c.substr(4, 2), 16);
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return Math.max(0.18, Math.min(0.40, 0.40 - (l * 0.22))).toFixed(2);
    }

    function getSavePids() {
        try {
            const pids = JSON.parse(localStorage.getItem(STORAGE_KEY_PID)) || [];
            return pids.filter(pid => pid.trim() !== '');
        } catch {
            return [];
        }
    }

    function savePids(pids) {
        localStorage.setItem(STORAGE_KEY_PID, JSON.stringify(pids));
    }

    function removePid(pid) {
        const pids = getSavePids();
        const index = pids.indexOf(pid);
        if (index !== -1) {
            pids.splice(index, 1);
            savePids(pids);
            return true;
        }
        return false;
    }

    function getSolutionStatus() {
        return localStorage.getItem(STORAGE_KEY_SOLUTION) !== 'false';
    }

    function saveSolutionStatus(status) {
        localStorage.setItem(STORAGE_KEY_SOLUTION, status);
    }

    function isFocusActive() {
        const active = localStorage.getItem(STORAGE_KEY_FOCUS_ACTIVE) === 'true';
        if (!active) return false;

        const state = localStorage.getItem(STORAGE_KEY_FOCUS_STATE);
        if (state === 'paused') {
            return true;
        }

        const endTime = parseInt(localStorage.getItem(STORAGE_KEY_FOCUS_END) || '0');
        const now = Date.now();
        if (active && now >= endTime) {
            endFocusMode();
            return false;
        }
        return active;
    }

    function startFocusMode(durationMinutes, isWorkMode) {
        const endTime = Date.now() + durationMinutes * 60 * 1000;
        localStorage.setItem(STORAGE_KEY_FOCUS_ACTIVE, 'true');
        localStorage.setItem(STORAGE_KEY_FOCUS_END, endTime.toString());
        if (isWorkMode) {
            localStorage.setItem(STORAGE_KEY_FOCUS_DURATION, durationMinutes.toString());
        }
        localStorage.setItem(STORAGE_KEY_FOCUS_STATE, 'running');
        localStorage.removeItem(STORAGE_KEY_FOCUS_REMAINING);
    }

    function pauseFocusMode(remainingSeconds) {
        localStorage.setItem(STORAGE_KEY_FOCUS_STATE, 'paused');
        localStorage.setItem(STORAGE_KEY_FOCUS_REMAINING, remainingSeconds.toString());
        localStorage.removeItem(STORAGE_KEY_FOCUS_END);
    }

    function endFocusMode() {
        localStorage.removeItem(STORAGE_KEY_FOCUS_ACTIVE);
        localStorage.removeItem(STORAGE_KEY_FOCUS_END);
        localStorage.removeItem(STORAGE_KEY_FOCUS_STATE);
        localStorage.removeItem(STORAGE_KEY_FOCUS_REMAINING);
        localStorage.removeItem(STORAGE_KEY_CURRENT_MODE);
    }

    function getWorkDuration() {
        return parseInt(localStorage.getItem(STORAGE_KEY_FOCUS_DURATION) || DEFAULT_WORK_DURATION);
    }

    function getRestDuration() {
        return parseInt(localStorage.getItem(STORAGE_KEY_REST_DURATION) || DEFAULT_REST_DURATION);
    }

    function saveDurations(work, rest) {
        localStorage.setItem(STORAGE_KEY_FOCUS_DURATION, work.toString());
        localStorage.setItem(STORAGE_KEY_REST_DURATION, rest.toString());
    }

    function getFocusColor() {
        return localStorage.getItem(STORAGE_KEY_FOCUS_COLOR) || DEFAULT_COLOR;
    }

    function saveFocusColor(color) {
        localStorage.setItem(STORAGE_KEY_FOCUS_COLOR, color);
    }

    function getFocusPosition() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY_FOCUS_POS) || JSON.stringify(DEFAULT_POSITION));
        } catch {
            return DEFAULT_POSITION;
        }
    }

    function saveFocusPosition(pos) {
        localStorage.setItem(STORAGE_KEY_FOCUS_POS, JSON.stringify(pos));
    }

    function getRedirectUrl() {
        const pids = getSavePids();
        return pids.length > 0
            ? `https://www.luogu.com.cn/problem/${pids[0]}`
            : 'https://www.luogu.com.cn/problem/list';
    }

    function shouldAllow() {
        const currentURL = window.location.href;
        const isLuoguDomain = /^(https?:\/\/)?(www\.)?luogu\.com\.cn/i.test(currentURL);
        if (!isLuoguDomain) return true;
        if (!isFocusActive()) return true;

        const state = localStorage.getItem(STORAGE_KEY_FOCUS_STATE);
        if (state === 'paused') return true;

        const currentMode = localStorage.getItem(STORAGE_KEY_CURRENT_MODE);
        if (currentMode === 'rest') return true;

        const path = window.location.pathname.toLowerCase();
        const allowedProblem = /^\/problem\//i.test(path);
        const allowedPaste = /^\/paste(\/.*)?$/i.test(path);
        const allowedRecord = /^\/record\//i.test(path);

        // 新增：允许访问 /article 及其子路径
        const allowedArticle = /^\/article(\/.*)?$/i.test(path);
        const allowedTraining = /^\/training(\/.*)?$/i.test(path);

        if (/\/problem\/solution\//i.test(path)) {
            return getSolutionStatus();
        }

        // 更新白名单逻辑
        return allowedProblem || allowedPaste || allowedRecord || allowedArticle || allowedTraining;
    }

    function blockSolutionAccess() {
        const path = window.location.pathname.toLowerCase();
        if (/\/problem\/solution\//i.test(path)) {
            if (!getSolutionStatus()) {
                window.location.replace(getRedirectUrl());
                return true;
            }
        }
        return false;
    }

    function enforceAccessRules() {
        if (blockSolutionAccess()) return true;
        if (isFocusActive() && !shouldAllow()) {
            window.location.replace(getRedirectUrl());
            return true;
        }
        return false;
    }

    function monitorSolutionElements() {
        if (!getSolutionStatus()) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType !== 1) return;
                        const selectors = [
                            'a[href*="/problem/solution/"]',
                            '[class*="solution"]',
                            '[class*="answer"]',
                            '.lg-article-content'
                        ];
                        try {
                            node.querySelectorAll(selectors.join(',')).forEach(el => {
                                if ((el.textContent && el.textContent.includes('题解')) ||
                                    (el.href && el.href.includes('/problem/solution/'))) {
                                    el.style.display = 'none';
                                    el.style.visibility = 'hidden';
                                    el.style.height = '0';
                                    el.style.overflow = 'hidden';
                                    el.style.pointerEvents = 'none';
                                }
                            });
                        } catch (e) {}
                    });
                });
            });
            if (document.body) observer.observe(document.body, { childList: true, subtree: true });
            else document.addEventListener('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }));
        }
    }

    function createPomodoroWidget() {
        if (!/^(https?:\/\/)?(www\.)?luogu\.com\.cn/i.test(window.location.href)) return;
        const workDuration = getWorkDuration();
        const restDuration = getRestDuration();
        const config = {
            workDuration: workDuration,
            restDuration: restDuration,
            color: getFocusColor(),
            position: getFocusPosition()
        };

        // --- 动态配色方案 ---
        const mainColor = config.color;
        const lightColor = adjustColor(mainColor, 85); // 浅色背景
        const darkColor = adjustColor(mainColor, -20); // 深色文字
        const textColor = getContrastYIQ(mainColor);   // 主按钮上的文字颜色
        const secondaryTextColor = getContrastYIQ(lightColor); // 次级按钮上的文字颜色

        const style = document.createElement('style');
        style.textContent = `
            #luogu-pomodoro-widget {
                position: fixed; z-index: 99999; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.15);
                overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
                user-select: none; width: ${DEFAULT_SIZE.width}px; height: ${DEFAULT_SIZE.height}px;
                background: white; border: 1px solid #e0e0e0; cursor: move; transition: border-color 0.3s ease, box-shadow 0.3s ease;
            }
            #luogu-pomodoro-widget:hover { box-shadow: 0 3px 15px rgba(0,0,0,0.2); }
            #luogu-pomodoro-time { font-size: 20px; font-weight: bold; text-align: center; color: #333; padding: 12px 0; height: 40px; display: flex; align-items: center; justify-content: center; }
            #luogu-pomodoro-progress { height: 4px; background: #f0f0f0; border-radius: 2px; margin: 4px 8px; overflow: hidden; }
            #luogu-pomodoro-progress-bar { height: 100%; width: 0%; background: ${mainColor}; border-radius: 2px; transition: width 0.5s ease; }
            #luogu-pomodoro-controls { display: flex; justify-content: center; gap: 6px; padding: 6px 0; background: #f8f9fa; border-top: 1px solid #eee; }
            .pomodoro-btn { width: 48%; height: 22px; border: none; border-radius: 3px; font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.2s; user-select: none; text-align: center; line-height: 22px; }
            .pomodoro-btn:active { transform: scale(0.95); }

            /* 主要按钮：主色背景 */
            .pomodoro-btn.primary { background: ${mainColor}; color: ${textColor}; }
            .pomodoro-btn.primary:hover { filter: brightness(0.9); }

            /* 次要按钮：浅色背景 */
            .pomodoro-btn.secondary { background: ${lightColor}; color: ${darkColor}; }
            .pomodoro-btn.secondary:hover { filter: brightness(0.95); }

            .pomodoro-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }

            #luogu-pomodoro-settings { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 6px; background: ${mainColor}; display: flex; align-items: center; justify-content: center; font-size: 14px; cursor: pointer; z-index: 10; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
            #luogu-pomodoro-settings:hover { transform: scale(1.1); box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            #luogu-pomodoro-settings svg { width: 14px; height: 14px; fill: white; }
            #luogu-pomodoro-widget.focus-running { border: 2px solid ${mainColor} !important; box-shadow: 0 4px 12px ${mainColor}40 !important; }
        `;
        document.head.appendChild(style);
        const widget = document.createElement('div');
        widget.id = 'luogu-pomodoro-widget';
        widget.style.left = `${config.position.x}px`;
        widget.style.top = `${config.position.y}px`;
        widget.innerHTML = `
            <div id="luogu-pomodoro-time">25:00</div>
            <div id="luogu-pomodoro-progress"><div id="luogu-pomodoro-progress-bar"></div></div>
            <div id="luogu-pomodoro-controls">
                <button class="pomodoro-btn primary" id="btn-start">开始</button>
                <button class="pomodoro-btn secondary" id="btn-stop">结束</button>
            </div>
            <div id="luogu-pomodoro-settings"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg></div>
        `;
        document.body.appendChild(widget);
        const settingsBtn = widget.querySelector('#luogu-pomodoro-settings');
        settingsBtn.onclick = (e) => { e.stopPropagation(); createSettingUI(); };
        let timer = null;
        let remainingTime = workDuration * 60;
        let currentMode = 'work';
        let isResuming = false;
        let autoStart = false;
        const savedMode = localStorage.getItem(STORAGE_KEY_CURRENT_MODE);
        if (savedMode === 'rest') { currentMode = 'rest'; remainingTime = restDuration * 60; }
        const timeDisplay = widget.querySelector('#luogu-pomodoro-time');
        const progressBar = widget.querySelector('#luogu-pomodoro-progress-bar');
        const startBtn = widget.querySelector('#btn-start');
        const stopBtn = widget.querySelector('#btn-stop');

        const savedState = localStorage.getItem(STORAGE_KEY_FOCUS_STATE);
        const savedRemaining = parseInt(localStorage.getItem(STORAGE_KEY_FOCUS_REMAINING) || '0');
        const endTime = parseInt(localStorage.getItem(STORAGE_KEY_FOCUS_END) || '0');
        const now = Date.now();

        if (savedState === 'paused' && savedRemaining > 0) { remainingTime = savedRemaining; isResuming = true; autoStart = false; }
        else if (savedState === 'running' && endTime > now) { remainingTime = Math.floor((endTime - now) / 1000); if (remainingTime > 0) { isResuming = true; autoStart = true; } }

        if (savedState === 'paused' && savedRemaining > 0) { startBtn.textContent = '继续'; startBtn.disabled = false; stopBtn.disabled = false; }
        else if (savedState === 'running' && endTime > now && remainingTime > 0) { startBtn.textContent = '暂停'; startBtn.disabled = false; stopBtn.disabled = false; }
        else { startBtn.textContent = '开始'; startBtn.disabled = false; stopBtn.disabled = (currentMode === 'work' && remainingTime === workDuration * 60); }

        function updateFocusBorderStyle() {
            if (timer && currentMode === 'work' && localStorage.getItem(STORAGE_KEY_FOCUS_STATE) !== 'paused') widget.classList.add('focus-running');
            else widget.classList.remove('focus-running');
        }
        function updateDisplay() {
            const mins = Math.floor(remainingTime / 60); const secs = remainingTime % 60;
            timeDisplay.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            const totalSeconds = (currentMode === 'work' ? workDuration : restDuration) * 60;
            progressBar.style.width = `${Math.max(0, Math.min(100, ((totalSeconds - remainingTime) / totalSeconds) * 100))}%`;
            updateFocusBorderStyle();
        }
        function toggleTimer() {
            if (timer) {
                clearInterval(timer); timer = null; pauseFocusMode(remainingTime); localStorage.setItem(STORAGE_KEY_CURRENT_MODE, currentMode);
                isResuming = true; startBtn.textContent = '继续'; startBtn.disabled = false; stopBtn.disabled = false; updateFocusBorderStyle();
            } else {
                if (isResuming) { localStorage.setItem(STORAGE_KEY_FOCUS_END, (Date.now() + remainingTime * 1000).toString()); localStorage.setItem(STORAGE_KEY_FOCUS_STATE, 'running'); localStorage.setItem(STORAGE_KEY_CURRENT_MODE, currentMode); localStorage.removeItem(STORAGE_KEY_FOCUS_REMAINING); isResuming = false; }
                else { remainingTime = (currentMode === 'work' ? workDuration : restDuration) * 60; startFocusMode(currentMode === 'work' ? workDuration : restDuration, currentMode === 'work'); localStorage.setItem(STORAGE_KEY_CURRENT_MODE, currentMode); }
                startBtn.textContent = '暂停'; startBtn.disabled = false; stopBtn.disabled = false; updateFocusBorderStyle();
                timer = setInterval(() => {
                    remainingTime--;
                    updateDisplay();
                    if (remainingTime <= 0) {
                        // --- 自动进入下一阶段逻辑 ---
                        // 切换模式
                        currentMode = (currentMode === 'work') ? 'rest' : 'work';
                        // 重置时间
                        const nextDuration = (currentMode === 'work') ? workDuration : restDuration;
                        remainingTime = nextDuration * 60;

                        // 更新本地存储，保证跨页刷新时状态正确
                        const newEndTime = Date.now() + remainingTime * 1000;
                        localStorage.setItem(STORAGE_KEY_FOCUS_END, newEndTime.toString());
                        localStorage.setItem(STORAGE_KEY_CURRENT_MODE, currentMode);

                        // UI 更新
                        updateDisplay();
                    }
                }, 1000);
            }
        }
        function stopTimer() {
            clearInterval(timer); timer = null; remainingTime = workDuration * 60; currentMode = 'work'; isResuming = false; updateDisplay(); endFocusMode(); startBtn.textContent = '开始'; startBtn.disabled = false; stopBtn.disabled = true;
        }
        startBtn.onclick = toggleTimer; stopBtn.onclick = stopTimer;
        let isDragging = false; let offsetX, offsetY;
        widget.onmousedown = (e) => { if (e.target.id === 'luogu-pomodoro-settings') return; isDragging = true; const rect = widget.getBoundingClientRect(); offsetX = e.clientX - rect.left; offsetY = e.clientY - rect.top; widget.style.cursor = 'move'; e.preventDefault(); };
        document.onmousemove = (e) => { if (!isDragging) return; widget.style.left = `${Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - widget.offsetWidth))}px`; widget.style.top = `${Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - widget.offsetHeight))}px`; };
        document.onmouseup = () => { if (isDragging) { isDragging = false; widget.style.cursor = 'default'; const rect = widget.getBoundingClientRect(); saveFocusPosition({ x: Math.round(rect.left), y: Math.round(rect.top) }); } };
        updateDisplay(); if (autoStart) setTimeout(() => toggleTimer(), 300);
    }

    function createSettingUI() {
        if (!/^(https?:\/\/)?(www\.)?luogu\.com\.cn/i.test(window.location.href)) return;
        ['luogu-modal-mask','luogu-modal-box'].forEach(id => { const el = document.getElementById(id); if(el) el.remove(); });

        const themeColor = getFocusColor();
        const geoOp = getAdaptiveOpacity(themeColor);

        const style = document.createElement('style');
        style.textContent = `
            #luogu-modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 99997; display: none; backdrop-filter: blur(2px); }
            #luogu-modal-box { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 400px; max-width: 92vw; padding: 20px;
                background: rgba(255, 255, 255, 0.65);
                backdrop-filter: blur(15px);
                -webkit-backdrop-filter: blur(15px);
                border: 1px solid rgba(255, 255, 255, 0.6);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
                border-radius: 16px; z-index: 99998; display: none;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                transition: all 0.3s;
                overflow: hidden;
            }
            #luogu-modal-box *, #luogu-modal-box *::before, #luogu-modal-box *::after { box-sizing: border-box; }
            .modal-inner { position: relative; z-index: 2; }
            .bg-geo { position: absolute; pointer-events: none; z-index: 1; filter: blur(1px); transition: opacity 0.4s; }
            #luogu-modal-box h3 { margin: 0 0 16px; color: #111; text-align: center; font-size: 22px; font-weight: 700; border-bottom: 1px solid rgba(0,0,0,0.1); padding-bottom: 12px; }
            .luogu-form-group { margin-bottom: 12px; }
            .luogu-form-group label { display: block; margin-bottom: 6px; font-weight: 600; color: #333; font-size: 15px; }
            #luogu-pid-input { width: 100%; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; font-size: 14px; transition: border-color 0.2s; background: rgba(255,255,255,0.5); }
            #luogu-pid-input:focus { border-color: ${themeColor}; outline: none; box-shadow: 0 0 0 2px ${themeColor}44; background: rgba(255,255,255,0.8); }
            .switch-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: rgba(248, 250, 252, 0.5); border-radius: 8px; border: 1px solid rgba(241, 245, 249, 0.6); }
            .switch-text { font-size: 14px; color: #374151; }
            .switch-toggle { position: relative; width: 44px; height: 24px; }
            .switch-toggle input { opacity: 0; width: 0; height: 0; }
            .switch-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .2s; border-radius: 24px; }
            .switch-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .2s; border-radius: 50%; }
            input:checked + .switch-slider { background: linear-gradient(135deg, ${themeColor}, ${themeColor}cc); }
            input:checked + .switch-slider:before { transform: translateX(20px); }
            .duration-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .duration-input-wrap label { font-size: 13px; color: #64748b; margin-bottom: 4px; font-weight: 400; }
            .duration-input { width: 100%; padding: 8px 10px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; font-size: 14px; background: rgba(255,255,255,0.5); }
            .duration-input:focus { outline: none; border-color: ${themeColor}; background: rgba(255,255,255,0.8); }
            .pid-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; min-height: 32px; }
            .pid-item { background: linear-gradient(135deg, rgba(238, 242, 255, 0.8), ${themeColor}20); border: 1px solid ${themeColor}40; color: ${themeColor}; padding: 5px 10px; border-radius: 14px; font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer; transition: all 0.2s; }
            .pid-item:hover { background: linear-gradient(135deg, #e0e7ff, ${themeColor}25); transform: translateY(-1px); }
            .pid-item .remove { color: #ef4444; font-weight: bold; cursor: pointer; line-height: 1; }
            #luogu-color-input { width: 100%; height: 32px; padding: 2px; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; cursor: pointer; background: rgba(255,255,255,0.5); }
            .luogu-hint { font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.4; }
            #luogu-modal-btn-group { display: grid; grid-template-columns: 1fr 1.2fr; gap: 10px; margin-top: 16px; }
            #luogu-save-btn, #luogu-cancel-btn { padding: 10px; border: none; border-radius: 8px; cursor: pointer; font-size: 15px; font-weight: 600; transition: all 0.2s; }
            #luogu-save-btn { background: linear-gradient(135deg, ${themeColor}, ${themeColor}bb); color: white; box-shadow: 0 2px 8px ${themeColor}44; }
            #luogu-save-btn:hover { background: linear-gradient(135deg, ${themeColor}dd, ${themeColor}aa); transform: translateY(-1px); box-shadow: 0 4px 12px ${themeColor}66; }
            #luogu-cancel-btn { background: rgba(241, 245, 249, 0.6); color: #4b5563; }
            #luogu-cancel-btn:hover { background: rgba(226, 232, 240, 0.8); }
        `;
        document.head.appendChild(style);
        const mask = document.createElement('div'); mask.id = 'luogu-modal-mask';
        mask.onclick = () => { mask.style.display = 'none'; modalBox.style.display = 'none'; };
        document.body.appendChild(mask);
        const modalBox = document.createElement('div'); modalBox.id = 'luogu-modal-box';
        modalBox.innerHTML = `
            <div class="bg-geo" style="top:-30px; right:-30px; width:130px; height:130px; border-radius:50%; background:${themeColor}; opacity:${geoOp};"></div>
            <div class="bg-geo" style="bottom:-20px; left:-25px; width:100px; height:100px; transform:rotate(45deg); border-radius:16px; background:${themeColor}; opacity:${(geoOp * 0.75).toFixed(2)};"></div>
            <div class="bg-geo" style="top:40%; right:25px; width:0; height:0; border-left:30px solid transparent; border-right:30px solid transparent; border-bottom:50px solid ${themeColor}; opacity:${(geoOp * 0.85).toFixed(2)}; transform:rotate(-15deg);"></div>
            <div class="bg-geo" style="top:15%; left:-20px; width:60px; height:60px; border-radius:50%; border: 6px solid ${themeColor}; opacity:${(geoOp * 0.6).toFixed(2)};"></div>
            <div class="modal-inner">
                <h3>专注设置</h3>
                <div class="luogu-form-group">
                    <label>题目计划</label>
                    <input type="text" id="luogu-pid-input" placeholder="输入题号（如：P1000、CF1628D、AT_abc001_a）">
                    <div class="pid-list" id="pid-list"></div>
                    <div class="luogu-hint">最多 6 题，回车添加。支持 Luogu/CF/AtCoder/UVA 等。</div>
                </div>
                <div class="luogu-form-group">
                    <label>题解访问</label>
                    <div class="switch-row">
                        <span class="switch-text">允许查看题解</span>
                        <label class="switch-toggle">
                            <input type="checkbox" id="luogu-solution-checkbox">
                            <span class="switch-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="luogu-form-group">
                    <label>番茄钟时长（分钟）</label>
                    <div class="duration-grid">
                        <div class="duration-input-wrap">
                            <label>工作</label>
                            <input type="number" id="luogu-work-input" class="duration-input" min="1" max="120">
                        </div>
                        <div class="duration-input-wrap">
                            <label>休息</label>
                            <input type="number" id="luogu-rest-input" class="duration-input" min="1" max="60">
                        </div>
                    </div>
                </div>
                <div class="luogu-form-group">
                    <label>主题颜色</label>
                    <input type="color" id="luogu-color-input">
                </div>
                <div id="luogu-modal-btn-group">
                    <button id="luogu-cancel-btn">取消</button>
                    <button id="luogu-save-btn">保存配置</button>
                </div>
            </div>
        `;
        document.body.appendChild(modalBox);

        function renderPidList() {
            const list = document.getElementById('pid-list'); list.innerHTML = '';
            const pids = getSavePids();
            if (!pids.length) { list.innerHTML = '<div style="text-align:center;color:#cbd5e1;width:100%;padding:4px;font-size:13px">暂无题目</div>'; return; }
            pids.forEach((pid, idx) => {
                const item = document.createElement('div'); item.className = 'pid-item';
                item.innerHTML = `${pid}<span class="remove">×</span>`;
                item.onclick = (e) => { if (!e.target.classList.contains('remove')) window.location.href = `https://www.luogu.com.cn/problem/${pid}`; };
                item.querySelector('.remove').onclick = (e) => { e.stopPropagation(); removePid(pid); renderPidList(); };
                list.appendChild(item);
            });
        }

        function doSave() {
            const raw = document.getElementById('luogu-pid-input').value.trim();
            const pid = raw.startsWith('AT_') ? raw : raw.toUpperCase();
            const solChecked = document.getElementById('luogu-solution-checkbox').checked;
            const work = parseInt(document.getElementById('luogu-work-input').value) || DEFAULT_WORK_DURATION;
            const rest = parseInt(document.getElementById('luogu-rest-input').value) || DEFAULT_REST_DURATION;
            const color = document.getElementById('luogu-color-input').value;
            if (work < 1 || work > 120) { alert('工作时长 1-120'); return; }
            if (rest < 1 || rest > 60) { alert('休息时长 1-60'); return; }
            if (pid && !/^(P\d{3,6}|SP\d{3,5}|B\d{3,5}|CF\d+[A-Z0-9]*|AT_[a-z0-9_]+|UVA\d{3,5}|[A-Z]{2,6}\d+[A-Z0-9]*)$/i.test(pid)) {
                alert('题号格式错误'); return;
            }
            const pids = getSavePids();
            if (pid && pids.length < MAX_PIDS && !pids.includes(pid)) { pids.push(pid); savePids(pids); }
            saveSolutionStatus(solChecked); saveDurations(work, rest); saveFocusColor(color);
            document.getElementById('luogu-pid-input').value = ''; renderPidList(); monitorSolutionElements();
            mask.style.display = 'none'; modalBox.style.display = 'none';
        }

        document.getElementById('luogu-save-btn').onclick = doSave;
        document.getElementById('luogu-cancel-btn').onclick = () => { mask.style.display = 'none'; modalBox.style.display = 'none'; };
        document.getElementById('luogu-pid-input').onkeypress = (e) => { if (e.key === 'Enter') doSave(); };

        mask.style.display = 'block'; modalBox.style.display = 'block';
        document.getElementById('luogu-solution-checkbox').checked = getSolutionStatus();
        document.getElementById('luogu-work-input').value = getWorkDuration();
        document.getElementById('luogu-rest-input').value = getRestDuration();
        document.getElementById('luogu-color-input').value = getFocusColor();
        renderPidList();
    }

    function initRouterGuard() {
        let lastPath = window.location.pathname + window.location.hash;
        const _push = history.pushState; const _replace = history.replaceState;
        history.pushState = function(){ _push.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        history.replaceState = function(){ _replace.apply(this, arguments); window.dispatchEvent(new Event('locationchange')); };
        window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
        window.addEventListener('locationchange', () => { if (blockSolutionAccess()) return; if (isFocusActive() && !shouldAllow()) window.location.replace(getRedirectUrl()); });
        setInterval(() => {
            const cur = window.location.pathname + window.location.hash;
            if (cur !== lastPath) { lastPath = cur; if (blockSolutionAccess()) return; if (isFocusActive() && !shouldAllow()) window.location.replace(getRedirectUrl()); }
        }, 800);
    }

    enforceAccessRules();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', createPomodoroWidget);
    else createPomodoroWidget();
    window.addEventListener('load', () => { monitorSolutionElements(); initRouterGuard(); });
})();
