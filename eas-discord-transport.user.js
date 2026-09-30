// ==UserScript==
// @name         EAS Incoming Discord transport
// @namespace    eas.tw.hub
// @version      0.1.1
// @description  Optional isolated Discord transport for the EAS Incoming Monitor.
// @match        https://*.tribalwars.com.br/game.php*
// @noframes
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// @connect      discordapp.com
// ==/UserScript==
(() => {
    'use strict';
    if (unsafeWindow.EASDiscordBridge) return;
    const key = 'incoming-webhook:' + location.hostname;
    const valid = value => typeof value === 'string' && !/\s/.test(value)
        && /^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(value);
    GM_registerMenuCommand('EAS: configurar Discord deste mundo', () => {
        const value = prompt('Webhook Discord (deixe vazio para desativar). O segredo será armazenado somente no Violentmonkey.');
        if (value === null) return;
        if (value && !valid(value.trim())) { alert('URL de webhook Discord inválida.'); return; }
        GM_setValue(key, value.trim());
    });
    let busy = false, nextAt = 0;
    unsafeWindow.EASDiscordBridge = Object.freeze({
        configured: () => valid(String(GM_getValue(key, ''))),
        send: ({ messageId, payload } = {}) => new Promise((resolve, reject) => {
            const webhook = String(GM_getValue(key, ''));
            if (!valid(webhook) || busy || Date.now() < nextAt || (messageId && !/^\d+$/.test(String(messageId))) || typeof payload?.content !== 'string' || payload.content.length > 2000) { reject(Error('DISCORD_TRANSPORT_NOT_READY')); return; }
            busy = true; nextAt = Date.now() + 1000;
            const finish = () => { busy = false; };
            const fail = () => { finish(); reject(Error('DISCORD_RESULT_UNCERTAIN')); };
            try {
                GM_xmlhttpRequest({ method: messageId ? 'PATCH' : 'POST',
                    url: webhook + (messageId ? '/messages/' + messageId : '?wait=true'),
                    anonymous: true, timeout: 10000,
                    headers: { 'Content-Type': 'application/json' },
                    data: JSON.stringify({ content: payload.content, allowed_mentions: { parse: [] } }),
                    onload: response => {
                        finish();
                        if (response.status === 429) { nextAt = Date.now() + 60000; reject(Error('DISCORD_RATE_LIMITED')); return; }
                        if (response.status < 200 || response.status >= 300) { reject(Error('DISCORD_HTTP_FAILURE')); return; }
                        try {
                            const result = JSON.parse(response.responseText);
                            if (!/^\d+$/.test(String(result.id))) throw Error();
                            resolve({ id: String(result.id) });
                        } catch { reject(Error('DISCORD_MESSAGE_ID_MISSING')); }
                    }, onerror: fail, ontimeout: fail, onabort: fail });
            } catch { fail(); }
        })
    });
})();
