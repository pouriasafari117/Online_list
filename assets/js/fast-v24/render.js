import{hydrateIcons as I,icon as d}from"./icons.js";import{computeStats as w,countByCategory as E,deviceExtraSpecs as W,getCategory as _,specText as y,stockState as v,visibleDevices as k}from"./model.js";import{currentNumerals as G,isAdmin as g,state as o}from"./state.js";import{escapeHtml as r,formatJalaliDate as J,formatJalaliDateTime as S,formatNum as V,instagramHref as K,matchesQuery as Y,pickTone as C,prefersReducedMotion as Q,safeUrl as A,telHref as z,timeAgo as X,whatsappHref as B}from"./util.js";import{openSheet as q,toast as Z,copyWithToast as H}from"./ui.js";const tt=8,et="تومان";function L(){return G()}function p(t){const e=V(t,L());return L()==="fa"?e.replace(/,/g,"٬"):e}function M(){return o.data?.settings?.currency||et}function St(){const e=document.documentElement.getAttribute("data-theme")||"auto",s=e==="dark"||e==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches,a=document.getElementById("themeBtn");a&&(a.setAttribute("aria-checked",String(s)),a.setAttribute("aria-label",s?"تغییر به حالت روز":"تغییر به حالت شب"),a.dataset.tip=s?"حالت روز":"حالت شب",a.classList.contains("is-initializing")&&!a.dataset.readyScheduled&&(a.dataset.readyScheduled="1",requestAnimationFrame(()=>requestAnimationFrame(()=>a.classList.remove("is-initializing")))));const n=document.querySelector('meta[name="theme-color"][media*="light"]'),i=document.querySelector('meta[name="theme-color"][media*="dark"]');n&&(n.content="#f4f2ed"),i&&(i.content="#0e0e0c")}function at(){const t=o.data;if(!t)return;const{store:e}=t;document.querySelectorAll("[data-store-name]").forEach(f=>{f.textContent=e.name}),document.querySelectorAll("[data-store-description]").forEach(f=>{f.textContent=e.description}),document.querySelectorAll("[data-store-address]").forEach(f=>{f.textContent=e.address||"—"}),document.querySelectorAll("[data-store-hours]").forEach(f=>{f.textContent=e.hours||"—"});const s=document.querySelector(".hero__headline");s&&e.tagline&&(s.textContent=e.tagline),document.title=`${e.name} — لیست موجودی`;const a=document.querySelector('meta[name="description"]');a&&a.setAttribute("content",e.description||`${e.name} — لیست موجودی آنلاین`);const n=document.querySelector('meta[property="og:title"]');n&&n.setAttribute("content",document.title);const i=z(e.phone);["heroCall","contactCall","contactPhone"].forEach(f=>{const $=document.getElementById(f);$&&(e.phone?($.href=i,$.removeAttribute("aria-disabled")):($.setAttribute("aria-disabled","true"),$.href="#"))});const c=document.getElementById("contactPhone");c&&(c.textContent=e.phone||"—");const l=B(e.whatsapp,`سلام! درباره موجودی ${e.name} سوال داشتم.`),b=document.getElementById("contactWhatsapp");b&&(l?b.href=l:b.hidden=!0);const h=K(e.instagram),u=document.getElementById("contactInstagram");u&&(h?u.href=h:u.hidden=!0);const m=document.getElementById("year");if(m)try{const f=new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric"}).formatToParts(new Date).find($=>$.type==="year");m.textContent=f?.value||"۱۴۰۵"}catch{m.textContent="۱۴۰۵"}T()}function T(){const t=o.data;if(!t)return;const e=document.querySelector("[data-footer-update]");e&&(e.textContent=`آخرین به‌روزرسانی: ${J(t.meta.updatedAt,{short:!0})}`);const s=document.getElementById("dataStatus");if(s){const i=o.online&&!o.error;s.classList.toggle("is-offline",!i);const c=s.querySelector("span:last-child");c&&(c.textContent=o.error?"داده‌ها در دسترس نیست":i?"متصل":"آفلاین")}const a=document.getElementById("footerCategories");if(a){const i=E(t),c=t.categories.filter(l=>i.get(l.id));a.innerHTML=c.length?c.slice(0,6).map(l=>`
          <a href="#list" data-action="filter-cat" data-cat="${r(l.id)}">
            ${r(l.title)} <span style="opacity:.55">${p(i.get(l.id)||0)}</span>
          </a>`).join(""):'<span class="t-muted">هنوز دسته‌بندی‌ای ثبت نشده است.</span>'}const n=document.getElementById("footerLogin");n&&(n.textContent=g()?"پنل مدیریت":"ورود مدیر")}function nt(){const t=document.getElementById("loginBtn");if(!t)return;g()?(t.className="btn btn--sm admin-pill",t.innerHTML=`<span class="admin-pill__dot" aria-hidden="true"></span><span>${r(o.user?.name||"مدیر")}</span>`,t.setAttribute("data-action","admin-menu"),t.removeAttribute("data-login"),t.setAttribute("aria-haspopup","menu")):(t.className="btn btn--outlined btn--sm login-btn",t.innerHTML=`${d("lock",{size:17})}<span>ورود مدیر</span>`,t.setAttribute("data-action","login"),t.removeAttribute("aria-haspopup"));const e=document.getElementById("footerLogin");e&&(e.textContent=g()?"پنل مدیریت":"ورود مدیر")}let j=!1;function R({animate:t=!0}={}){if(!o.data)return;const e=w(o.data,{includeHidden:g()});document.querySelectorAll("[data-stat]").forEach(s=>{const a=s.dataset.stat,n=e[a]??0;!t||j||Q()?s.textContent=p(n):st(s,n)}),t&&(j=!0)}function st(t,e){const a=performance.now(),n=0,i=c=>{const l=Math.min(1,(c-a)/800),b=1-(1-l)**3;t.textContent=p(Math.round(n+(e-n)*b)),l<1?requestAnimationFrame(i):t.textContent=p(e)};requestAnimationFrame(i)}function F(){if(!o.data)return;const{meta:t}=o.data,e=document.querySelector("[data-update-ago]"),s=document.querySelector("[data-update-exact]"),a=document.querySelector("[data-update-by]"),n=document.querySelector("[data-update-source]");e&&(e.textContent=X(t.updatedAt)),s&&(s.textContent=S(t.updatedAt)),a&&(a.textContent=t.updatedBy||"مدیر فروشگاه"),n&&(o.mode==="admin"&&o.dirty?n.textContent="تغییرات منتشرنشده — منتظر انتشار":o.mode==="admin"?n.textContent="همگام با مخزن گیت‌هاب":o.mode==="demo"?n.textContent="حالت نمایشی — تغییرات ذخیره نمی‌شود":o.error?n.textContent="آخرین نسخه ذخیره‌شده":n.textContent=o.source==="local"?"نسخه منتشرشده در سایت":"مستقیم از مخزن گیت‌هاب");const i=document.getElementById("listSub");if(i){const c=w(o.data,{includeHidden:g()});i.textContent=`${p(c.devices)} مدل در ${p(c.categoriesTotal)} دسته‌بندی · ${p(c.inStock)} مدل موجود`}}function ot(){if(!o.data)return;const{store:t,meta:e}=o.data,s=document.querySelector("[data-print-title]");s&&(s.textContent=`${t.name} — لیست موجودی`);const a=document.querySelector("[data-print-meta]");if(a){const n=w(o.data,{includeHidden:!1}),i=[`آخرین به‌روزرسانی: ${S(e.updatedAt)}`,`${p(n.devices)} مدل · ${p(n.inStock)} موجود`,t.phone?`تلفن: ${t.phone}`:"",t.address||""].filter(Boolean);a.textContent=i.join("  —  ")}}function it(){const t=document.getElementById("featuredSection"),e=document.getElementById("featuredRail");if(!t||!e||!o.data)return;const s=k(o.data).filter(a=>a.featured).sort((a,n)=>a.order-n.order).slice(0,10);if(!s.length){t.hidden=!0,e.innerHTML="";return}t.hidden=!1,e.innerHTML=s.map(a=>rt(a)).join("")}function rt(t){const e=_(o.data,t.categoryId),s=(e?.fields||[]).filter(n=>n.showInRow&&y(n,t)).slice(0,2),a=v(t,o.data.settings);return`
    <button class="feature-card reveal is-in" type="button" role="listitem" data-action="detail" data-device-id="${r(t.id)}"
            aria-label="جزئیات ${r(t.name)}">
      <div class="feature-card__media" data-tone="${C(t.name+t.brand)}">
        ${t.image?`<img class="thumb-img" src="${r(A(t.image))}" alt="" loading="lazy" decoding="async">`:d(e?.icon||"devices_other",{size:54})}
        <span class="feature-card__tag badge badge--inverse">${d("star",{size:12})} ویژه</span>
      </div>
      <div>
        <div class="feature-card__name">${r(t.name)}</div>
        <div class="feature-card__specs">${r([t.brand,...s.map(n=>y(n,t))].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="feature-card__foot">
        <span class="feature-card__price">${P(t)}</span>
        ${x(t)}
      </div>
    </button>
  `}function ct(){const t=o.data;if(!t)return[];const{ui:e}=o;let s=k(t,{includeHidden:g()});return e.hiddenOnly&&(s=s.filter(a=>a.hidden)),e.category!=="all"&&(s=s.filter(a=>(a.categoryId||"__none__")===e.category)),e.avail!=="all"&&(s=s.filter(a=>v(a,t.settings)===e.avail)),e.q.trim()&&(s=s.filter(a=>{const n=_(t,a.categoryId),i=[a.name,a.brand,a.condition,a.warranty,a.note,a.specs?Object.values(a.specs).join(" "):"",n?.title||"",n?.description||""].join(" ");return Y(i,e.q)})),dt(s,t)}function dt(t,e){const s=[...t],a=n=>n.priceOnRequest||!n.price?Number.POSITIVE_INFINITY:n.price;switch(o.ui.sort){case"price-asc":return s.sort((n,i)=>a(n)-a(i)||n.order-i.order);case"price-desc":return s.sort((n,i)=>{const c=a(n),l=a(i);return Number.isFinite(c)?Number.isFinite(l)?l-c||n.order-i.order:-1:1});case"stock-desc":return s.sort((n,i)=>i.stock-n.stock||n.order-i.order);case"newest":return s.sort((n,i)=>new Date(i.createdAt)-new Date(n.createdAt));case"name-asc":return s.sort((n,i)=>n.name.localeCompare(i.name,"fa"));default:return s.sort((n,i)=>Number(i.featured)-Number(n.featured)||n.order-i.order)}}function lt(){return o.ui.category==="all"&&!o.ui.q.trim()}function D(){if(!o.data)return;const{ui:t}=o,e=document.getElementById("searchInput");e&&document.activeElement!==e&&(e.value=t.q),document.getElementById("searchWrap")?.classList.toggle("has-value",!!t.q),document.querySelectorAll("#availabilityFilter [data-avail]").forEach(b=>{b.setAttribute("aria-pressed",String(b.dataset.avail===t.avail))}),document.querySelectorAll("[data-view]").forEach(b=>{b.setAttribute("aria-pressed",String(b.dataset.view===t.view))});const s=document.getElementById("sortSelect");s&&s.value!==t.sort&&(s.value=t.sort),ut();const a=document.getElementById("resetFilters"),n=!!t.q||t.category!=="all"||t.avail!=="all"||t.sort!=="recommended"||!!t.hiddenOnly;a&&(a.hidden=!n);const i=document.getElementById("listRoot");i&&i.classList.toggle("list--static",!!t.q||g());const c=document.getElementById("categories");c&&t.hiddenOnly&&c.insertAdjacentHTML("afterbegin",`
      <button class="chip is-active" type="button" data-action="clear-filters" aria-pressed="true" title="نمایش همه دستگاه‌ها">
        ${d("visibility_off",{size:17})} فقط پنهان‌ها
        <span class="chip__count">✕</span>
      </button>`);const l=document.getElementById("searchClear");l&&(l.hidden=!t.q)}function ut(){const t=document.getElementById("categories")||document.getElementById("categoryChips");if(!t)return;const e=E(o.data,{includeHidden:g()}),s=[...e.values()].reduce((n,i)=>n+i,0),a=[`<button class="chip chip--all" type="button" data-action="filter-cat" data-cat="all" aria-pressed="${o.ui.category==="all"}">
      ${d("grid_view",{size:17})} همه <span class="chip__count">${p(s)}</span>
    </button>`];for(const n of o.data.categories)!e.get(n.id)&&!g()||a.push(`
      <button class="chip" type="button" data-action="filter-cat" data-cat="${r(n.id)}"
              data-tone="${C(n.title)}" aria-pressed="${o.ui.category===n.id}">
        ${d(n.icon||"category",{size:17})}
        ${r(n.title)}
        <span class="chip__count">${p(e.get(n.id)||0)}</span>
      </button>`);e.get("__none__")&&a.push(`
      <button class="chip" type="button" data-action="filter-cat" data-cat="__none__" data-tone="5"
              aria-pressed="${o.ui.category==="__none__"}">
        ${d("category",{size:17})} سایر <span class="chip__count">${p(e.get("__none__")||0)}</span>
      </button>`),g()&&a.push(`
      <button class="chip" type="button" data-action="add-category" style="border-style:dashed">
        ${d("add",{size:17})} دسته جدید
      </button>`),t.innerHTML=a.join("")}function N(){const t=document.getElementById("listRoot");if(!t||!o.data)return;const e=ct(),s=k(o.data,{includeHidden:g()}).length,a=document.getElementById("resultCount"),n=lt();let i="";if(!e.length)i=U(s===0);else if(n)i=pt(e);else{const u=o.ui.printAll?e.length:Math.max(o.ui.limit,1);i=`
      <div class="group">
        <div class="group__list">
          ${e.slice(0,u).map((f,$)=>O(f,$,{showCategory:!0})).join("")}
        </div>
      </div>`}t.innerHTML=i,t.setAttribute("aria-busy","false");const c=s===0;document.getElementById("filterbar")?.classList.toggle("is-hidden",c);const l=document.querySelector(".resultbar");if(l&&l.classList.toggle("is-hidden",c),a)if(n){const u=new Set(e.map(m=>m.categoryId||"__none__")).size;a.innerHTML=`<b>${p(e.length)}</b> دستگاه در ${p(u)} دسته · ${p(e.filter(m=>m.stock>0).length)} موجود`}else a.innerHTML=`<b>${p(e.length)}</b> نتیجه از ${p(s)} دستگاه`;const b=document.getElementById("loadMoreWrap"),h=document.getElementById("loadMoreBtn");if(b&&h){const u=n?0:Math.max(0,e.length-o.ui.limit);b.hidden=u<=0||o.ui.printAll,u>0&&(h.textContent=`نمایش ${p(Math.min(24,u))} دستگاه دیگر (${p(u)} باقی‌مانده)`)}I(t)}function pt(t){const e=o.data,s=[];for(const n of e.categories){const i=t.filter(c=>c.categoryId===n.id);!i.length&&!g()||s.push({cat:n,items:i})}const a=t.filter(n=>!_(e,n.categoryId));return a.length&&s.push({cat:null,items:a}),s.length?s.map(({cat:n,items:i})=>mt(n,i)).join(""):U(!0)}function mt(t,e){const s=o.data,a=t?.id||"__none__",n=o.ui.category===a,i=o.ui.printAll||n?e.length:tt,c=e.slice(0,i),l=e.filter(f=>f.stock>0).length,b=e.filter(f=>f.hidden).length,h=t?.title||"سایر",u=t?.icon||"category",m=[`${p(e.length)} دستگاه`,`${p(l)} موجود`];return g()&&b&&m.push(`${p(b)} پنهان`),`
    <section class="group group--${o.ui.view==="grid"?"grid":"list"}" data-group="${r(a)}" aria-label="${r(h)}">
      <div class="group__head">
        <span class="group__icon" data-tone="${C(h)}">${d(u,{size:19})}</span>
        <div class="group__titles">
          <h3 class="group__title">${r(h)}</h3>
          <span class="group__meta" data-group-meta="${r(a)}">${m.join(" · ")}</span>
        </div>
        <span class="group__line" aria-hidden="true"></span>
        <div class="group__actions">
          ${t&&t.description?`<span class="group__meta" style="max-width:26ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r(t.description)}">${r(t.description)}</span>`:""}
          ${g()?`
            <button class="icon-btn" type="button" data-action="add-device" data-cat="${r(t?.id||"")}" aria-label="افزودن دستگاه به ${r(h)}" data-tip="افزودن">
              ${d("add",{size:18})}
            </button>
            ${t?`<button class="icon-btn" type="button" data-action="edit-category" data-cat="${r(t.id)}" aria-label="ویرایش دسته ${r(h)}" data-tip="ویرایش دسته">
              ${d("edit",{size:17})}
            </button>`:""}
          `:`
            <button class="icon-btn" type="button" data-action="filter-cat" data-cat="${r(a)}" aria-label="نمایش فقط ${r(h)}" data-tip="فیلتر">
              ${d("filter_list",{size:17})}
            </button>
          `}
        </div>
      </div>
      ${c.length?`<div class="group__list">${c.map((f,$)=>O(f,$)).join("")}</div>`:`
        <div class="empty" style="padding:28px 16px">
          <div class="empty__desc">هنوز دستگاهی در این دسته ثبت نشده است.</div>
          ${g()?`<button class="btn btn--tonal btn--sm" type="button" data-action="add-device" data-cat="${r(t?.id||"")}">${d("add",{size:17})} افزودن دستگاه</button>`:""}
        </div>`}
      ${e.length>c.length?`
        <div class="load-more" style="margin-top:10px">
          <button class="btn btn--text btn--sm" type="button" data-action="filter-cat" data-cat="${r(a)}">
            نمایش همه ${p(e.length)} دستگاه این دسته
            ${d("chevron_left",{size:16})}
          </button>
        </div>`:""}
    </section>
  `}function O(t,e=0,{showCategory:s=!1}={}){const a=o.data,n=_(a,t.categoryId),i=v(t,a.settings),c=g(),l=(n?.fields||[]).filter(m=>m.showInRow&&y(m,t)).slice(0,4),b=(n?.fields||[]).filter(m=>y(m,t)),h=l.length?l:b.slice(0,2),u=[t.brand,s?n?.title||"سایر":"",t.condition,t.warranty].filter(Boolean);return`
    <article class="device ${i==="out"?"device--oos":""} ${t.featured?"device--featured":""}"
      data-device-id="${r(t.id)}" style="--i:${Math.min(e,12)}"
      ${c?'data-clickable="true" tabindex="-1"':'data-clickable="true" role="button" tabindex="0"'}
      aria-label="${r(t.name)} — مشاهده جزئیات">
      <div class="device__thumb" data-tone="${C(t.name+t.brand)}">
        ${t.image?`<img src="${r(A(t.image))}" alt="" loading="lazy" decoding="async">`:d(n?.icon||"devices_other",{size:26})}
      </div>
      <div class="device__main">
        <div class="device__titleline">
          <h4 class="device__name">${r(t.name)}</h4>
          ${t.featured?`<span class="badge badge--outline" title="پیشنهاد فروشگاه">${d("star",{size:12})} ویژه</span>`:""}
          ${c&&t.hidden?`<span class="badge">${d("visibility_off",{size:12})} پنهان</span>`:""}
        </div>
        ${u.length?`<div class="device__sub">${u.map((m,f)=>`${f?'<span class="dot" aria-hidden="true"></span>':""}<span>${r(m)}</span>`).join("")}</div>`:""}
        ${h.length?`<ul class="device__specs">
          ${h.map(m=>`<li><span class="k">${r(m.label)}</span><span class="v">${r(y(m,t))}</span></li>`).join("")}
        </ul>`:""}
        ${t.note?`<div class="device__note">${r(t.note)}</div>`:""}
      </div>
      <div class="device__side">
        <div class="device__price ${t.priceOnRequest||!a.settings.showPrices||!t.price?"device__price--ask":""}">
          ${gt(t)}
        </div>
        ${c?ft(t):x(t)}
        ${c?`<div class="device__admin">
          <button class="icon-btn" type="button" data-action="edit-device" data-device-id="${r(t.id)}" aria-label="ویرایش ${r(t.name)}" data-tip="ویرایش">
            ${d("edit",{size:17})}
          </button>
          <button class="icon-btn" type="button" data-action="device-menu" data-device-id="${r(t.id)}" aria-label="گزینه‌های بیشتر" data-tip="بیشتر" aria-haspopup="menu">
            ${d("more_vert",{size:17})}
          </button>
        </div>`:`
          <span class="device__chevron" aria-hidden="true" style="color:var(--text-3)">${d("chevron_left",{size:16})}</span>
        `}
      </div>
    </article>
  `}function ft(t){return`
    <button class="stock-jump" type="button" data-action="manage" data-tip="مدیریت در پنل"
            aria-label="مدیریت موجودی ${r(t.name)} در پنل">
      ${x(t)}
      <span class="stock-jump__label">${d("inventory_2",{size:13})}<span class="stock-jump__word">پنل</span></span>
    </button>
  `}function gt(t){return!o.data.settings.showPrices||t.priceOnRequest||!t.price?"<b>استعلام قیمت</b><small>تماس بگیرید</small>":`<b>${p(t.price)}</b><small>${r(M())}</small>`}function P(t){return!o.data.settings.showPrices||t.priceOnRequest||!t.price?"استعلام":`${p(t.price)} ${r(M())}`}function x(t){const e=v(t,o.data.settings),s=o.data.settings.showExactStock,a=e==="out"?"ناموجود":s?`${p(t.stock)} عدد`:e==="low"?"کمیاب":"موجود",n=e==="out"?"موجود نیست":`موجودی: ${p(t.stock)} عدد`,i=e==="out"?"cancel":e==="low"?"warning":"check_circle";return`<span class="stock-badge" data-stock-badge="${r(t.id)}" data-state="${e}" title="${r(n)}">
    <span class="stock-badge__ic" aria-hidden="true">${d(i,{size:13})}</span>${a}
  </span>`}function bt(){const t=o.data?.store||{},e=String(t.phone||"").trim(),s=String(t.whatsapp||"").trim(),a=[];return e&&a.push(`<a class="btn btn--filled btn--sm" href="${r(z(e))}">${d("call",{size:17})} تماس با فروشگاه</a>`),s&&a.push(`<a class="btn btn--outlined btn--sm" href="${r(B(s))}" target="_blank" rel="noopener">${d("chat",{size:17})} واتساپ</a>`),a.length?`<div class="empty__actions">${a.join("")}</div>`:""}function U(t){return t?`
      <div class="empty">
        <span class="empty__icon" data-tone="3">${d("inventory_2",{size:30})}</span>
        <div class="empty__title">لیست موجودی هنوز خالی است</div>
        <div class="empty__desc">
          ${g()?"اولین دستگاه را اضافه کنید تا لیست شما روی سایت منتشر شود.":"فروشنده هنوز دستگاهی ثبت نکرده است. کمی بعد دوباره سر بزنید."}
        </div>
        ${g()?`<div class="empty__actions">
          <button class="btn btn--filled btn--sm" type="button" data-action="add-device">${d("add",{size:17})} افزودن دستگاه</button>
          <button class="btn btn--outlined btn--sm" type="button" data-action="add-category">${d("category",{size:17})} ساخت دسته</button>
        </div>`:bt()}
      </div>`:`
    <div class="empty">
      <span class="empty__icon" data-tone="5">${d("search_off",{size:30})}</span>
      <div class="empty__title">چیزی با این فیلتر پیدا نشد</div>
      <div class="empty__desc">جستجو یا فیلترها را تغییر دهید. شاید دستگاه در دسته دیگری باشد.</div>
      <div class="empty__actions">
        <button class="btn btn--outlined btn--sm" type="button" data-action="clear-filters">${d("refresh",{size:17})} پاک کردن فیلترها</button>
      </div>
    </div>`}function Ct(t){const e=o.data?.devices.find(a=>a.id===t);if(!e)return;document.querySelectorAll(`[data-stock-badge="${CSS.escape(t)}"]`).forEach(a=>{a.outerHTML=x(e)}),document.querySelectorAll(`.device[data-device-id="${CSS.escape(t)}"]`).forEach(a=>{a.classList.toggle("device--oos",e.stock<=0)});const s=document.querySelector('[data-stat="inStock"]');s&&(s.textContent=p(w(o.data,{includeHidden:g()}).inStock)),ht()}function ht(){if(!o.data)return;const t=E(o.data,{includeHidden:g()});document.querySelectorAll("[data-group-meta]").forEach(e=>{const s=e.dataset.groupMeta,a=k(o.data,{includeHidden:g()}).filter(l=>(l.categoryId||"__none__")===s);if(!a.length&&!t.get(s))return;const n=a.filter(l=>l.stock>0).length,i=a.filter(l=>l.hidden).length,c=[`${p(a.length)} دستگاه`,`${p(n)} موجود`];g()&&i&&c.push(`${p(i)} پنهان`),e.textContent=c.join(" · ")})}function It(){R({animate:!1}),F(),D(),N(),T()}function Et({animateStats:t=!0}={}){o.data&&(I(),nt(),at(),R({animate:t}),F(),it(),D(),N(),ot(),document.documentElement.dataset.ready="true")}function At(t){const e=o.data?.devices.find(u=>u.id===t);if(!e)return;const s=_(o.data,e.categoryId),a=v(e,o.data.settings),n=(s?.fields||[]).filter(u=>y(u,e)),i=g(),c=`${location.origin}${location.pathname}#device-${e.id}`,l=B(o.data.store.whatsapp,`سلام! درباره «${e.name}» (${e.stock>0?"موجود":"ناموجود"}) در ${o.data.store.name} سوال داشتم.`),b=[["دسته‌بندی",s?.title||"سایر"],["برند",e.brand],["وضعیت",e.condition],["گارانتی",e.warranty],...n.map(u=>[u.label,y(u,e)]),...W(e).map(u=>[u.label,u.value])].filter(([,u])=>u),h=q({title:e.name,subtitle:[e.brand,s?.title].filter(Boolean).join(" · "),size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="detail__media">
          ${e.image?`<img src="${r(A(e.image))}" alt="${r(e.name)}" style="width:100%;height:100%;object-fit:cover;position:relative;z-index:1">`:d(s?.icon||"devices_other",{size:62})}
        </div>
        <div class="detail__headline">
          <div class="detail__price-row">
            <span class="detail__price">${P(e)}</span>
            ${x(e)}
            ${e.featured?`<span class="badge badge--outline">${d("star",{size:12})} پیشنهاد فروشگاه</span>`:""}
          </div>
          ${e.note?`<p class="t-sm" style="color:var(--text-2);line-height:1.9">${r(e.note)}</p>`:""}
        </div>
        <div class="spec-table" role="table" aria-label="مشخصات ${r(e.name)}">
          ${b.map(([u,m])=>`<div class="spec-table__row" role="row"><span class="k" role="cell">${r(u)}</span><span class="v" role="cell">${r(m)}</span></div>`).join("")}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn--filled btn--sm" type="button" data-action="call-store">${d("call",{size:17})} تماس برای خرید</button>
          ${l?`<a class="btn btn--tonal btn--sm" href="${r(l)}" target="_blank" rel="noopener">${d("chat",{size:17})} واتساپ</a>`:""}
          <button class="btn btn--outlined btn--sm" type="button" data-copy-link="${r(c)}">${d("link",{size:17})} کپی لینک</button>
          ${i?`<button class="btn btn--tonal btn--sm" type="button" data-edit-device="${r(e.id)}">${d("edit",{size:17})} ویرایش</button>`:""}
        </div>
        <p class="t-xs t-muted" style="line-height:1.9">
          آخرین تغییر این دستگاه: ${S(e.updatedAt)}
          ${a==="out"?" · همین حالا ناموجود است":""}
        </p>
      </div>
    `});h.el.addEventListener("click",u=>{if(u.target.closest('[data-action="call-store"]')){const $=o.data.store.phone;$?location.href=z($):Z("شماره تماس ثبت نشده است",{type:"warn"})}const m=u.target.closest("[data-copy-link]");m&&H(m.dataset.copyLink,"لینک دستگاه کپی شد");const f=u.target.closest("[data-edit-device]");f&&(h.close(),document.dispatchEvent(new CustomEvent("ol:edit-device",{detail:{id:f.dataset.editDevice}})))})}function zt(){if(!o.data)return;const t=[...o.data.meta.history||[]];t.length||t.push({id:"seed",at:o.data.meta.updatedAt,by:o.data.meta.updatedBy,action:"seed",summary:"راه‌اندازی اولیه لیست موجودی"});const e=t.slice(0,30);q({title:"تاریخچه به‌روزرسانی",subtitle:"هر انتشار، با تاریخ و ساعت ثبت می‌شود",size:"narrow",body:`
      <div class="timeline">
        ${e.map((s,a)=>`
          <div class="timeline__item">
            <div class="timeline__row">
              <span class="timeline__action">${a===0?"آخرین به‌روزرسانی":r($t(s.action))}</span>
              <span class="timeline__date">${S(s.at)}</span>
            </div>
            <div class="timeline__desc">${r(s.summary||"به‌روزرسانی لیست")}</div>
            <div class="timeline__by">توسط ${r(s.by||"مدیر فروشگاه")}
              ${s.stats?` · ${p(s.stats.added||0)} جدید، ${p(s.stats.updated||0)} ویرایش، ${p(s.stats.removed||0)} حذف`:""}
            </div>
          </div>
        `).join("")}
      </div>
      <div class="form-note" style="margin-top:8px">
        ${d("info",{size:18})}
        <span>این تاریخچه همراه فایل داده منتشر می‌شود؛ تغییرات همیشه قابل پیگیری است.</span>
      </div>
    `})}function $t(t){return{publish:"انتشار تغییرات",seed:"راه‌اندازی اولیه",import:"بازیابی نسخه پشتیبان"}[t]||"به‌روزرسانی"}function Bt(){const t=location.href.split("#")[0],e=o.data?.store||{},s=`${e.name||"فروشگاه"} — لیست موجودی
${t}`,a=e.whatsapp?`https://wa.me/?text=${encodeURIComponent(s)}`:"",n=`https://t.me/share/url?url=${encodeURIComponent(t)}&text=${encodeURIComponent(`${e.name||"فروشگاه"} — لیست موجودی`)}`;q({title:"اشتراک‌گذاری لیست",subtitle:"لینک این صفحه را برای مشتری بفرستید",size:"narrow",body:`
      <div class="stack" style="gap:12px">
        <p class="t-sm" style="color:var(--text-2);line-height:1.9">با اشتراک‌گذاری این لینک، مشتری همیشه آخرین نسخه موجودی را می‌بیند.</p>
        <div class="code-block">${r(t)}<button class="icon-btn" type="button" data-copy-link="${r(t)}" aria-label="کپی">${d("content_copy",{size:16})}</button></div>
        <div class="share-row">
          ${a?`<a class="btn btn--tonal btn--sm" href="${r(a)}" target="_blank" rel="noopener">${d("chat",{size:17})} واتساپ</a>`:""}
          <a class="btn btn--tonal btn--sm" href="${r(n)}" target="_blank" rel="noopener">${d("share",{size:17})} تلگرام</a>
          ${navigator.share?`<button class="btn btn--outlined btn--sm" type="button" data-native-share>${d("share",{size:17})} سایر اپ‌ها</button>`:""}
        </div>
        ${g()?`<div class="form-note">${d("info",{size:18})}<span>در حالت مدیریت، لینک شامل وضعیت اجرای شما نیست؛ فقط لیست عمومی را ارسال می‌کند.</span></div>`:""}
      </div>
    `,onMount:i=>{i.el.addEventListener("click",async c=>{const l=c.target.closest("[data-copy-link]");if(l&&H(l.dataset.copyLink,"لینک کپی شد"),c.target.closest("[data-native-share]"))try{await navigator.share({title:o.data.store.name,text:"لیست موجودی",url:t})}catch{}})}})}export{I as hydrateIcons,lt as isGroupedView,p as num,L as numerals,At as openDeviceDetail,zt as openHistory,Bt as openShareSheet,It as patchAfterListMutation,Ct as patchDeviceStock,Et as renderAll,at as renderBranding,it as renderFeatured,D as renderFilters,T as renderFooter,ht as renderGroupMeta,nt as renderHeader,N as renderList,ot as renderPrintMeta,R as renderStats,F as renderUpdateCard,x as stockBadgeHtml,St as updateThemeIcon,ct as visibleFilteredDevices};
