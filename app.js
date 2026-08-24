(() => {
  "use strict";
  const config = window.TRANSPORT_CLAIM_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let idToken = "";
  let sessionToken = localStorage.getItem("transportClaimSession") || "";
  let profile = null;
  let editingClaimId = "";
  let mtrFares = {};
  let currentClaims = [];

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
      "九龍城區": ["九龍塘站","樂富站","啟德站","宋皇臺站","土瓜灣站"],
      "黃埔區": ["黃埔站","紅磡站","何文田站"],
      "黃大仙區": ["黃大仙站","鑽石山站","彩虹站"],
      "觀塘區": ["九龍灣站","牛頭角站","觀塘站","藍田站","油塘站"]
    },
    "新界": {
      "葵青區": ["荔景站","葵芳站","葵興站","青衣站"],
      "荃灣區": ["荃灣站","荃灣西站","大窩口站"],
      "沙田區": ["大圍站","沙田站","火炭站","馬場站","大學站","車公廟站","沙田圍站","第一城站","石門站","大水坑站","恆安站","馬鞍山站","烏溪沙站","顯徑站"],
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
      updateAutoFare();
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

  function spokenPlace(value) {
    return String(value || "")
      .replace(/^[\s，,。]*(?:係|是)?\s*/, "")
      .replace(/[\s，,。！？!?]+$/g, "")
      .replace(/(?:港鐵站|地鐵站|港鐵|地鐵|站)$/g, "")
      .trim();
  }

  function findStation(value) {
    const wanted = spokenPlace(value);
    for (const [region, districts] of Object.entries(LOCATIONS)) {
      for (const [district, stations] of Object.entries(districts)) {
        const station = stations.find((name) => spokenPlace(name) === wanted);
        if (station) return {region, district, station};
      }
    }
    return null;
  }

  function applyStation(prefix, place) {
    const match = findStation(place);
    if (!match) return false;
    $(`${prefix}Region`).value = match.region;
    $(`${prefix}Region`).dispatchEvent(new Event("change"));
    $(`${prefix}District`).value = match.district;
    $(`${prefix}District`).dispatchEvent(new Event("change"));
    $(`${prefix}Station`).value = match.station;
    $(`${prefix}Station`).dispatchEvent(new Event("change"));
    return true;
  }

  function applyQuickTrip() {
    const text = $("quickTripInput").value.trim();
    const status = $("quickTripStatus");
    const naturalTrip = text.match(/^\s*由\s*(.+?)\s*去\s*(.+?)\s*[，,。]?\s*$/);
    const origin = naturalTrip?.[1] || text.match(/(?:出發點|起點)\s*[:：]?\s*(.+?)(?=\s*(?:目的地|到達點|終點)\s*[:：]?)/)?.[1];
    const destination = naturalTrip?.[2] || text.match(/(?:目的地|到達點|終點)\s*[:：]?\s*(.+)$/)?.[1];
    if (!origin || !destination) {
      status.textContent = "請講：由荔枝角去中環";
      return;
    }
    const originFound = applyStation("origin", origin);
    const destinationFound = applyStation("destination", destination);
    if (!originFound || !destinationFound) {
      const missing = [!originFound && spokenPlace(origin), !destinationFound && spokenPlace(destination)].filter(Boolean).join("、");
      status.textContent = `暫時搵唔到：${missing}`;
      return;
    }
    status.textContent = `已套用：${selectedStation("origin")} → ${selectedStation("destination")}`;
  }

  $("applyQuickTrip").addEventListener("click", applyQuickTrip);
  $("quickTripInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); applyQuickTrip(); }
  });

  function selectedStation(prefix) {
    const station = $(`${prefix}Station`).value;
    return station && station !== "其他地點" ? station.replace(/站$/, "") : "";
  }

  function updateAutoFare() {
    const amount = $("amount");
    const status = $("fareStatus");
    if ($("transport").value !== "MTR") {
      if (amount.dataset.autofilled === "true") amount.value = "";
      amount.readOnly = false;
      amount.dataset.autofilled = "false";
      status.textContent = "";
      return;
    }

    const origin = selectedStation("origin");
    const destination = selectedStation("destination");
    const connectedInterchanges = new Set(["中環|香港", "尖東|尖沙咀"]);
    const key = [origin, destination].sort().join("|");
    if (origin && destination && (origin === destination || connectedInterchanges.has(key))) {
      amount.value = "";
      amount.readOnly = true;
      amount.dataset.autofilled = "false";
      status.textContent = origin === destination
        ? "起點同終點唔可以係同一個港鐵站。"
        : "呢兩個係相連轉乘站，請選擇實際入閘同出閘車站。";
      return;
    }
    const oneWayFare = mtrFares[key];
    if (origin && destination && Number.isFinite(oneWayFare)) {
      const airportExpress = [origin, destination].some((station) => station === "機場" || station === "博覽館");
      const sameDayReturn = airportExpress && $("direction").value === "來回" && key !== "博覽館|機場";
      const multiplier = $("direction").value === "來回" && !sameDayReturn ? 2 : 1;
      const total = oneWayFare * multiplier;
      amount.value = total.toFixed(2);
      amount.readOnly = true;
      amount.dataset.autofilled = "true";
      const fareName = airportExpress ? "成人八達通機場快綫" : "成人八達通";
      const journeyName = sameDayReturn ? "同日來回優惠" : (multiplier === 2 ? "來回" : "單程");
      status.textContent = `${fareName}${journeyName}參考價：HK$${total.toFixed(2)}`;
      return;
    }

    if (amount.dataset.autofilled === "true") amount.value = "";
    amount.readOnly = false;
    amount.dataset.autofilled = "false";
    status.textContent = origin && destination ? "呢個站組合未有自動票價，請手動輸入金額。" : "選好起點站同終點站後，系統會自動填入港鐵車費。";
  }

  $("transport").addEventListener("change", updateAutoFare);
  $("direction").addEventListener("change", updateAutoFare);
  fetch("mtr-fares.json?v=20260812-3")
    .then((response) => {
      if (!response.ok) throw new Error("票價資料載入失敗");
      return response.json();
    })
    .then((data) => { mtrFares = data.fares || {}; updateAutoFare(); })
    .catch(() => { $("fareStatus").textContent = "暫時未能載入港鐵票價，請手動輸入金額。"; });

  const configured = Boolean(config.googleClientId && config.appsScriptUrl);
  $(configured ? "loginView" : "setupView").classList.remove("hidden");

  function waitForGoogle(attempt = 0) {
    if (!configured) return;
    if (window.google?.accounts?.id) return initGoogle();
    if (attempt < 80) setTimeout(() => waitForGoogle(attempt + 1), 100);
    else $("loginError").textContent = "Google 登入暫時未能載入，請重新整理。";
  }

  function initGoogle() {
    google.accounts.id.initialize({
      client_id: config.googleClientId,
      callback: onCredential,
      auto_select: true,
      itp_support: true,
      use_fedcm_for_prompt: true
    });
    google.accounts.id.renderButton($("googleButton"), {theme:"outline", size:"large", shape:"pill", text:"continue_with", width:280});
    google.accounts.id.prompt();
  }

  async function onCredential(response) {
    idToken = response.credential;
    $("loginError").textContent = "正在驗證身份…";
    try {
      const data = await api("session");
      saveSession(data.sessionToken);
      idToken = "";
      await enterApp(data.user);
    } catch (error) {
      idToken = "";
      $("loginError").textContent = error.message;
    }
  }

  async function api(action, payload = {}) {
    const body = new URLSearchParams({action, idToken, sessionToken, payload: JSON.stringify(payload)});
    const response = await fetch(config.appsScriptUrl, {method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"}, body});
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "操作未完成，請稍後再試。");
    return data;
  }

  function saveSession(token) {
    if (!token) return;
    sessionToken = token;
    localStorage.setItem("transportClaimSession", token);
  }

  async function enterApp(user) {
    profile = user;
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
    $("welcome").textContent = `你好，${profile.name}`;
    $("monthLabel").textContent = new Intl.DateTimeFormat("zh-HK", {year:"numeric",month:"long"}).format(new Date());
    await loadClaims();
  }

  async function restoreSession() {
    if (!sessionToken) return false;
    $("loginError").textContent = "正在恢復登入…";
    try {
      const data = await api("session");
      saveSession(data.sessionToken);
      await enterApp(data.user);
      return true;
    } catch (error) {
      sessionToken = "";
      localStorage.removeItem("transportClaimSession");
      $("loginError").textContent = "";
      return false;
    }
  }

  async function loadClaims() {
    const data = await api("listClaims");
    currentClaims = data.claims || [];
    $("monthTotal").textContent = `HK$${Number(data.monthTotal || 0).toLocaleString("en-HK", {minimumFractionDigits:2,maximumFractionDigits:2})}`;
    $("claimList").innerHTML = currentClaims.length ? currentClaims.map(renderClaim).join("") : '<p class="muted">今個月未有車費紀錄。</p>';
    $("printClaimButton").disabled = !currentClaims.length;
  }

  function renderClaim(c) {
    const safe = (v) => String(v ?? "").replace(/[&<>"']/g, (m) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
    return `<article class="claim-row" data-claim-id="${safe(c.id)}"><div class="claim-actions"><button class="edit-claim" type="button">修改</button><button class="delete-claim" type="button">刪除</button></div><div class="claim"><div class="claim-icon">${c.transport === "MTR" ? "🚇" : "🚕"}</div><div class="claim-main"><strong>${safe(displayPlace(c.origin))} → ${safe(displayPlace(c.destination))}</strong><span>${safe(c.date)} · ${safe(c.transport)} · ${safe(c.direction)}</span></div><div class="claim-amount"><strong>HK$${Number(c.amount).toFixed(2)}</strong><span>${safe(c.status)}</span></div></div></article>`;
  }

  function displayPlace(value) {
    const parts = String(value ?? "").split("・").map((part) => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || "—";
  }

  function money(value) {
    return `HK$${Number(value || 0).toLocaleString("en-HK", {minimumFractionDigits:2, maximumFractionDigits:2})}`;
  }

  function preparePrintReport() {
    if (!profile || !currentClaims.length) return;
    const text = (value) => String(value ?? "");
    const monthDate = new Date(`${currentClaims[0].date}T00:00:00`);
    $("printMonth").textContent = Number.isNaN(monthDate.getTime())
      ? $("monthLabel").textContent
      : new Intl.DateTimeFormat("zh-HK", {year:"numeric", month:"long"}).format(monthDate);
    $("printEmployeeName").textContent = text(profile.name);
    $("printClaimRows").replaceChildren(...currentClaims.map((claim, index) => {
      const row = document.createElement("tr");
      [index + 1, claim.date, `${displayPlace(claim.origin)} → ${displayPlace(claim.destination)}`,
        `${text(claim.transport)}／${text(claim.direction)}`,
        [claim.project, claim.notes].filter(Boolean).join("／") || "—", money(claim.amount)
      ].forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      return row;
    }));
    $("printTotal").textContent = money(currentClaims.reduce((sum, claim) => sum + Number(claim.amount || 0), 0));
  }

  function resetClaimForm() {
    editingClaimId = "";
    $("claimForm").reset();
    ["originRegion", "destinationRegion"].forEach((id) => $(id).dispatchEvent(new Event("change")));
    $("date").valueAsDate = new Date();
    $("claimDialogTitle").textContent = "新增車費";
    $("saveButton").textContent = "儲存車費";
    $("formError").textContent = "";
  }

  function populateLocation(prefix, value) {
    if (applyStation(prefix, displayPlace(value))) return;
    const parts = String(value || "").split("・");
    const [regionName, districtName, placeName] = parts;
    if (!LOCATIONS[regionName]?.[districtName] || !placeName) return;
    $(`${prefix}Region`).value = regionName;
    $(`${prefix}Region`).dispatchEvent(new Event("change"));
    $(`${prefix}District`).value = districtName;
    $(`${prefix}District`).dispatchEvent(new Event("change"));
    $(`${prefix}Station`).value = "其他地點";
    $(`${prefix}Station`).dispatchEvent(new Event("change"));
    $(`${prefix}Other`).value = placeName;
    $(`${prefix}Other`).dispatchEvent(new Event("input"));
  }

  function editClaim(claim) {
    resetClaimForm();
    editingClaimId = claim.id;
    $("claimDialogTitle").textContent = "修改車費";
    $("saveButton").textContent = "儲存修改";
    $("date").value = claim.date;
    populateLocation("origin", claim.origin);
    populateLocation("destination", claim.destination);
    $("transport").value = claim.transport;
    $("direction").value = claim.direction;
    $("amount").readOnly = false;
    $("amount").value = Number(claim.amount).toFixed(2);
    $("claimForm").elements.project.value = claim.project || "";
    $("claimForm").elements.notes.value = claim.notes || "";
    $("claimDialog").showModal();
  }

  $("newClaimButton").addEventListener("click", () => { resetClaimForm(); $("claimDialog").showModal(); });
  $("closeDialog").addEventListener("click", () => $("claimDialog").close());
  $("refreshButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "更新中…";
    try { await loadClaims(); }
    catch (error) { alert(error.message); }
    finally { button.disabled = false; button.textContent = "↻ 即時更新"; }
  });
  let swipeStartX = 0;
  $("claimList").addEventListener("touchstart", (event) => { swipeStartX = event.touches[0].clientX; }, {passive:true});
  $("claimList").addEventListener("touchend", (event) => {
    const row = event.target.closest(".claim-row");
    if (!row) return;
    const distance = event.changedTouches[0].clientX - swipeStartX;
    $("claimList").querySelectorAll(".claim-row.swipe-open").forEach((item) => { if (item !== row) item.classList.remove("swipe-open"); });
    if (distance < -40) row.classList.add("swipe-open");
    if (distance > 40) row.classList.remove("swipe-open");
  }, {passive:true});
  $("claimList").addEventListener("click", async (event) => {
    const row = event.target.closest(".claim-row");
    if (!row) return;
    const claim = currentClaims.find((item) => item.id === row.dataset.claimId);
    if (!claim) return;
    if (event.target.closest(".edit-claim")) editClaim(claim);
    if (event.target.closest(".delete-claim")) {
      if (!confirm(`確定刪除 ${displayPlace(claim.origin)} → ${displayPlace(claim.destination)}？`)) return;
      event.target.disabled = true;
      try { await api("deleteClaim", {id:claim.id}); await loadClaims(); }
      catch (error) { alert(error.message); event.target.disabled = false; }
    }
  });
  $("printClaimButton").addEventListener("click", async () => {
    preparePrintReport();
    document.title = `車費Claim-${$("printMonth").textContent}-${profile.name}`;
    if (document.fonts?.ready) await document.fonts.ready;
    window.print();
  });
  window.addEventListener("afterprint", () => { document.title = "車費 Claim"; });
  $("logoutButton").addEventListener("click", () => {
    sessionToken = "";
    localStorage.removeItem("transportClaimSession");
    google.accounts.id.disableAutoSelect();
    location.reload();
  });
  $("claimForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("saveButton"); button.disabled = true; $("formError").textContent = "";
    try {
      const values = Object.fromEntries(new FormData(form));
      if (!values.origin || !values.destination) throw new Error("請完成選擇起點及終點。");
      if (editingClaimId) await api("updateClaim", {...values, id:editingClaimId});
      else await api("createClaim", values);
      form.reset();
      ["originRegion", "destinationRegion"].forEach((id) => $(id).dispatchEvent(new Event("change")));
      editingClaimId = ""; $("claimDialog").close(); await loadClaims();
    } catch (error) { $("formError").textContent = error.message; }
    finally { button.disabled = false; }
  });
  restoreSession().then((restored) => { if (!restored) waitForGoogle(); });
})();
