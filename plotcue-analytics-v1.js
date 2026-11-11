/* PlotCue opt-in web analytics. No native/app functionality changes. */
(() => {
"use strict";
// Web-only optional measurement. Never import account, catalog or auth data here.
const GA4_ID = 'G-XYXQED9Y0E';
const ANALYTICS_CHOICE_KEY = 'plotcue.webAnalytics.v1';
const CHOICE_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const pages = new Set(['/', '/landing', '/login', '/register', '/shows', '/movies', '/show', '/movie', '/upcoming', '/calendar', '/settings', '/about', '/contact', '/privacy', '/terms', '/data-rights', '/history', '/contributions', '/rate']);
const sources = new Set(['facebook', 'instagram', 'tiktok', 'google', 'newsletter']);
const mediums = new Set(['social', 'organic', 'email', 'referral', 'cpc']);
const campaigns = new Set(['launch', 'first_patch', 'profile', 'organic']);
function analyticsPath(path) {
    const clean = path.replace(/\/(?:\(tabs\)|\(auth\))(?=\/|$)/g, '').replace(/\.html$/, '') || '/';
    return pages.has(clean) ? clean : null;
}
function analyticsLocation(href) {
    const url = new URL(href);
    const path = analyticsPath(url.pathname);
    if (!path || url.protocol !== 'https:' || !['plotcue.app', 'www.plotcue.app'].includes(url.hostname))
        return null;
    const safe = new URL(path, 'https://plotcue.app');
    for (const [key, allowed] of [['utm_source', sources], ['utm_medium', mediums], ['utm_campaign', campaigns]]) {
        const value = url.searchParams.get(key)?.toLowerCase();
        if (value && allowed.has(value))
            safe.searchParams.set(key, value);
    }
    return safe.href;
}
function parseAnalyticsChoice(raw, now) {
    try {
        const record = JSON.parse(raw || 'null');
        return record?.version === 1 && ['accepted', 'declined'].includes(record.choice) &&
            Number.isFinite(record.at) && record.at <= now && now - record.at < CHOICE_LIFETIME_MS ? record.choice : null;
    }
    catch {
        return null;
    }
}
function storeFromLink(href) {
    try {
        const url = new URL(href);
        if (url.protocol !== 'https:')
            return null;
        if (url.hostname === 'apps.apple.com' && /\/id6811805021(?:\/|$)/.test(url.pathname))
            return 'apple';
        if (url.hostname === 'play.google.com' && url.pathname === '/store/apps/details' && url.searchParams.get('id') === 'com.mirpau.plotcue')
            return 'google';
    }
    catch { /* Ignore non-HTTP app intents and malformed links. */ }
    return null;
}
function createWebAnalytics(win, measurementId = GA4_ID, now = () => Date.now()) {
    const browser = win;
    const flags = win;
    let memoryChoice = null;
    let volatileChoice = false;
    let initialized = false;
    let lastPage = '';
    function choice() {
        if (volatileChoice)
            return memoryChoice && now() - memoryChoice.at < CHOICE_LIFETIME_MS ? memoryChoice.choice : null;
        try {
            return parseAnalyticsChoice(win.localStorage.getItem(ANALYTICS_CHOICE_KEY), now());
        }
        catch {
            return memoryChoice && now() - memoryChoice.at < CHOICE_LIFETIME_MS ? memoryChoice.choice : null;
        }
    }
    function supported() { return /^G-[A-Z0-9]+$/.test(measurementId) && ['plotcue.app', 'www.plotcue.app'].includes(win.location.hostname) && win.location.protocol === 'https:'; }
    function currentLocation() { return analyticsLocation(win.location.href); }
    function enabled() { return supported() && choice() === 'accepted' && Boolean(currentLocation()); }
    function clearCookies() {
        for (const item of win.document.cookie.split(';')) {
            const name = item.split('=')[0].trim();
            if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name))
                continue;
            for (const domain of ['', ';domain=plotcue.app', ';domain=.plotcue.app', ';domain=www.plotcue.app']) {
                win.document.cookie = `${name}=;max-age=0;path=/${domain};SameSite=Lax;Secure`;
            }
        }
    }
    function disable() {
        flags[`ga-disable-${measurementId}`] = true;
        lastPage = '';
        // Do not send denied-consent pings. The disable flag blocks Google's collection.
        clearCookies();
    }
    function safeReferrer() {
        try {
            return new URL(win.document.referrer).origin + '/';
        }
        catch {
            return '';
        }
    }
    function initialize() {
        if (!enabled())
            return false;
        flags[`ga-disable-${measurementId}`] = false;
        const consent = { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
        if (!initialized) {
            browser.dataLayer = browser.dataLayer || [];
            browser.gtag = function () { browser.dataLayer.push(arguments); };
            browser.gtag('consent', 'default', consent);
            browser.gtag('js', new Date(now()));
            const script = win.document.createElement('script');
            script.id = 'plotcue-ga4';
            script.async = true;
            script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
            win.document.head.appendChild(script);
            initialized = true;
        }
        else
            browser.gtag('consent', 'update', consent);
        browser.gtag('config', measurementId, { send_page_view: false, page_location: currentLocation(), page_referrer: safeReferrer(), page_title: 'PlotCue', allow_google_signals: false, allow_ad_personalization_signals: false, cookie_domain: 'plotcue.app', cookie_expires: 15552000 });
        return true;
    }
    function page() {
        if (!enabled()) {
            disable();
            return;
        }
        const location = currentLocation();
        // Query/id changes within one screen are not additional page views.
        const path = analyticsPath(win.location.pathname);
        if (lastPage === path)
            return;
        if (!initialize())
            return;
        lastPage = path;
        browser.gtag('event', 'page_view', { page_location: location, page_referrer: safeReferrer(), page_title: `PlotCue ${path === '/' ? 'Home' : path.slice(1)}` });
    }
    function setChoice(next) {
        memoryChoice = { choice: next, at: now() };
        try {
            win.localStorage.setItem(ANALYTICS_CHOICE_KEY, JSON.stringify({ version: 1, ...memoryChoice }));
            volatileChoice = false;
        }
        catch {
            volatileChoice = true; /* Session-only preference if storage is blocked. */
        }
        if (next === 'accepted') {
            lastPage = '';
            page();
        }
        else
            disable();
    }
    function storeClick(href) {
        const store = storeFromLink(href);
        if (!store || !enabled())
            return;
        if (!initialized && !initialize())
            return;
        browser.gtag('event', 'store_open', { store, page_location: currentLocation(), page_title: 'PlotCue', page_referrer: safeReferrer() });
    }
    return { supported, choice, page, setChoice, storeClick, disable };
}

// Analytics-only adapter for the already-published static site. No app bundle rebuild.
(() => {
  const client = createWebAnalytics(window);
  const preview = ['localhost', '127.0.0.1'].includes(location.hostname) && document.currentScript?.dataset.analyticsPreview === 'true';
  if (!client.supported() && !preview) return;
  let activeDialog = null;
  let returnFocus = null;
  let lastLocation = '';
  const isPrivacy = () => analyticsPath(location.pathname) === '/privacy';
  function palette() {
    try {
      if (localStorage.getItem('plotcue.appearance.v1') === 'dark') return ['#181818', '#f1f1f1', '#bababa', '#909090', '#b1b1b1'];
    } catch { /* Use the existing default appearance. */ }
    return ['#2B0D16', '#F4F1EA', '#C0B6B8', '#B08A3E', '#D0A85A'];
  }
  function styleText() {
    const [surface, text, muted, outline, accent] = palette();
    return `:host{font-family:Arial,sans-serif;color:${text}}dialog{box-sizing:border-box;background:${surface};color:${text};border:1px solid ${outline};border-radius:22px;padding:22px;width:calc(100% - 32px);max-width:560px;max-height:88dvh;overflow:auto}dialog::backdrop{background:rgba(0,0,0,.72)}h2{margin:0 0 12px;font-size:22px;font-weight:900}p{color:${muted};font-size:14px;line-height:1.5;margin:0 0 12px}button,a{box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:48px;padding:10px 14px;border:1px solid ${outline};border-radius:14px;color:${accent};background:${surface};font:700 14px Arial,sans-serif;text-align:center;text-decoration:none;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid ${accent};outline-offset:3px}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.actions button{flex:1 1 180px}.preferences{margin:12px 0}.preferences button{width:100%}`;
  }
  function closeDialog() {
    if (!activeDialog) return;
    const host = activeDialog.getRootNode().host;
    activeDialog.close(); host.remove(); activeDialog = null;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
  }
  function choose(value) { client.setChoice(value); closeDialog(); }
  function showPreferences() {
    if (activeDialog || !analyticsPath(location.pathname)) return;
    returnFocus = document.activeElement;
    const host = document.createElement('div');
    host.id = 'plotcue-analytics-dialog';
    const root = host.attachShadow({mode:'open'});
    const current = client.choice();
    root.innerHTML = `<style>${styleText()}</style><dialog aria-labelledby="analytics-heading" aria-describedby="analytics-summary"><h2 id="analytics-heading">Optional website analytics</h2><p id="analytics-summary">Allow Google Analytics cookies to help us understand visits, page use and clicks to the app stores? PlotCue works fully if you decline.</p><p>If you accept, Google processes a browser identifier, device/browser information, approximate location and usage events. We do not send your PlotCue account ID, name, email, password, watched titles or search text. Advertising features are disabled.</p><p>Your choice is saved on this browser for up to 180 days. You can change it at any time in Privacy Policy → Analytics preferences. Declining stops future analytics and removes PlotCue's analytics cookies; it does not erase data already processed by Google. For privacy requests, contact contact@plotcue.app.</p>${current ? `<p>Current choice: ${current === 'accepted' ? 'allowed' : 'declined'}.</p>` : ''}<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">GOOGLE PRIVACY POLICY</a><div class="actions"><button type="button" data-choice="declined">DECLINE</button><button type="button" data-choice="accepted">ACCEPT ANALYTICS</button></div></dialog>`;
    document.body.appendChild(host);
    activeDialog = root.querySelector('dialog');
    activeDialog.addEventListener('cancel', event => { event.preventDefault(); choose('declined'); });
    root.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice)));
    activeDialog.showModal();
  }
  function addPreferences() {
    if (!isPrivacy() || document.getElementById('plotcue-analytics-preferences')) return;
    const staticSection = document.getElementById('optional-web-analytics');
    const title = staticSection || [...document.querySelectorAll('h1,h2,div')].find(node => node.childElementCount === 0 && node.textContent.trim() === 'Privacy Policy');
    if (!title) return;
    const host = document.createElement('div');
    host.id = 'plotcue-analytics-preferences';
    const root = host.attachShadow({mode:'open'});
    root.innerHTML = `<style>${styleText()}</style><div class="preferences"><button type="button">ANALYTICS PREFERENCES</button></div>`;
    root.querySelector('button').addEventListener('click', showPreferences);
    if (staticSection) staticSection.appendChild(host); else title.after(host);
  }
  function locationChanged() {
    const next = location.pathname + location.search;
    if (next === lastLocation) return;
    lastLocation = next;
    client.page();
    if (!analyticsPath(location.pathname)) { closeDialog(); return; }
    addPreferences();
    if (client.choice() === null || new URLSearchParams(location.search).get('analytics') === 'preferences') showPreferences();
  }
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) {
      const result = Reflect.apply(original, this, args);
      queueMicrotask(locationChanged);
      return result;
    };
  }
  window.addEventListener('popstate', locationChanged);
  window.addEventListener('storage', event => {
    if (event.key !== ANALYTICS_CHOICE_KEY && event.key !== null) return;
    client.page(); closeDialog();
    if (client.choice() === null) showPreferences();
  });
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    if (url.origin === location.origin && analyticsPath(url.pathname) === '/privacy' && url.searchParams.get('analytics') === 'preferences') {
      event.preventDefault(); showPreferences(); return;
    }
    client.storeClick(link.href);
  }, true);
  let pending = false;
  new MutationObserver(() => {
    if (!isPrivacy() || pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; addPreferences(); });
  }).observe(document.body, {childList:true, subtree:true});
  locationChanged();
})();

})();
