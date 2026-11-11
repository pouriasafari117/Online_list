import{categoryTitle as Q,computeDiff as x,computeStats as Y,getCategory as J}from"./model.js";import{currentNumerals as b,isAdmin as D,isDemo as w,mutateQuiet as z,refreshDirty as W,state as o,subscribe as X}from"./state.js";import{openMenu as Z,toast as tt}from"./ui.js";import{clamp as et,escapeHtml as y,formatNum as f,parseNumber as at}from"./util.js";import{icon as c}from"./icons.js";import{hydrateIcons as T,patchDeviceStock as st,renderGroupMeta as nt,renderStats as it,renderUpdateCard as ot}from"./render.js";const N={all:"همه",in:"موجود",low:"کم‌موجود",out:"ناموجود"};let a=null,P=null;function _t(){return!!a&&!a.el.hidden}function $t(n={}){if(!D()||!o.data)return null;if(!a){const r=pt();a={el:r,api:n,view:{q:"",status:"all",cat:"all"},confirmApply:!1,savedScroll:0,pushed:!1},ct(r)}return a.api=n,rt(),a}function rt(){if(a){if(a.el.hidden){a.savedScroll=window.scrollY,a.el.hidden=!1,document.body.classList.add("is-manage-page");try{history.scrollRestoration="manual"}catch{}try{history.pushState({...history.state||{},olManage:!0},"",location.href),a.pushed=!0}catch{a.pushed=!1}window.scrollTo(0,0)}a.paintAll?.(),P||(P=X(n=>{if(!(!a||a.el.hidden)){if(n==="auth"&&!D()){C();return}(n==="data"||n==="auth"||n==="published")&&a.paintAll?.(),n==="published"&&(a.confirmApply=!1,a.paintApply?.())}})),document.dispatchEvent(new CustomEvent("ol:manage-state",{detail:{open:!0}})),a.el.focus({preventScroll:!0})}}function C({fromHistory:n=!1}={}){if(!(!a||a.el.hidden)){if(!n&&a.pushed&&history.state&&history.state.olManage){a.pushed=!1;try{history.back();return}catch{}}lt()}}function lt(){if(!a||a.el.hidden)return;document.querySelectorAll("dialog.sheet[open]").forEach(r=>{try{r.close()}catch{}}),a.el.hidden=!0,a.pushed=!1,a.confirmApply=!1,document.body.classList.remove("is-manage-page");try{history.scrollRestoration="auto"}catch{}const n=a.savedScroll;window.scrollTo(0,n),requestAnimationFrame(()=>{a?.el.hidden&&window.scrollTo(0,n)}),document.getElementById("loginBtn")?.focus({preventScroll:!0}),document.dispatchEvent(new CustomEvent("ol:manage-state",{detail:{open:!1}}))}function ct(n){const r=n.querySelector("[data-mp-list]"),h=n.querySelector("[data-mp-note]"),_=n.querySelector("[data-mp-cat]"),S=n.querySelector("[data-mp-search]"),M=n.querySelector("[data-mp-applyhost]"),u=()=>a?.api||{};n.querySelector("[data-mp-back]").addEventListener("click",C),n.querySelector("[data-mp-settings]").addEventListener("click",()=>u().settings?.()),n.querySelector("[data-mp-more]").addEventListener("click",t=>G(t.currentTarget)),n.querySelector("[data-mp-add]").addEventListener("click",()=>{u().add?.(a.view.cat!=="all"?a.view.cat:"")}),n.querySelector("[data-mp-cat-add]").addEventListener("click",()=>u().addCategory?.()),n.querySelector("[data-mp-apply]").addEventListener("click",()=>{a.confirmApply=!0,g(),n.querySelector("[data-mp-applybox]")?.scrollIntoView({block:"center",behavior:"smooth"})}),S.addEventListener("input",()=>{a.view.q=S.value.trim().toLowerCase(),v({keepFocus:!0})}),_.addEventListener("change",()=>{a.view.cat=_.value,v()}),n.querySelectorAll("[data-mp-status]").forEach(t=>{t.addEventListener("click",()=>{a.view.status=t.dataset.mpStatus,n.querySelectorAll("[data-mp-status]").forEach(e=>{e.classList.toggle("is-active",e===t),e.setAttribute("aria-pressed",String(e===t))}),v()})}),r.addEventListener("click",async t=>{const e=t.target.closest("[data-mp-act]"),i=t.target.closest("[data-mp-row]");if(!i)return;const s=i.dataset.id,l=o.data.devices.find(p=>p.id===s);if(l){if(!e){if(t.target.closest("input, button, a, label"))return;u().edit?.(s);return}if(e.dataset.mpAct==="inc"){k(s,l.stock+1);return}if(e.dataset.mpAct==="dec"){k(s,l.stock-1);return}if(e.dataset.mpAct==="edit"){u().edit?.(s);return}if(e.dataset.mpAct==="delete"){K(i);return}if(e.dataset.mpAct==="delete-yes"){await R(s,l);return}if(e.dataset.mpAct==="delete-no"){v({keepScroll:!0});return}if(e.dataset.mpAct==="hide"){j(s,"hidden");return}}}),r.addEventListener("change",t=>{const e=t.target.closest('[data-mp-act="input"]');if(!e)return;const i=e.closest("[data-mp-row]"),s=o.data.devices.find(p=>p.id===i?.dataset.id);if(!s)return;const l=at(e.value);if(!e.value.trim()||!Number.isFinite(l)){e.value=String(s.stock),e.classList.add("is-invalid"),setTimeout(()=>e.classList.remove("is-invalid"),900);return}e.classList.remove("is-invalid"),k(i.dataset.id,l)}),n.addEventListener("click",async t=>{const e=t.target.closest("[data-mp-apply-act]")?.dataset.mpApplyAct;if(!e)return;if(e==="cancel"){a.confirmApply=!1,g();return}if(e!=="confirm")return;const i=n.querySelector("[data-mp-applybox]"),s=t.target.closest('[data-mp-apply-act="confirm"]'),l=i?.querySelector("[data-mp-message]")?.value.trim();s&&(s.disabled=!0,s.dataset.busy="1");const p=await u().apply?.(l);s&&(s.disabled=!1,delete s.dataset.busy),a.confirmApply=!p,p?E():g()}),document.addEventListener("ol:apply-request",()=>{!a||a.el.hidden||(a.confirmApply=!0,g(),n.querySelector("[data-mp-applybox]")?.scrollIntoView({block:"center",behavior:"smooth"}))}),window.addEventListener("popstate",()=>{!a||a.el.hidden||history.state&&history.state.olManage||C({fromHistory:!0})}),document.addEventListener("keydown",t=>{if(!a||a.el.hidden)return;if(!t.target.closest?.('input, textarea, select, [contenteditable="true"]')&&(t.key==="/"||(t.ctrlKey||t.metaKey)&&t.key.toLowerCase()==="k")){t.preventDefault(),S.focus();return}if(t.key==="Escape"&&!(t.defaultPrevented||document.querySelector(".menu"))&&!document.querySelector("dialog[open]")){if(r.querySelector("[data-ask]")){v({keepScroll:!0});return}n.querySelector("[data-mp-applybox]")&&(a.confirmApply=!1,g())}});function k(t,e){const i=o.data.devices.find(p=>p.id===t);if(!i)return;const s=et(Math.round(Number(e)),0,9999);if(!Number.isFinite(s)||s===i.stock)return;z(p=>{const d=p.devices.find($=>$.id===t);d&&(d.stock=s,d.updatedAt=new Date().toISOString())});const l=r.querySelector(`[data-mp-row][data-id="${mt(t)}"]`);if(l){const p=l.querySelector('[data-mp-act="input"]');p&&(p.value=String(s)),l.dataset.stock=A(s),l.classList.toggle("is-oos",s<=0);const d=l.querySelector("[data-mp-badge]");d&&(d.textContent=H(s),d.classList.remove("mp-badge--ok","mp-badge--low","mp-badge--out"),d.classList.add(`mp-badge--${A(s)}`))}st(t),nt(),it({animate:!1}),ot(),I(),L(),navigator.vibrate&&navigator.vibrate(6)}async function R(t,e){z(i=>{i.devices=i.devices.filter(s=>s.id!==t)}),tt(`«${e.name}» حذف شد؛ با «اعمال تغییرات» روی سایت می‌نشیند.`,{type:"ok"}),E()}function j(t,e){z(i=>{const s=i.devices.find(l=>l.id===t);s&&(s[e]=!s[e],s.updatedAt=new Date().toISOString())}),v({keepScroll:!0})}function B(){return o.data?.settings?.currency||"تومان"}function q(){return o.data?.settings?.lowStockThreshold??2}function A(t){return t<=0?"out":t<=q()?"low":"ok"}function H(t){const e=f(t,b());return t<=0?"ناموجود":t<=q()?`${e} — کم`:`${e} موجود`}function O(t){return a.view.cat!=="all"&&(t.categoryId||"")!==a.view.cat||a.view.status==="in"&&t.stock<=0||a.view.status==="out"&&t.stock>0||a.view.status==="low"&&!(t.stock>0&&t.stock<=q())?!1:a.view.q?`${t.name} ${t.brand||""} ${Q(o.data,t.categoryId)}`.toLowerCase().includes(a.view.q):!0}function F(t){const e=J(o.data,t.categoryId),i=A(t.stock),s=t.priceOnRequest||!t.price?'<span class="mp-row__price">استعلام</span>':`<span class="mp-row__price">${f(t.price,b())} <small>${y(B())}</small></span>`,l=[t.featured?`<span class="mp-badge mp-badge--star">${c("star",{size:11})} ویژه</span>`:"",t.hidden?`<span class="mp-badge mp-badge--low">${c("visibility_off",{size:11})} پنهان</span>`:""].join("");return`
      <div class="mp-row ${i==="out"?"is-oos":""}" data-mp-row data-id="${y(t.id)}" data-stock="${i}">
        <span class="mp-row__thumb" data-stock="${i}" aria-hidden="true">${c(e?.icon||"devices_other",{size:20})}</span>
        <div class="mp-row__main">
          <div class="mp-row__title">
            <span class="mp-row__name">${y(t.name)}</span>${l}
          </div>
          <div class="mp-row__sub">
            <span class="mp-row__meta">${y(t.brand||"بدون برند")}<span class="mp-row__cat"> · ${y(e?.title||"بدون دسته")}</span></span>
            ${s}
          </div>
        </div>
        <span class="mp-badge mp-badge--${i}" data-mp-badge>${H(t.stock)}</span>
        <div class="mp-stepper" role="group" aria-label="موجودی ${y(t.name)}">
          <button type="button" class="mp-stepper__btn mp-stepper__btn--dec" data-mp-act="dec" aria-label="کاهش موجودی">${c("remove",{size:15})}</button>
          <input class="mp-stepper__input" type="number" inputmode="numeric" min="0" max="9999" step="1"
                 value="${t.stock}" data-mp-act="input" aria-label="تعداد موجودی">
          <button type="button" class="mp-stepper__btn mp-stepper__btn--inc" data-mp-act="inc" aria-label="افزایش موجودی">${c("add",{size:15})}</button>
        </div>
        <div class="mp-row__actions">
          <button type="button" class="icon-btn mp-row__edit" data-mp-act="edit" aria-label="ویرایش ${y(t.name)}" data-tip="ویرایش">${c("edit",{size:17})}</button>
          <button type="button" class="icon-btn ${t.hidden?"mp-row__hidden-on":"mp-row__hide"}" data-mp-act="hide" aria-label="${t.hidden?"نمایش در سایت":"پنهان کردن در سایت"}" data-tip="${t.hidden?"نمایش":"پنهان"}">${c(t.hidden?"visibility":"visibility_off",{size:17})}</button>
          <button type="button" class="icon-btn mp-row__danger" data-mp-act="delete" aria-label="حذف ${y(t.name)}" data-tip="حذف">${c("delete",{size:17})}</button>
        </div>
      </div>`}function v({keepScroll:t=!1,keepFocus:e=!1}={}){const i=r.scrollTop,s=o.data.devices.filter(O);r.innerHTML=s.length?s.map(F).join(""):`<div class="mp-empty">
           ${c("inventory_2",{size:26})}
           <b>${a.view.q||a.view.status!=="all"||a.view.cat!=="all"?"با این فیلتر کالایی نیست":"هنوز کالایی ثبت نشده"}</b>
           <span>${a.view.q||a.view.status!=="all"||a.view.cat!=="all"?"فیلترها را پاک کنید.":"با «افزودن کالا» اولین دستگاه را ثبت کنید."}</span>
         </div>`,t&&(r.scrollTop=i),e&&S.focus({preventScroll:!0}),I(),L(),g()}function K(t){const e=t.querySelector(".mp-row__actions");e&&(e.innerHTML=`
      <span class="mp-row__ask">حذف شود؟</span>
      <button type="button" class="btn btn--sm btn--danger" data-mp-act="delete-yes">بله، حذف</button>
      <button type="button" class="icon-btn" data-mp-act="delete-no" aria-label="انصراف">${c("close",{size:18})}</button>
    `,e.setAttribute("data-ask","1"),e.querySelector('[data-mp-act="delete-yes"]')?.focus({preventScroll:!0}),T(e))}function U(){const t=o.data.categories.map(e=>`<option value="${y(e.id)}">${y(e.title)}</option>`).join("");_.innerHTML=`<option value="all">همهٔ دسته‌ها</option>${t}`,o.data.categories.some(e=>e.id===a.view.cat)||(a.view.cat="all"),_.value=a.view.cat}function V(){const t=n.querySelector("[data-mp-sub]");t&&(t.textContent=ut());const e=n.querySelector("[data-mp-sync]"),i=!o.dirty,s=w();if(e){const p=(i?null:x(o.baseline,o.data))?.total||0;e.dataset.state=s?"demo":i?"ok":"pending",e.querySelector(".label").textContent=s?"حالت پیش‌نمایش":i?"همگام با مخزن":`${f(p||1,b())} تغییر در انتظار تأیید`;const d=e.querySelector(".label-short");d&&(d.textContent=s?"پیش‌نمایش":i?"همگام":`${f(p||1,b())} تغییر`),e.title=s?"در پیش‌نمایش چیزی روی مخزن نوشته نمی‌شود.":i?"همه‌چیز روی مخزن به‌روز است.":"تا «اعمال تغییرات» را نزنید، سایت نسخهٔ قبلی را نشان می‌دهد."}}function I(){const t=Y(o.data,{includeHidden:!0}),e={all:t.devices,in:t.inStock,low:t.low,out:t.out};n.querySelectorAll("[data-mp-status]").forEach(s=>{const l=s.dataset.mpStatus,p=N[l]||l,d=f(e[l]??0,b()),$=`${p} <b class="mp__seg-count">${d}</b>`;s.dataset.rendered!==$&&(s.innerHTML=$,s.dataset.rendered=$),s.classList.toggle("is-empty",!e[l])});const i=n.querySelector("[data-mp-summary]");i&&(i.innerHTML=`
      <div class="mp-stat">
        <span class="mp-stat__icon">${c("inventory_2",{size:16})}</span>
        <b>${f(t.devices,b())}</b><span>کالا</span>
      </div>
      <div class="mp-stat mp-stat--ok">
        <span class="mp-stat__icon">${c("check_circle",{size:16})}</span>
        <b>${f(t.units,b())}</b><span>واحد موجود</span>
      </div>
      <div class="mp-stat ${t.out?"mp-stat--danger":""}">
        <span class="mp-stat__icon">${c("cancel",{size:16})}</span>
        <b>${f(t.out,b())}</b><span>ناموجود</span>
      </div>
      <div class="mp-stat mp-stat--low">
        <span class="mp-stat__icon">${c("category",{size:16})}</span>
        <b>${f(t.categoriesTotal,b())}</b><span>دسته</span>
      </div>
    `)}function L(){W();const t=n.querySelector("[data-mp-pending]"),i=(o.dirty?x(o.baseline,o.data):null)?.total||0;t&&(t.innerHTML=o.dirty?`<span class="mp__pending-dot" aria-hidden="true"></span>${f(i||1,b())} تغییر در انتظار تأیید`:"همه‌چیز مطابق سایت است",t.classList.toggle("is-dirty",!!o.dirty)),h&&(h.hidden=!o.dirty,h.innerHTML=o.dirty?`${c("info",{size:18})}<span>تغییرات فعلاً فقط روی همین صفحه است. برای دیدن روی سایت، «اعمال تغییرات» را بزنید و تأیید کنید.</span>`:"");const s=n.querySelector("[data-mp-apply]");s&&(s.disabled=!o.dirty||w()),V()}function g(){const t=M.querySelector("[data-mp-applybox]"),e=n.querySelector("[data-mp-apply]");if(o.dirty||(a.confirmApply=!1),!a.confirmApply){t?.remove(),e?.removeAttribute("data-open");return}if(e?.setAttribute("data-open","1"),t)return;const i=x(o.baseline,o.data),s=[...i.added.map(m=>`+ ${m.name}`),...i.updated.map(m=>`~ ${m.name}`),...i.removed.map(m=>`− ${m.name}`),...i.catAdded.map(m=>`+ دسته: ${m.title}`),...i.catUpdated.map(m=>`~ دسته: ${m.title}`),...i.catRemoved.map(m=>`− دسته: ${m.title}`),...i.storeChanged?["~ اطلاعات فروشگاه"]:[],...i.settingsChanged?["~ تنظیمات نمایش"]:[]],l=s.length,p=w(),d=document.createElement("div");d.className="mp-apply",d.setAttribute("data-mp-applybox",""),d.innerHTML=`
      <div class="mp-apply__head">
        <span class="mp-apply__icon">${c("cloud_upload",{size:20})}</span>
        <div>
          <b>${p?"در پیش‌نمایش امکان انتشار نیست":"اعمال تغییرات روی سایت؟"}</b>
          <span>${p?"این حالت توکن ندارد؛ فقط ظاهر پنل را می‌بینید.":`${f(i.total,b())} تغییر در ${f(l,b())} مورد. با تأیید، فایل مخزن به‌روز می‌شود.`}</span>
        </div>
      </div>
      ${s.length?`<ul class="mp-apply__list">${s.slice(0,6).map(m=>`<li>${y(m)}</li>`).join("")}${s.length>6?`<li>و ${f(s.length-6,b())} مورد دیگر…</li>`:""}</ul>`:""}
      <label class="field" style="gap:6px">
        <span class="field__label">پیام کامیت</span>
        <input class="input" data-mp-message dir="auto" value="${y(dt())}" maxlength="160">
      </label>
      <div class="mp-apply__actions">
        <button type="button" class="btn btn--text btn--sm" data-mp-apply-act="cancel">انصراف</button>
        <button type="button" class="btn btn--ok btn--sm" data-mp-apply-act="confirm" ${p?"disabled":""}>
          ${c("check",{size:17})} تأیید و انتشار
        </button>
      </div>
    `,M.append(d),T(d),window.matchMedia?.("(pointer: fine)").matches?d.querySelector("[data-mp-message]")?.focus({preventScroll:!0}):(d.tabIndex=-1,d.focus({preventScroll:!0}))}function E(){!a||a.el.hidden||(U(),v(),L(),g())}a.paintAll=E,a.paintApply=g;function G(t){const e=[{label:"دسته‌بندی جدید",icon:"category",onSelect:()=>u().addCategory?.()},{label:"تنظیمات فروشگاه",icon:"settings",onSelect:()=>u().settings?.()},{label:"رمز و توکن",icon:"key",onSelect:()=>u().security?.()},{label:"نسخهٔ پشتیبان",icon:"download",onSelect:()=>u().backup?.()},{label:"تاریخچهٔ به‌روزرسانی",icon:"history",onSelect:()=>u().history?.()},{label:"راهنمای مدیر",icon:"help",onSelect:()=>u().help?.()}];o.dirty&&(e.push({separator:!0}),e.push({label:"بازگردانی تغییرات",icon:"replay",onSelect:()=>u().discard?.()})),e.push({separator:!0}),e.push({label:"بازنشانی لیست",icon:"delete",danger:!0,onSelect:()=>u().reset?.()}),e.push({label:w()?"خروج از پیش‌نمایش":"قفل کردن",icon:w()?"logout":"lock",danger:!0,onSelect:()=>u().logout?.()}),Z(t,e)}}function pt(){const n=document.getElementById("managePageHost"),r=document.createElement("section");return r.className="mpage",r.id="managePage",r.hidden=!0,r.tabIndex=-1,r.setAttribute("aria-labelledby","manageTitle"),r.innerHTML=`
    <header class="mpage__bar">
      <div class="container mpage__bar-inner">
        <button class="mpage__back" type="button" data-mp-back aria-label="بازگشت به لیست" data-tip="بازگشت به لیست">
          ${c("chevron_right",{size:20})}
        </button>
        <div class="mpage__titles">
          <h1 class="mpage__title" id="manageTitle">پنل مدیریت</h1>
          <p class="mpage__sub" data-mp-sub></p>
        </div>
        <span class="mpage__sync" data-mp-sync data-state="ok">
          <span class="mpage__sync-dot" aria-hidden="true"></span>
          <span class="label"></span>
          <span class="label-short"></span>
        </span>
        <div class="mpage__actions">
          <button class="icon-btn" type="button" data-mp-settings aria-label="تنظیمات فروشگاه" data-tip="تنظیمات">
            ${c("settings",{size:19})}
          </button>
          <button class="icon-btn" type="button" data-mp-more aria-label="گزینه‌های بیشتر" aria-haspopup="menu" data-tip="بیشتر">
            ${c("more_vert",{size:19})}
          </button>
        </div>
      </div>
    </header>

    <div class="container mpage__body">
      <div class="mp__summary" data-mp-summary></div>
      <div class="mp__toolbar">
        <label class="mp__search">
          ${c("search",{size:18})}
          <input type="search" data-mp-search placeholder="جستجوی نام یا برند…" autocomplete="off" aria-label="جستجوی کالا">
        </label>
        <select class="select mp__cat" data-mp-cat aria-label="دسته‌بندی"></select>
        <div class="mp__seg" role="group" aria-label="وضعیت موجودی">
          ${Object.entries(N).map(([h,_])=>`
            <button type="button" class="mp__seg-btn ${h==="all"?"is-active":""}" data-mp-status="${h}" aria-pressed="${h==="all"}">${_}</button>
          `).join("")}
        </div>
      </div>
      <div class="mp__note" data-mp-note hidden></div>
      <div class="mp__list" data-mp-list></div>
      <div class="mp__applyhost" data-mp-applyhost></div>
    </div>

    <div class="mpage__foot">
      <div class="container mpage__foot-inner">
        <button class="btn btn--ok-soft btn--sm" type="button" data-mp-add>${c("add",{size:17})} افزودن کالا</button>
        <button class="btn btn--text btn--sm" type="button" data-mp-cat-add aria-label="دسته‌بندی جدید" data-tip="دسته‌بندی جدید">${c("category",{size:17})} <span class="label">دسته‌بندی</span></button>
        <span class="spacer"></span>
        <span class="mp__pending" data-mp-pending role="status" aria-live="polite"></span>
        <button class="btn btn--ok btn--sm" type="button" data-mp-apply disabled>${c("cloud_upload",{size:17})} اعمال تغییرات</button>
      </div>
    </div>
  `,n.append(r),T(r),r}function dt(){const n=o.data?.settings?.storeName||o.data?.store?.name||"لیست موجودی",r=new Date().toLocaleString("fa-IR",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});return`به‌روزرسانی ${n} — ${r}`}function ut(){const r=(o.data?.settings||{}).storeName||o.data?.store?.name||"فروشگاه شما";return w()?`${r} · حالت پیش‌نمایش`:`${r} · مدیریت کالا و موجودی`}function mt(n){return window.CSS?.escape?CSS.escape(n):String(n).replace(/["\\]/g,"\\$&")}export{C as closeManagePanel,_t as isManagePanelOpen,$t as openManagePanel};
