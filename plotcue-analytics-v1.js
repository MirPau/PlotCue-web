/* PlotCue opt-in web analytics. */
(()=>{
"use strict";
// Web-only optional measurement. Never import account, catalog or auth data here.
const GA4_ID = 'G-XYXQED9Y0E';
const ANALYTICS_CHOICE_KEY = 'plotcue.webAnalytics.v1';
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
            Number.isFinite(record.at) && record.at >= 0 && record.at <= now ? record.choice : null;
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
            return memoryChoice?.choice ?? null;
        try {
            return parseAnalyticsChoice(win.localStorage.getItem(ANALYTICS_CHOICE_KEY), now());
        }
        catch {
            return memoryChoice?.choice ?? null;
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
  let scheduled = false;
  const rowId = 'plotcue-analytics-settings-row';
  function palette() {
    try {
      if (localStorage.getItem('plotcue.appearance.v1') === 'dark') return ['#181818', '#f1f1f1', '#bababa', '#909090', '#b1b1b1', '#0e0e0e'];
    } catch { /* Use the existing default appearance. */ }
    return ['#2B0D16', '#F4F1EA', '#C0B6B8', '#B08A3E', '#D0A85A', '#06101C'];
  }
  function styleText() {
    const [surface, text, muted, outline, accent, background] = palette();
    return `:host{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:${text}}dialog{box-sizing:border-box;background:${background};color:${text};border:0;border-radius:22px;padding:24px;width:calc(100% - 32px);max-width:560px;max-height:90dvh;overflow:auto}dialog::backdrop{background:rgba(0,0,0,.72)}h2{margin:12px 0 10px;font-size:27px;line-height:1.2;font-weight:900}p{font-size:14px;line-height:1.6;margin:14px 0}.intro,.detail{color:${muted}}.intro{margin:0 0 20px}.panel{background:${surface};border:1px solid ${outline};border-radius:22px;padding:20px}.state{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:16px;border-bottom:1px solid ${outline};font-size:16px;font-weight:800}.state strong{color:${accent};font-size:18px}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.action,.preferences{box-sizing:border-box;min-height:52px;padding:12px 14px;border:1px solid ${outline};border-radius:14px;color:${accent};background:${surface};font:900 13px Inter,system-ui,sans-serif;text-align:center;cursor:pointer}.actions .action{flex:1 1 170px}.back{display:inline-flex;align-items:center;min-height:48px;padding:0;border:0;background:transparent;color:${accent};font:800 14px Inter,system-ui,sans-serif;cursor:pointer}.policy{display:inline-block;padding-top:18px;color:${accent};font-size:13px;text-decoration:underline}.footer{margin:18px 0 0;color:${muted};font-size:12px;line-height:1.6}.preferences{display:block;width:100%;margin-top:14px}button:focus-visible,a:focus-visible{outline:2px solid ${accent};outline-offset:3px}@media(max-width:400px){dialog{padding:20px 16px}.panel{padding:18px}}`;
  }
  function closeDialog() {
    if (!activeDialog) return;
    const host = activeDialog.getRootNode().host;
    activeDialog.close(); host.remove(); activeDialog = null;
    if (returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
  }
  function choose(value) { client.setChoice(value); updateRowState(); closeDialog(); }
  function showPreferences() {
    if (activeDialog || !analyticsPath(location.pathname)) return;
    returnFocus = document.activeElement;
    const host = document.createElement('div'); host.id = 'plotcue-analytics-dialog';
    const root = host.attachShadow({mode:'open'});
    const firstChoice = client.choice() === null;
    const enabled = client.choice() === 'accepted';
    const explanation = enabled
      ? 'Analytics is enabled. This browser can send website usage events to Google Analytics to help improve PlotCue.'
      : 'Analytics is disabled. Website usage events are not sent to Google Analytics from this browser.';
    root.innerHTML = `<style>${styleText()}</style><dialog aria-labelledby="analytics-heading" aria-describedby="analytics-summary">${firstChoice ? '' : '<button type="button" class="back">‹ Back</button>'}<h2 id="analytics-heading">Analytics preferences</h2><p id="analytics-summary" class="intro">Your choice applies only to this browser. PlotCue works fully if you decline.</p><div class="panel"><div class="state"><span>Website analytics</span><strong>${enabled ? 'On' : 'Off'}</strong></div><p>${explanation}</p><p class="detail">${enabled ? '' : 'If enabled, '}Google processes a browser identifier, device/browser information, approximate location, page use and clicks to the app stores.</p><p class="detail">We do not send your PlotCue account ID, name, email, password, watched titles or search text. Advertising features are disabled.</p><div class="actions"><button type="button" class="action" data-choice="declined">DECLINE</button><button type="button" class="action" data-choice="accepted">ACCEPT ANALYTICS</button></div><a class="policy" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></div><p class="footer">You can change your choice here at any time. Your choice is saved in this browser until you change it in Settings or clear browser data. If storage is blocked, it lasts only for this page session. Declining removes analytics cookies and stops future analytics; it does not erase data already processed by Google. Privacy requests: contact@plotcue.app.</p></dialog>`;
    document.body.appendChild(host);
    activeDialog = root.querySelector('dialog');
    activeDialog.addEventListener('cancel', event => { event.preventDefault(); if (!firstChoice) closeDialog(); });
    root.querySelector('.back')?.addEventListener('click', closeDialog);
    root.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => choose(button.dataset.choice)));
    activeDialog.showModal();
  }
  function updateRowState() {
    const row = document.getElementById(rowId);
    if (!row) return;
    const value = client.choice() === 'accepted' ? 'On' : 'Off';
    const label = row.querySelector('[data-analytics-state]');
    if (label && label.textContent !== value) label.textContent = value;
    const name = `Analytics preferences, ${value}`;
    if (row.getAttribute('aria-label') !== name) row.setAttribute('aria-label', name);
  }
  function addSettingsRow() {
    const path = analyticsPath(location.pathname);
    if (path !== '/settings' && path !== '/privacy') return;
    const old = document.getElementById('plotcue-analytics-preferences');
    // Never put controls inside a Privacy Policy navigation row.
    if (old && !old.closest('#optional-web-analytics')) old.remove();
    const labels = [...document.querySelectorAll('div,span')].filter(node => node.childElementCount === 0 && node.textContent.trim() === 'Privacy Policy');
    const label = labels.find(node => {
      const row = node.closest('[tabindex="0"],button,[role="button"]');
      return row && row.parentElement?.textContent.includes('Terms of Service');
    });
    if (!label) return;
    const base = label.closest('[tabindex="0"],button,[role="button"]');
    const existing = document.getElementById(rowId);
    const divider = base.nextElementSibling;
    if (!divider || divider.textContent.trim()) return;
    if (existing?.parentElement === base.parentElement) {
      if (existing.className !== base.className) existing.className = base.className;
      const currentTitle = existing.firstElementChild;
      const currentTail = existing.lastElementChild;
      if (currentTitle.className !== label.className) currentTitle.className = label.className;
      if (currentTail.className !== base.lastElementChild.className) currentTail.className = base.lastElementChild.className;
      const separator = document.getElementById(rowId + '-divider');
      if (separator && separator.className !== divider.className) separator.className = divider.className;
      updateRowState(); return;
    }
    existing?.remove(); document.getElementById(rowId + '-divider')?.remove();
    const arrow = base.lastElementChild;
    if (arrow === label || arrow.textContent.trim() !== '›') return;
    const row = base.cloneNode(false);
    row.id = rowId; row.setAttribute('role','button'); row.setAttribute('tabindex','0');
    const title = label.cloneNode(true); title.textContent = 'Analytics preferences';
    const tail = arrow.cloneNode(false);
    Object.assign(tail.style,{display:'flex',alignItems:'center',gap:'10px'});
    const state = document.createElement('span'); state.dataset.analyticsState='';
    Object.assign(state.style,{fontSize:'14px',fontWeight:'800'});
    const chevron = document.createElement('span'); chevron.textContent='›'; chevron.setAttribute('aria-hidden','true');
    tail.append(state,chevron); row.append(title,tail);
    row.addEventListener('click', event => { event.stopPropagation(); showPreferences(); });
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); showPreferences(); } });
    const separator = divider.cloneNode(false); separator.id=rowId+'-divider'; separator.setAttribute('aria-hidden','true');
    base.after(separator,row);
    updateRowState();
  }
  function addStaticPreferences() {
    const section = document.getElementById('optional-web-analytics');
    if (!section || section.querySelector('#plotcue-analytics-preferences')) return;
    const host = document.createElement('div'); host.id='plotcue-analytics-preferences';
    const root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>${styleText()}</style><button type="button" class="preferences">ANALYTICS PREFERENCES</button>`;
    root.querySelector('button').addEventListener('click',showPreferences);
    section.appendChild(host);
  }
  function reconcile() { addSettingsRow(); addStaticPreferences(); }
  function scheduleReconcile() {
    if (scheduled) return;
    const path=analyticsPath(location.pathname);
    if (path !== '/settings' && path !== '/privacy') return;
    scheduled=true;
    requestAnimationFrame(() => { scheduled=false; reconcile(); });
  }
  function locationChanged() {
    const next = location.pathname + location.search;
    if (next === lastLocation) return;
    lastLocation = next;
    client.page();
    if (!analyticsPath(location.pathname)) { closeDialog(); return; }
    reconcile(); scheduleReconcile();
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
    if (event.key === 'plotcue.appearance.v1') { scheduleReconcile(); return; }
    if (event.key !== ANALYTICS_CHOICE_KEY && event.key !== null) return;
    client.page(); closeDialog(); updateRowState();
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
  new MutationObserver(scheduleReconcile).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  locationChanged();
})();

})();
