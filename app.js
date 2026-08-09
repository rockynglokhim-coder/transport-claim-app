(() => {
  "use strict";
  const config = window.TRANSPORT_CLAIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let idToken = "";
  let profile = null;

  const configured = Boolean(config.googleClientId && config.appsScriptUrl);
  $(configured ? "loginView" : "setupView").classList.remove("hidden");

  function waitForGoogle(attempt = 0) {
    if (!configured) return;
    if (window.google?.accounts?.id) return initGoogle();
    if (attempt < 80) setTimeout(() => waitForGoogle(attempt + 1), 100);
    else $("loginError").textContent = "Google 登入暫時未能載入，請重新整理。";
  }

  function initGoogle() {
    google.accounts.id.initialize({client_id: config.googleClientId, callback: onCredential, auto_select: true});
    google.accounts.id.renderButton($("googleButton"), {theme:"outline", size:"large", shape:"pill", text:"continue_with", width:280});
  }

  async function onCredential(response) {
    idToken = response.credential;
    $("loginError").textContent = "正在驗證身份…";
    try {
      const data = await api("session");
      profile = data.user;
      $("loginView").classList.add("hidden");
      $("appView").classList.remove("hidden");
      $("welcome").textContent = `你好，${profile.name}`;
      $("monthLabel").textContent = new Intl.DateTimeFormat("zh-HK", {year:"numeric",month:"long"}).format(new Date());
      await loadClaims();
    } catch (error) {
      idToken = "";
      $("loginError").textContent = error.message;
    }
  }

  async function api(action, payload = {}) {
    const body = new URLSearchParams({action, idToken, payload: JSON.stringify(payload)});
    const response = await fetch(config.appsScriptUrl, {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"}, body});
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "操作未完成，請稍後再試。");
    return data;
  }

  async function loadClaims() {
    const data = await api("listClaims");
    $("monthTotal").textContent = `HK$${Number(data.monthTotal || 0).toLocaleString("en-HK", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
    $("claimList").innerHTML = data.claims.length ? data.claims.map(renderClaim).join("") : '<p class="muted">今個月未有車費紀錄。</p>';
  }

  function renderClaim(c) {
    const safe = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
    return `<article class="claim"><div class="claim-icon">${c.transport === "MTR" ? "🚇" : "🚕"}</div><div class="claim-main"><strong>${safe(c.origin)} → ${safe(c.destination)}</strong><span>${safe(c.date)} · ${safe(c.transport)} · ${safe(c.direction)}</span></div><div class="claim-amount"><strong>HK$${Number(c.amount).toFixed(2)}</strong><span>${safe(c.status)}</span></div></article>`;
  }

  $("newClaimButton").addEventListener("click", () => { $("date").valueAsDate = new Date(); $("claimDialog").showModal(); });
  $("closeDialog").addEventListener("click", () => $("claimDialog").close());
  $("refreshButton").addEventListener("click", () => loadClaims().catch((e) => alert(e.message)));
  $("logoutButton").addEventListener("click", () => { google.accounts.id.disableAutoSelect(); location.reload(); });
  $("claimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("saveButton"); button.disabled = true; $("formError").textContent = "";
    try {
      const values = Object.fromEntries(new FormData(form));
      await api("createClaim", values);
      form.reset(); $("claimDialog").close(); await loadClaims();
    } catch (error) { $("formError").textContent = error.message; }
    finally { button.disabled = false; }
  });
  waitForGoogle();
})();
