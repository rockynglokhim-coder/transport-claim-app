(() => {
  "use strict";
  const config = window.TRANSPORT_CLAIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let idToken = "";
  let profile = null;

  const LOCATIONS = {
    "香港島": {
      "中西區": ["堅尼地城站","香港大學站","西營盤站","上環站","中環站","香港站"],
      "灣仔區": ["金鐘站","會展站","灣仔站","銅鑼灣站"],
      "東區": ["天后站","炮台山站","北角站","鰂魚涌站","太古站","西灣河站","筲箕灣站","杏花邨站","柴灣站"],
      "南區": ["海洋公園站","黃竹坑站","利東站","海怡半島站"]
    },
    "九龍": {
      "油尖旺區": ["尖沙咀站","尖東站","佐敦站","油麻地站","旺角站","旺角東站","太子站","柯士甸站","九龍站","奧運站"],
      "深水埗區": ["深水埗站","長沙灣站","荔枝角站","美孚站","南昌站","石硤尾站"],
      "九龍城區": ["九龍塘站","樂富站","啟德站","宋皇臺站","土瓜灣站","何文田站","紅磡站","黃埔站"],
      "黃大仙區": ["黃大仙站","鑽石山站","彩虹站"],
      "觀塘區": ["九龍灣站","牛頭角站","觀塘站","藍田站","油塘站"]
    },
    "新界": {
      "葵青區": ["荔景站","葵芳站","葵興站","青衣站"],
      "荃灣區": ["荃灣站","荃灣西站","大窩口站"],
      "沙田區": ["大圍站","沙田站","火炭站","馬場站","大學站","車公廟站","沙田圍站","第一城站","石門站","大水坑站","恒安站","馬鞍山站","烏溪沙站","顯徑站"],
      "大埔區": ["大埔墟站","太和站"],
      "北區": ["粉嶺站","上水站","羅湖站","落馬洲站"],
      "元朗區": ["元朗站","朗屏站","天水圍站","錦上路站"],
      "屯門區": ["屯門站","兆康站"],
      "西貢區": ["調景嶺站","將軍澳站","坑口站","寶琳站","康城站"],
      "離島區": ["東涌站","機場站","博覽館站","欣澳站","迪士尼站"]
    }
  };

  function setOptions(select, prompt, values) {
    select.innerHTML = `<option value="">${prompt}</option>` + values.map((value) => `<option>${value}</option>`).join("");
  }

  function setupLocationPicker(prefix) {
    const region = $(`${prefix}Region`);
    const district = $(`${prefix}District`);
    const station = $(`${prefix}Station`);
    const otherWrap = $(`${prefix}OtherWrap`);
    const other = $(`${prefix}Other`);
    const value = $(`${prefix}Value`);
    setOptions(region, "請選擇", Object.keys(LOCATIONS));

    const syncValue = () => {
      const place = station.value === "其他地點" ? other.value.trim() : station.value;
      value.value = region.value && district.value && place ? `${region.value}・${district.value}・${place}` : "";
    };
    region.addEventListener("change", () => {
      setOptions(district, "請選擇地區", region.value ? Object.keys(LOCATIONS[region.value]) : []);
      district.disabled = !region.value;
      setOptions(station, "先選地區", []);
      station.disabled = true;
      otherWrap.classList.add("hidden");
      other.required = false;
      other.value = "";
      syncValue();
    });
    district.addEventListener("change", () => {
      setOptions(station, "請選擇港鐵站／地點", district.value ? [...LOCATIONS[region.value][district.value], "其他地點"] : []);
      station.disabled = !district.value;
      otherWrap.classList.add("hidden");
      other.required = false;
      other.value = "";
      syncValue();
    });
    station.addEventListener("change", () => {
      const isOther = station.value === "其他地點";
      otherWrap.classList.toggle("hidden", !isOther);
      other.required = isOther;
      if (!isOther) other.value = "";
      syncValue();
    });
    other.addEventListener("input", syncValue);
  }

  setupLocationPicker("origin");
  setupLocationPicker("destination");

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
      if (!values.origin || !values.destination) throw new Error("請完成選擇起點及終點。");
      await api("createClaim", values);
      form.reset();
      ["originRegion", "destinationRegion"].forEach((id) => $(id).dispatchEvent(new Event("change")));
      $("claimDialog").close(); await loadClaims();
    } catch (error) { $("formError").textContent = error.message; }
    finally { button.disabled = false; }
  });
  waitForGoogle();
})();
