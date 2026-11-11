import{ApiError as oe,createGitHub as ye,fetchVault as yt,isValidRepoPart as we,looksLikeToken as Ue,parseJsonLoose as wt}from"./api.js";import{cryptoAvailable as $t,estimateCrackSeconds as $e,isVault as kt,openVault as Ve,passwordScore as Ge,sealVault as _t}from"./crypto.js";import{CATEGORY_ICONS as St,CONDITION_OPTIONS as Je,CREDENTIAL_RESET_PHRASE as ie,FIELD_PRESETS as xt,RESET_PHRASE as le,clearInventory as zt,computeDiff as ke,defaultCategory as Et,defaultField as Ke,deviceExtraSpecs as We,diffHeadline as Ye,getCategory as Qe,makeDefaultData as Xe,normalizeStore as Ze,parseStoreJson as et,presetFields as qt,serializeStore as re,stampMeta as tt}from"./model.js";import{clearDraft as at,currentNumerals as M,discardDraftAndReset as It,endAdminSession as st,flushDraftNow as nt,isAdmin as F,isDemo as V,markPublished as Lt,mutate as P,persistDraft as Dt,readDraft as Ft,refreshDirty as ot,replaceData as it,startAdminSession as lt,state as s}from"./state.js";import{alertDialog as _e,confirmDialog as G,fieldError as E,openMenu as Se,openSheet as L,setButtonBusy as x,toast as g}from"./ui.js";import{deepClone as xe,download as ce,escapeHtml as f,formatCrackTime as ze,formatJalaliDateTime as rt,formatJalaliStamp as X,formatNum as O,parseNumber as Ee,slugify as ct,storageGet as Rt,storageSet as dt,toCsv as Ct,toFaDigits as Tt,uid as Z}from"./util.js";import{icon as r}from"./icons.js";import{hydrateIcons as At}from"./render.js";const Nt=new Set(["login","logout","admin-menu","add-menu","manage","publish","discard","settings","security","add-device","edit-device","device-menu","add-category","edit-category","export-backup","import-backup","lock","demo-exit"]),qe="ol.loginGate.v1",Ie=7*86400,Mt=365*86400;function k({label:e,name:t,value:a="",type:o="text",placeholder:n="",hint:i="",required:c=!1,ltr:m=!1,inputmode:l="",autocomplete:d="off",maxlength:u=0,rows:p=0,min:S=null,max:I=null,step:b=null}={}){const v=p?`<textarea class="textarea" name="${f(t)}" rows="${p}" placeholder="${f(n)}" ${c?"required":""}>${f(a)}</textarea>`:`<input class="input" name="${f(t)}" type="${f(o)}" value="${f(a)}"
        placeholder="${f(n)}" ${c?"required":""} ${m?'dir="ltr"':""}
        ${l?`inputmode="${f(l)}"`:""} autocomplete="${f(d)}"
        ${u?`maxlength="${u}"`:""} ${S!=null?`min="${S}"`:""}
        ${I!=null?`max="${I}"`:""} ${b!=null?`step="${b}"`:""}>`;return`
    <label class="field">
      <span class="field__label">${f(e)}${c?'<span class="req" aria-hidden="true">*</span>':""}</span>
      ${v}
      ${i?`<span class="field__hint">${f(i)}</span>`:""}
      <span class="field__error"></span>
    </label>`}function de({label:e,name:t,value:a="",options:o=[],hint:n="",required:i=!1}){return`
    <label class="field">
      <span class="field__label">${f(e)}${i?'<span class="req" aria-hidden="true">*</span>':""}</span>
      <select class="select" name="${f(t)}" ${i?"required":""}>
        ${o.map(c=>`<option value="${f(c.value)}" ${String(c.value)===String(a)?"selected":""}>${f(c.label)}</option>`).join("")}
      </select>
      ${n?`<span class="field__hint">${f(n)}</span>`:""}
      <span class="field__error"></span>
    </label>`}function ue({label:e,name:t,checked:a=!1,hint:o=""}){return`
    <div class="field" style="gap:5px">
      <label class="switch">
        <input type="checkbox" name="${f(t)}" ${a?"checked":""}>
        <span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>
        <span>${f(e)}</span>
      </label>
      ${o?`<span class="field__hint">${f(o)}</span>`:""}
    </div>`}function j(e){return`<div class="form-note form-note--danger" data-form-error hidden>${r("error",{size:18})}<span>${f(e)}</span></div>`}function z(e,t){const a=e.el.querySelector("[data-form-error]");if(!a){g(t,{type:"err"});return}a.hidden=!1,a.querySelector("span")?.replaceChildren(document.createTextNode(t)),a.scrollIntoView({block:"nearest",behavior:"smooth"})}function H(e){const t=e.el.querySelector("[data-form-error]");t&&(t.hidden=!0)}const ba=e=>e.el.querySelector("form"),w=(e,t)=>String(e.elements.namedItem(t)?.value??"").trim(),ee=(e,t)=>!!e.elements.namedItem(t)?.checked,Le=e=>e?`${e.owner}/${e.repo} · ${e.branch}`:"—";function De(e){const t=String(e?.branch||"main").trim()||"main",a=String(e?.owner||"").trim(),o=String(e?.repo||"").trim();return!we(a)||!we(o)||!we(t)?null:{owner:a,repo:o,branch:t}}function Fe(){const e=Rt(qe,null);return e&&typeof e=="object"?{fails:Number(e.fails)||0,until:Number(e.until)||0}:{fails:0,until:0}}function Ot(){const e=Fe();return e.fails+=1,e.fails>=5&&(e.until=Date.now()+Math.min(5*6e4,3e4*2**(e.fails-5))),dt(qe,e),e}function Re(){dt(qe,{fails:0,until:0})}let pe=null;async function Pt(){if(s.vault)return{vault:s.vault,url:s.vaultUrl};pe||(pe=yt(s.site||{}));const e=await pe;return pe=null,e?.vault&&kt(e.vault)?(s.vault=e.vault,s.vaultUrl=e.url,e):{vault:null,url:e?.url||null}}async function A(){if(F())return;const e=document.getElementById("loginBtn");x(e,!0,"بررسی…");try{const{vault:t}=await Pt();t?Ht(t):jt()}catch(t){g(t.message||"بررسی تنظیمات ناموفق بود",{type:"err"})}finally{x(e,!1)}}function jt(){const e=s.site||{},t=e.owner&&e.repo?`${e.owner}/${e.repo}`:"مخزن شما";return L({title:"ورود مدیر",subtitle:"اولین بار است؟ رمز مدیریت را به توکن گیت‌هاب وصل کنید",size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${r("key",{size:24})}</span>
          <div>
            <div class="login-hero__title">هنوز رمز مدیریت ساخته نشده</div>
            <div class="login-hero__sub">در صفحه راه‌اندازی، یک توکن گیت‌هاب بسازید و آن را با یک رمز عبور سینک کنید. رمز و توکن فقط رمزگذاری‌شده در مخزن ${f(t)} ذخیره می‌شوند.</div>
          </div>
        </div>
        <ol class="stack" style="gap:10px;padding-inline-start:18px;list-style:decimal;font-size:var(--fs-xs);color:var(--text-2);line-height:1.9">
          <li>یک توکن Fine-grained با دسترسی <b>Contents: Read and write</b> بسازید.</li>
          <li>در صفحه راه‌اندازی، توکن و رمز دلخواه را وارد و ذخیره کنید.</li>
          <li>به سایت برگردید و با همان رمز وارد شوید.</li>
        </ol>
        <div class="form-note">
          ${r("info",{size:18})}
          <span>اگر قبلاً توکن را سینک کرده‌اید ولی سایت فایل امنیتی را پیدا نمی‌کند، مقدار مخزن را در <span dir="ltr">data/site.json</span> بررسی کنید.</span>
        </div>
      </div>
    `,footer:`
      <button class="btn btn--text btn--sm" type="button" data-token-login>${r("key",{size:17})} ورود موقت با توکن</button>
      <span class="spacer"></span>
      <button class="btn btn--outlined btn--sm" type="button" data-demo>${r("visibility",{size:17})} پیش‌نمایش</button>
      <a class="btn btn--filled btn--sm" href="setup/">${r("rocket_launch",{size:17})} صفحه راه‌اندازی</a>
    `,onMount:o=>{o.el.querySelector("[data-token-login]")?.addEventListener("click",()=>{o.close(),Ce()}),o.el.querySelector("[data-demo]")?.addEventListener("click",()=>{o.close(),Ut()})}})}function Ht(e){const t=Fe(),a=Math.max(0,Math.ceil((t.until-Date.now())/1e3)),o=De(e.repo);return L({title:"ورود مدیر",subtitle:o?Le(o):"مخزن تنظیم نشده",size:"narrow",body:`
      <form id="loginForm" class="stack" style="gap:16px" novalidate>
        <div class="login-hero">
          <span class="login-hero__icon">${r("lock",{size:24})}</span>
          <div>
            <div class="login-hero__title">رمز مدیریت را وارد کنید</div>
            <div class="login-hero__sub">رمز در همین مرورگر، توکن ذخیره‌شده در فایل امنیتی را باز می‌کند. رمز هیچ‌جا ارسال نمی‌شود.</div>
          </div>
        </div>
        ${j("رمز یا اتصال ناموفق بود.")}
        ${e.hint?`<div class="form-note">${r("info",{size:18})}<span>یادآور شما: ${f(e.hint)}</span></div>`:""}
        <div class="field">
          <span class="field__label">رمز عبور</span>
          <div class="password-wrap">
            <input class="input" type="password" name="password" id="loginPassword" autocomplete="current-password"
                   placeholder="••••••••" required autofocus>
            <button class="icon-btn" type="button" data-toggle-password aria-label="نمایش رمز">
              ${r("visibility",{size:19})}
            </button>
          </div>
          <span class="field__error"></span>
        </div>
        ${a?`<div class="form-note form-note--danger">${r("warning",{size:18})}<span data-lock-msg>تلاش‌های ناموفق زیاد بوده؛ ${O(a,M())} ثانیه صبر کنید.</span></div>`:""}
        <div class="form-note">
          ${r("security",{size:18})}
          <span>رمز را فراموش کرده‌اید؟ رمز هیچ‌جا ذخیره نمی‌شود، اما با
            <button class="linklike" type="button" data-forgot>راهنمای بازیابی</button>
            می‌توانید از نو رمز بسازید.</span>
        </div>
        <div class="form-note">
          ${r("help",{size:18})}
          <span>اولین بار است؟ <a href="help/" target="_blank" rel="noopener" style="text-decoration:underline">راهنمای تصویری مدیر</a> قدم‌به‌قدم توضیح داده است.</span>
        </div>
      </form>
    `,footer:`
      <button class="btn btn--text btn--sm" type="button" data-token-login>ورود موقت با توکن</button>
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="loginForm" data-submit>${r("lock_open",{size:17})} ورود</button>
    `,onMount:i=>{const c=i.el.querySelector("#loginForm"),m=i.el.querySelector("[data-submit]");i.el.querySelector("[data-toggle-password]")?.addEventListener("click",l=>{const d=i.el.querySelector("#loginPassword"),u=d.type==="password";d.type=u?"text":"password",l.currentTarget.innerHTML=r(u?"visibility_off":"visibility",{size:19}),l.currentTarget.setAttribute("aria-label",u?"پنهان کردن رمز":"نمایش رمز"),d.focus()}),i.el.querySelector("[data-token-login]")?.addEventListener("click",()=>{i.close(),Ce()}),i.el.querySelector("[data-forgot]")?.addEventListener("click",()=>{i.close(),Bt()}),c.addEventListener("submit",async l=>{l.preventDefault(),H(i);const d=c.elements.namedItem("password").value,u=c.elements.namedItem("password");if(E(u,""),!d){E(u,"رمز عبور را وارد کنید."),u.focus();return}if(!$t()){z(i,"رمزنگاری مرورگر در دسترس نیست. سایت را روی HTTPS باز کنید.");return}const p=Fe();if(p.until>Date.now()){z(i,`تلاش‌های ناموفق زیاد بوده؛ ${O(Math.ceil((p.until-Date.now())/1e3),M())} ثانیه دیگر تلاش کنید.`);return}if(!o){z(i,"اطلاعات مخزن در فایل امنیتی کامل نیست. صفحه راه‌اندازی را دوباره اجرا کنید.");return}x(m,!0,"در حال باز کردن…");try{await ut({vault:e,password:d,repo:o}),Re(),i.close()}catch(S){if(x(m,!1),S?.code==="bad-password"){const I=Ot(),b=Math.ceil((I.until-Date.now())/1e3);E(u,"رمز عبور نادرست است."),z(i,b>0?`رمز نادرست است. برای جلوگیری از حدس زدن، ${O(b,M())} ثانیه صبر کنید.`:"رمز عبور نادرست است. دوباره تلاش کنید."),u.select()}else z(i,S?.message||"ورود ناموفق بود.")}})}})}async function ut({vault:e,password:t,repo:a,token:o=null,adminName:n=""}){let i=o;if(!i){const h=await Ve(e,t);i=h.token,!n&&h.login&&(n="")}const c=ye({token:i,...a});if(!(await c.getBranch(a.branch)).exists)throw new oe(`شاخه «${a.branch}» در مخزن پیدا نشد.`,{code:"branch"});if((await c.getRepo()).canPush===!1)throw new oe("توکن فقط دسترسی خواندن دارد. در تنظیمات توکن، Contents را روی Read and write بگذارید.",{code:"forbidden"});const[d,u]=await Promise.all([c.getFile("data/store.json"),c.getUser()]);let p=Xe(),S=null,I=!1;if(d){try{const{value:h,repaired:y}=wt(d.text);p=et(y?JSON.stringify(h):d.text),y&&(I=!0)}catch{throw new oe("فایل data/store.json در مخزن معتبر نیست. لطفاً نسخه پشتیبان را بررسی کنید.",{code:"bad-data"})}S=d.sha}const b=Ft(a);let v=p,$=!1;if(b&&b.data)try{const h=Ze(b.data);re(h)!==re(p)&&(await G({title:"تغییرات منتشرنشده پیدا شد",message:"از نشست قبلی تغییراتی مانده که روی سایت نرفته است. بازیابی شود؟",confirmText:"بازیابی کن",cancelText:"دور بریز",details:`${r("info",{size:18})}<span>تا وقتی «اعمال تغییرات» را نزنید، این تغییرات روی سایت دیده نمی‌شوند.</span>`})?(v=h,$=!0):at(a))}catch{}const _=n.trim()||s.data?.settings?.adminName||u.name||u.login||"مدیر فروشگاه";return lt({data:v,baseline:p,sha:S,site:s.site,repo:a,api:c,user:{name:_,login:u.login||"",avatarUrl:u.avatarUrl||""},vault:e||null,vaultUrl:s.vaultUrl||null,mode:"admin"}),ot(),$?(Dt(),g("تغییرات ذخیره‌نشده‌ی قبلی بازیابی شد. برای انتشار، دکمه «انتشار» را بزنید.",{type:"warn",duration:6e3})):g(`خوش آمدید${_?`، ${_}`:""}`,{type:"ok"}),I&&g("فایل لیست روی مخزن قالب قدیمی دارد؛ با اولین «انتشار» به‌صورت خودکار اصلاح می‌شود.",{type:"info",duration:9e3}),s.sha||(s.sha=null),J().catch(h=>console.error("[manage]",h)),!0}function Ce(){if(F())return;const e=s.repo||De(s.vault?.repo)||{};L({title:"ورود موقت با توکن",subtitle:"برای عیب‌یابی یا وقتی رمز را فراموش کرده‌اید",size:"narrow",body:`
      <form id="tokenForm" class="stack" style="gap:14px" novalidate>
        <div class="form-note">
          ${r("warning",{size:18})}
          <span>توکن فقط در حافظه همین تب نگه داشته می‌شود و با بستن صفحه پاک می‌شود. برای استفاده روزمره، صفحه راه‌اندازی را کامل کنید.</span>
        </div>
        ${k({label:"توکن گیت‌هاب",name:"token",placeholder:"github_pat_… یا ghp_…",required:!0,ltr:!0,autocomplete:"off"})}
        <div class="grid-2">
          ${k({label:"مالک مخزن",name:"owner",value:e.owner||"",ltr:!0,required:!0,placeholder:"username"})}
          ${k({label:"نام مخزن",name:"repo",value:e.repo||"",ltr:!0,required:!0,placeholder:"Online_list"})}
        </div>
        <div class="grid-2">
          ${k({label:"شاخه",name:"branch",value:e.branch||"main",ltr:!0,required:!0})}
          ${k({label:"نام نمایشی مدیر",name:"adminName",value:s.data?.settings?.adminName||"",placeholder:"مدیر فروشگاه"})}
        </div>
        ${j("")}
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="tokenForm" data-submit>${r("login",{size:17})} اتصال</button>
    `,onMount:t=>{const a=t.el.querySelector("#tokenForm"),o=t.el.querySelector("[data-submit]");a.addEventListener("submit",async n=>{n.preventDefault(),H(t);const i={token:w(a,"token"),owner:w(a,"owner"),repo:w(a,"repo"),branch:w(a,"branch")||"main",adminName:w(a,"adminName")},c=a.elements.namedItem("token");if(!Ue(i.token)){E(c,"این مقدار شبیه توکن گیت‌هاب نیست."),c.focus();return}const m=De(i);if(!m){z(t,"نام مالک، مخزن یا شاخه معتبر نیست.");return}x(o,!0,"در حال اتصال…");try{await ut({vault:null,repo:m,token:i.token,adminName:i.adminName}),t.close(),g("با توکن وارد شدید. برای ساخت رمز تازه: تنظیمات ← رمز و توکن ← ریست کلی رمزها",{type:"info",duration:7e3})}catch(l){x(o,!1),z(t,l?.message||"اتصال ناموفق بود.")}})}})}function Bt(){L({title:"رمز را فراموش کرده‌اید؟",subtitle:"رمز ذخیره نمی‌شود؛ پس بازیابی یعنی ساختن رمز تازه",size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="form-note">
          ${r("info",{size:18})}
          <span>مرورگر با PBKDF2 از رمز شما کلید می‌سازد و فقط نسخهٔ رمزگذاری‌شدهٔ توکن در مخزن می‌ماند.
          بدون رمز آن فایل باز نمی‌شود؛ پس «بازیابی رمز» وجود ندارد و باید رمز تازه بسازید.</span>
        </div>
        <div class="sheet__section">
          <div class="sheet__legend">${r("key",{size:18})} راه اول — توکن گیت‌هاب را دارید</div>
          <ol class="cred-steps">
            <li><span class="cred-steps__num">۱</span><b>ورود موقت با توکن</b> را بزنید و توکن فعلی را وارد کنید.</li>
            <li><span class="cred-steps__num">۲</span>تنظیمات ← رمز و توکن ← <b>ریست کلی رمزها</b>؛ فایل امنیتی از مخزن حذف می‌شود.</li>
            <li><span class="cred-steps__num">۳</span>صفحهٔ راه‌اندازی را روی رایانه باز کنید و <b>توکن تازه + رمز تازه</b> بسازید.</li>
          </ol>
        </div>
        <div class="sheet__section">
          <div class="sheet__legend">${r("warning",{size:18})} راه دوم — توکن را هم ندارید</div>
          <p class="danger-zone__desc">
            یک توکن تازه در
            <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" dir="ltr">github.com/settings/tokens</a>
            بسازید، بعد <a href="setup/">صفحهٔ راه‌اندازی</a> را روی رایانه اجرا کنید؛ فایل امنیتی با رمز تازه
            بازنویسی می‌شود. لیست کالاها، دسته‌ها و تنظیمات فروشگاه دست نمی‌خورد.
          </p>
        </div>
      </div>
    `,footer:`
      <button class="btn btn--text btn--sm" type="button" data-token>ورود موقت با توکن</button>
      <span class="spacer"></span>
      <button class="btn btn--filled btn--sm" type="button" data-close>فهمیدم</button>
    `,onMount:e=>{e.el.querySelector("[data-token]")?.addEventListener("click",()=>{e.close(),Ce()})}})}function Ut(){const e=Ze(s.data||Xe());lt({data:e,baseline:e,sha:null,site:s.site,repo:s.repo,api:null,user:{name:"پیش‌نمایش"},vault:null,vaultUrl:null,mode:"demo"}),g("حالت پیش‌نمایش فعال شد؛ تغییرات ذخیره یا منتشر نمی‌شوند.",{type:"info",duration:6e3}),J().catch(t=>console.error("[manage]",t))}async function me(){s.dirty&&!await G({title:"خروج از حالت مدیریت",message:"تغییرات منتشرنشده دارید. با خروج، این تغییرات از بین می‌رود.",confirmText:"خروج بدون انتشار",danger:!0})||(st(),document.querySelectorAll("dialog.sheet[open]").forEach(e=>{try{e.close()}catch{}}),g("از حالت مدیریت خارج شدید",{type:"ok"}))}function Vt(e){const t=[{label:"پنل مدیریت",icon:"inventory_2",onSelect:J},{separator:!0},{label:"تنظیمات فروشگاه",icon:"settings",onSelect:te},{label:"رمز و توکن",icon:"key",onSelect:Y},{label:"نسخه پشتیبان",icon:"download",onSelect:ae},{label:"راهنمای مدیر",icon:"help",onSelect:Ne},{label:"تاریخچه",icon:"history",onSelect:()=>document.dispatchEvent(new CustomEvent("ol:history"))}];s.dirty&&(t.push({separator:!0}),t.push({label:"بازگردانی تغییرات",icon:"replay",onSelect:he})),t.push({separator:!0}),t.push({label:"بازنشانی لیست",icon:"delete",danger:!0,onSelect:ve}),t.push({label:V()?"خروج از پیش‌نمایش":"قفل کردن",icon:V()?"logout":"lock",danger:!0,onSelect:me}),Se(e,t)}function Gt(e){Se(e,[{heading:"افزودن"},{label:"دستگاه جدید",icon:"add",onSelect:()=>B({})},{label:"دسته‌بندی جدید",icon:"category",onSelect:()=>W({})},{separator:!0},{label:"تنظیمات فروشگاه",icon:"settings",onSelect:te},{label:"رمز و توکن",icon:"key",onSelect:Y}],{align:"start"})}function Jt(e,t){const a=s.data?.devices.find(i=>i.id===t);if(!a)return;const o=s.data.devices.filter(i=>i.categoryId===a.categoryId).sort((i,c)=>i.order-c.order),n=o.findIndex(i=>i.id===t);Se(e,[{label:"ویرایش دستگاه",icon:"edit",onSelect:()=>B({id:t})},{label:"تکثیر",icon:"content_copy",onSelect:()=>Kt(t)},{label:"انتقال به بالای دسته",icon:"arrow_upward",disabled:n<=0,onSelect:()=>mt(t,-1)},{label:"انتقال به پایین دسته",icon:"arrow_downward",disabled:n<0||n>=o.length-1,onSelect:()=>mt(t,1)},{separator:!0},{label:a.hidden?"نمایش در سایت":"پنهان کردن از سایت",icon:a.hidden?"visibility":"visibility_off",onSelect:()=>pt(t,"hidden")},{label:a.featured?"حذف از پیشنهادها":"افزودن به پیشنهادها",icon:"star",onSelect:()=>pt(t,"featured")},{separator:!0},{label:"حذف دستگاه",icon:"delete",danger:!0,onSelect:()=>Wt(t)}],{align:"end"})}function pt(e,t){P(a=>{const o=a.devices.find(n=>n.id===e);o&&(o[t]=!o[t],o.updatedAt=new Date().toISOString())},"data"),g("ذخیره شد؛ برای اعمال روی سایت منتشر کنید.",{type:"ok"})}function mt(e,t){P(a=>{const o=a.devices.find(u=>u.id===e);if(!o)return;const n=a.devices.filter(u=>u.categoryId===o.categoryId).sort((u,p)=>u.order-p.order),i=n.findIndex(u=>u.id===e),c=n[i+t];if(!c)return;const m=n[i],l=c,d=m.order;m.order=l.order,l.order=d,m.order===l.order&&n.forEach((u,p)=>{u.order=p}),m.updatedAt=new Date().toISOString()},"data")}function Kt(e){const t=s.data?.devices.find(a=>a.id===e);t&&(P(a=>{const o=new Date().toISOString(),n=a.devices.reduce((i,c)=>Math.max(i,c.order),0);a.devices.push({...xe(t),id:Z("dev"),name:`${t.name} (کپی)`,featured:!1,hidden:!0,order:n+1,createdAt:o,updatedAt:o})},"data"),g("یک نسخه کپی ساخته شد (پنهان). برای ویرایش، آن را باز کنید.",{type:"ok",duration:4200}))}async function Wt(e){const t=s.data?.devices.find(o=>o.id===e);!t||!await G({title:"حذف دستگاه",message:`«${t.name}» از لیست حذف می‌شود. این تغییر بعد از انتشار روی سایت اعمال می‌شود.`,confirmText:"حذف کن",danger:!0})||(P(o=>{o.devices=o.devices.filter(n=>n.id!==e)},"data"),g("دستگاه حذف شد. برای اعمال، منتشر کنید.",{type:"ok"}))}function B({id:e=null,categoryId:t=""}={}){if(!F()){A();return}if(!s.data.categories.length){L({title:"اول یک دسته بسازید",size:"narrow",body:'<p class="t-sm" style="color:var(--text-2);line-height:1.9">دستگاه‌ها داخل دسته‌بندی‌ها قرار می‌گیرند. قبل از افزودن دستگاه، حداقل یک دسته بسازید.</p>',footer:`<span class="spacer"></span><button class="btn btn--filled btn--sm" type="button" data-new-cat>${r("category",{size:17})} ساخت دسته</button>`,onMount:l=>l.el.querySelector("[data-new-cat]")?.addEventListener("click",()=>{l.close(),W({})})});return}const a=e?s.data.devices.find(l=>l.id===e):null;if(e&&!a){g("دستگاه پیدا نشد",{type:"err"});return}const o=!a,n=a||{name:"",brand:"",categoryId:t||s.data.categories[0]?.id||"",price:0,priceOnRequest:!1,stock:1,condition:"نو",warranty:"",specs:{},note:"",image:"",featured:!1,hidden:!1},i=[...s.data.categories.map(l=>({value:l.id,label:l.title})),{value:"",label:"بدون دسته"}],c=Je.map(l=>({value:l,label:l}));return L({title:o?"افزودن دستگاه":"ویرایش دستگاه",subtitle:o?"اطلاعات دستگاه را کامل کنید":n.name,size:"wide",body:`
      <form id="deviceForm" class="sheet__section" novalidate>
        ${j("")}
        <div class="grid-2">
          ${k({label:"نام دستگاه",name:"name",value:n.name,required:!0,maxlength:120,placeholder:"مثلاً آیفون ۱۶ پرو مکس ۲۵۶ گیگ"})}
          ${k({label:"برند",name:"brand",value:n.brand,maxlength:60,placeholder:"Apple"})}
        </div>
        <div class="grid-2">
          ${de({label:"دسته‌بندی",name:"categoryId",value:n.categoryId,options:i,required:!1})}
          ${de({label:"وضعیت کالا",name:"condition",value:n.condition,options:c})}
        </div>
        <div class="grid-2">
          ${k({label:"قیمت",name:"price",value:n.price?String(n.price):"",type:"text",inputmode:"numeric",ltr:!0,hint:`به ${s.data.settings.currency||"تومان"} — خالی یا صفر یعنی «استعلام قیمت»`})}
          ${k({label:"موجودی",name:"stock",value:String(n.stock),type:"number",min:0,max:9999,step:1,ltr:!0,hint:"تعداد دستگاه موجود در انبار"})}
        </div>
        <label class="check check--card">
          <input type="checkbox" name="priceOnRequest" ${n.priceOnRequest?"checked":""}>
          <span>قیمت را اعلام نکنید و به‌جای آن «استعلام قیمت» نمایش داده شود.</span>
        </label>
        <div class="grid-2">
          ${k({label:"گارانتی",name:"warranty",value:n.warranty,maxlength:80,placeholder:"۱۸ ماه گارانتی شرکتی"})}
          ${k({label:"آدرس تصویر (اختیاری)",name:"image",value:n.image,ltr:!0,autocomplete:"off",placeholder:"https://…",hint:"اگر خالی باشد، آیکون دسته نمایش داده می‌شود."})}
        </div>

        <fieldset class="sheet__section spec-section">
          <legend class="sheet__legend">${r("tune",{size:18})} مشخصات کالا</legend>
          <p class="spec-section__hint">فقط همین چند فیلد را پر کنید؛ عنوان‌ها از دستهٔ انتخاب‌شده می‌آیند.</p>
          <div id="specsHost" class="grid-2"></div>
        </fieldset>

        <fieldset class="sheet__section spec-section">
          <legend class="sheet__legend">${r("edit_note",{size:18})} مشخصات اضافه (اختیاری)</legend>
          <p class="spec-section__hint">اگر این کالا چیز خاصی دارد که در فیلدهای دسته نیست، همین‌جا برای همین آگهی اضافه کنید.</p>
          <div id="extraSpecsHost" class="extra-specs"></div>
          <div>
            <button class="btn btn--text btn--sm" type="button" data-add-extra>${r("add",{size:17})} افزودن مشخصهٔ دلخواه</button>
          </div>
        </fieldset>

        <div class="sheet__section">
          <div class="sheet__legend">${r("edit_note",{size:18})} توضیح و نمایش</div>
          ${k({label:"توضیح کوتاه",name:"note",value:n.note,rows:2,maxlength:400,placeholder:"مثلاً: تک‌سیم، باتری ۱۰۰٪، همراه با جعبه"})}
          <div class="grid-2">
            ${ue({label:"نمایش در پیشنهادهای ویژه",name:"featured",checked:n.featured})}
            ${ue({label:"پنهان کردن از سایت",name:"hidden",checked:n.hidden,hint:"برای آماده‌سازی قبل از انتشار"})}
          </div>
        </div>
      </form>
    `,footer:`
      ${o?"":`<button class="btn btn--text btn--sm" type="button" data-delete style="color:var(--danger)">${r("delete",{size:17})} حذف</button>`}
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="deviceForm" data-save>${r("check",{size:17})} ${o?"افزودن":"ذخیره"}</button>
    `,onMount:l=>{const d=l.el.querySelector("#deviceForm"),u=l.el.querySelector("#specsHost"),p=l.el.querySelector("#extraSpecsHost"),S=d.elements.namedItem("categoryId"),I=l.el.querySelector("[data-save]"),b=($={})=>{if(p.querySelectorAll("[data-extra-row]").length>=8){g("حداکثر ۸ مشخصهٔ اضافه برای هر کالا.",{type:"warn"});return}const _=Yt($);return p.append(_),At(_),_};We(n).forEach($=>b($)),l.el.querySelector("[data-add-extra]")?.addEventListener("click",()=>{b()?.querySelector("[data-extra-label]")?.focus()}),p.addEventListener("click",$=>{$.target.closest("[data-remove-extra]")&&$.target.closest("[data-extra-row]")?.remove()});const v=()=>{const $={};u.querySelectorAll("[data-spec-key]").forEach(y=>{$[y.dataset.specKey]=y.value});const _={...n.specs||{},...$},h=Qe(s.data,S.value);if(!h){u.innerHTML=`<div class="form-note" style="grid-column:1/-1">${r("info",{size:18})}<span>این دستگاه بدون دسته است؛ مشخصات اختصاصی ندارد.</span></div>`;return}if(!h.fields.length){u.innerHTML=`<div class="form-note" style="grid-column:1/-1">${r("info",{size:18})}<span>برای دسته «${f(h.title)}» هنوز مشخصه‌ای تعریف نشده است. از ویرایش دسته می‌توانید اضافه کنید.</span></div>`;return}u.innerHTML=h.fields.map(y=>k({label:y.unit?`${y.label} (${y.unit})`:y.label,name:`spec_${y.key}`,value:_[y.key]||"",maxlength:300,placeholder:"—"}).replace('<input class="input"',`<input data-spec-key="${f(y.key)}" class="input"`)).join("")};S.addEventListener("change",v),v(),d.addEventListener("submit",$=>{$.preventDefault(),H(l);const _=d.elements.namedItem("name"),h=w(d,"name");let y=!0;h||(E(_,"نام دستگاه را وارد کنید."),y=!1);const T=d.elements.namedItem("price"),D=ee(d,"priceOnRequest"),R=Ee(w(d,"price")),U=Number.isFinite(R)?Math.max(0,Math.round(R)):0;!D&&w(d,"price")&&!Number.isFinite(R)&&(E(T,"قیمت باید عدد باشد."),y=!1);const se=d.elements.namedItem("stock"),Q=Ee(w(d,"stock"));(!Number.isFinite(Q)||Q<0)&&(E(se,"موجودی باید عددی صفر یا بیشتر باشد."),y=!1);const ge=w(d,"image");if(ge&&!/^(https?:\/\/|data:image\/)/i.test(ge)&&(E(d.elements.namedItem("image"),"آدرس تصویر باید با https:// شروع شود."),y=!1),!y){d.querySelector(".field.is-invalid .input, .field.is-invalid .select")?.focus(),z(l,"چند مورد نیاز به اصلاح دارد؛ فیلدهای مشخص‌شده را بررسی کنید.");return}const Me=w(d,"categoryId"),ne={},Oe=Qe(s.data,Me);for(const q of Oe?.fields||[]){const C=u.querySelector(`[data-spec-key="${CSS.escape(q.key)}"]`),N=C?C.value.trim():"";N&&(ne[q.key]=N)}const Pe={...n.specs||{}};for(const q of Object.keys(Pe))!(q in ne)&&!(Oe?.fields||[]).some(C=>C.key===q)&&(ne[q]=Pe[q]);const je=[],He=new Set;for(const q of p.querySelectorAll("[data-extra-row]")){const C=q.querySelector("[data-extra-label]").value.trim(),N=q.querySelector("[data-extra-value]").value.trim();if(!C&&!N)continue;if(!C||!N){q.classList.add("is-invalid"),q.querySelector(C?"[data-extra-value]":"[data-extra-label]")?.focus(),z(l,"برای هر مشخصهٔ اضافه، هم عنوان و هم مقدار را بنویسید.");return}const K=C.toLowerCase();He.has(K)||(He.add(K),je.push({label:C,value:N}))}const Be={name:h,brand:w(d,"brand"),categoryId:Me,condition:w(d,"condition")||Je[0],price:U,priceOnRequest:D,stock:Math.round(Q),warranty:w(d,"warranty"),image:ge,note:w(d,"note"),featured:ee(d,"featured"),hidden:ee(d,"hidden"),specs:ne,extraSpecs:je};x(I,!0,"ذخیره…");try{P(q=>{const C=new Date().toISOString();if(o){const N=q.devices.reduce((K,gt)=>Math.max(K,gt.order),0);q.devices.push({...Be,id:Z("dev"),order:N+1,createdAt:C,updatedAt:C})}else{const N=q.devices.find(K=>K.id===a.id);if(!N)return;Object.assign(N,Be,{updatedAt:C})}},"data"),l.close(),g(o?"دستگاه اضافه شد؛ برای دیدن روی سایت منتشر کنید.":"تغییرات دستگاه ذخیره شد.",{type:"ok"})}catch(q){x(I,!1),z(l,q.message||"ذخیره ناموفق بود.")}}),l.el.querySelector("[data-delete]")?.addEventListener("click",async()=>{await G({title:"حذف دستگاه",message:`«${a.name}» حذف شود؟`,confirmText:"حذف",danger:!0})&&(P(_=>{_.devices=_.devices.filter(h=>h.id!==a.id)},"data"),l.close(),g("دستگاه حذف شد.",{type:"ok"}))})}})}function be(e){const t=document.createElement("div");return t.className="cat-field",t.dataset.fieldRow="1",t.dataset.key=e.key,t.innerHTML=`
    <input class="input" data-field-label value="${f(e.label)}" placeholder="عنوان مشخصه" maxlength="40" aria-label="عنوان مشخصه">
    <input class="input" data-field-unit value="${f(e.unit||"")}" placeholder="واحد" maxlength="18" aria-label="واحد">
    <label class="cat-field__show" title="نمایش در ردیف">
      <input type="checkbox" data-field-show ${e.showInRow?"checked":""} aria-label="نمایش در ردیف دستگاه">
    </label>
    <button class="icon-btn" type="button" data-move="up" aria-label="بالا">${r("arrow_upward",{size:16})}</button>
    <button class="icon-btn" type="button" data-move="down" aria-label="پایین">${r("arrow_downward",{size:16})}</button>
    <button class="icon-btn" type="button" data-remove-field aria-label="حذف مشخصه" style="color:var(--danger)">${r("close",{size:16})}</button>
  `,t}function Yt({label:e="",value:t=""}={}){const a=document.createElement("div");return a.className="extra-spec",a.dataset.extraRow="1",a.innerHTML=`
    <input class="input" data-extra-label value="${f(e)}" placeholder="عنوان (مثلاً ایراد فنی)" maxlength="40" aria-label="عنوان مشخصهٔ اضافه">
    <input class="input" data-extra-value value="${f(t)}" placeholder="مقدار" maxlength="300" aria-label="مقدار مشخصهٔ اضافه">
    <button class="icon-btn" type="button" data-remove-extra aria-label="حذف مشخصه" style="color:var(--danger)">${r("close",{size:16})}</button>
  `,a.addEventListener("input",()=>a.classList.remove("is-invalid")),a}function W({id:e=null}={}){if(!F()){A();return}const t=e?s.data.categories.find(c=>c.id===e):null,a=!t,o=t||{...Et("","category"),fields:[]},n=[...new Set(St)];return L({title:a?"دسته‌بندی جدید":"ویرایش دسته",subtitle:a?"هر دسته، عنوان‌های مشخصات خودش را دارد":o.title,size:"wide",body:`
      <form id="categoryForm" class="sheet__section" novalidate>
        ${j("")}
        <div class="grid-2">
          ${k({label:"نام دسته",name:"title",value:o.title,required:!0,maxlength:60,placeholder:"مثلاً لپ‌تاپ"})}
          ${k({label:"توضیح کوتاه",name:"description",value:o.description,maxlength:120,placeholder:"برای بازدیدکننده نمایش داده می‌شود"})}
        </div>
        <div class="field">
          <span class="field__label">آیکون دسته</span>
          <input type="hidden" name="icon" value="${f(o.icon||"category")}" id="catIconValue">
          <div class="icon-picker" id="iconPicker" role="group" aria-label="انتخاب آیکون">
            ${n.map(c=>`
              <button class="icon-picker__opt" type="button" data-icon-opt="${c}"
                aria-pressed="${c===(o.icon||"category")}" aria-label="${c}" title="${c}">
                ${r(c,{size:19})}
              </button>`).join("")}
          </div>
        </div>
        <div class="sheet__section">
          <div class="row">
            <div class="sheet__legend">${r("tune",{size:18})} مشخصات این دسته</div>
            <span class="spacer"></span>
            <button class="btn btn--tonal btn--sm" type="button" data-add-field>${r("add",{size:17})} افزودن مشخصه</button>
          </div>
          <div class="cat-presets" role="group" aria-label="قالب آمادهٔ مشخصات">
            <span class="cat-presets__label">شروع با قالب آماده:</span>
            ${xt.map(c=>`
              <button class="cat-preset" type="button" data-preset="${c.id}">
                ${r(c.icon,{size:15})} ${f(c.title)}
              </button>`).join("")}
          </div>
          <div class="cat-fields" id="catFields"></div>
          <div class="form-note">
            ${r("info",{size:18})}
            <span>این عنوان‌ها هنگام افزودن کالا در همین دسته، از قبل آماده‌اند؛ مدیر فقط مقدارها را پر می‌کند.
            تیک «نمایش در ردیف» باعث می‌شود مقدار آن مشخصه کنار نام کالا در لیست دیده شود.</span>
          </div>
        </div>
        <div data-delete-zone></div>
      </form>
    `,footer:`
      ${a?"":`<button class="btn btn--text btn--sm" type="button" data-delete-cat style="color:var(--danger)">${r("delete",{size:17})} حذف دسته</button>`}
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="categoryForm" data-save>${r("check",{size:17})} ${a?"ساخت دسته":"ذخیره"}</button>
    `,onMount:c=>{const m=c.el.querySelector("#categoryForm"),l=c.el.querySelector("#catFields"),d=c.el.querySelector("#iconPicker"),u=c.el.querySelector("#catIconValue"),p=c.el.querySelector("[data-save]"),S=b=>{b.scrollIntoView({block:"nearest",inline:"nearest"});const v=getComputedStyle(d),$=parseFloat(v.rowGap)||0,h=(parseFloat(String(v.gridTemplateRows).split(" ")[0])||0)+$;if(!h)return;d.scrollTop=Math.round(d.scrollTop/h)*h;const y=d.getBoundingClientRect(),T=b.getBoundingClientRect();T.top<y.top-1?d.scrollTop-=h:T.bottom>y.bottom+1&&(d.scrollTop+=h)},I=d.querySelector('[aria-pressed="true"]');I&&S(I),(o.fields||[]).forEach(b=>l.append(be(b))),(o.fields||[]).length||l.append(be(Ke({label:"",key:Z("f"),showInRow:!0}))),d.addEventListener("click",b=>{const v=b.target.closest("[data-icon-opt]");v&&(d.querySelectorAll("[data-icon-opt]").forEach($=>$.setAttribute("aria-pressed","false")),v.setAttribute("aria-pressed","true"),u.value=v.dataset.iconOpt,S(v))}),l.addEventListener("click",b=>{const v=b.target.closest("[data-field-row]");if(!v)return;if(b.target.closest("[data-remove-field]")){v.remove();return}const $=b.target.closest("[data-move]");$&&($.dataset.move==="up"&&v.previousElementSibling?v.parentElement.insertBefore(v,v.previousElementSibling):$.dataset.move==="down"&&v.nextElementSibling&&v.parentElement.insertBefore(v.nextElementSibling,v),v.querySelector("[data-field-label]")?.focus())}),c.el.querySelectorAll("[data-preset]").forEach(b=>{b.addEventListener("click",()=>{const v=[...l.querySelectorAll("[data-field-row]")],$=new Set(v.map(y=>y.querySelector("[data-field-label]").value.trim().toLowerCase()).filter(Boolean)),_=v.find(y=>!y.querySelector("[data-field-label]").value.trim());let h=0;for(const y of qt(b.dataset.preset)){if($.has(y.label.toLowerCase()))continue;const T=be(y);if(_&&!h?_.replaceWith(T):l.append(T),h+=1,v.length+h>=12)break}if(!h){g("همهٔ مشخصه‌های این قالب از قبل هست.",{type:"info"});return}g(`${O(h,M())} مشخصه از قالب «${b.textContent.trim()}» اضافه شد.`,{type:"ok"})})}),c.el.querySelector("[data-add-field]")?.addEventListener("click",()=>{if(l.querySelectorAll("[data-field-row]").length>=12){g("حداکثر ۱۲ مشخصه برای هر دسته مجاز است.",{type:"warn"});return}const b=be(Ke({label:"",key:Z("f"),showInRow:!0}));l.append(b),b.querySelector("[data-field-label]")?.focus()}),m.addEventListener("submit",b=>{b.preventDefault(),H(c);const v=m.elements.namedItem("title"),$=w(m,"title");let _=!0;$||(E(v,"نام دسته را وارد کنید."),_=!1);const h=[...l.querySelectorAll("[data-field-row]")],y=[];for(const D of h){const R=D.querySelector("[data-field-label]"),U=R.value.trim(),se=D.querySelector("[data-field-unit]").value.trim(),Q=D.querySelector("[data-field-show]").checked;if(!U){if(se){D.style.borderColor="var(--danger)",R.focus(),_=!1;break}D.style.borderColor="";continue}D.style.borderColor="",y.push({key:D.dataset.key,label:U,unit:se,type:"text",showInRow:Q})}if(!_){z(c,"برای هر مشخصه یک عنوان بنویسید یا ردیف خالی را حذف کنید.");return}const T={title:$,description:w(m,"description"),icon:u.value||"category",fields:y};x(p,!0,"ذخیره…");try{P(D=>{if(a)D.categories.push({...T,id:Z("cat")});else{const R=D.categories.find(U=>U.id===o.id);R&&Object.assign(R,T)}},"data"),c.close(),g(a?"دسته ساخته شد.":"دسته ذخیره شد.",{type:"ok"})}catch(D){x(p,!1),z(c,D.message||"ذخیره ناموفق بود.")}}),c.el.querySelector("[data-delete-cat]")?.addEventListener("click",async()=>{c.close(),await Qt(o.id)})}})}async function Qt(e){const t=s.data?.categories.find(c=>c.id===e);if(!t)return;const a=s.data.devices.filter(c=>c.categoryId===e),o=s.data.categories.filter(c=>c.id!==e);if(!a.length){if(!await G({title:"حذف دسته",message:`دسته «${t.title}» حذف شود؟ هیچ دستگاهی در آن نیست.`,confirmText:"حذف",danger:!0}))return;P(m=>{m.categories=m.categories.filter(l=>l.id!==e)},"data"),g("دسته حذف شد.",{type:"ok"});return}const n=[...o.map(c=>`<option value="${f(c.id)}">${f(c.title)}</option>`),'<option value="">بدون دسته</option>'].join(""),i=L({title:"حذف دسته",subtitle:`${a.length} دستگاه در «${t.title}»`,size:"narrow",body:`
      <form id="deleteCatForm" class="stack" style="gap:14px">
        <p class="t-sm" style="color:var(--text-2);line-height:1.9">این دسته حذف می‌شود، اما دستگاه‌های آن حذف نمی‌شوند. انتخاب کنید به کدام دسته منتقل شوند:</p>
        <label class="field">
          <span class="field__label">دسته مقصد</span>
          <select class="select" name="target">${n}</select>
        </label>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--danger btn--sm" type="button" data-confirm>${r("delete",{size:17})} حذف و انتقال</button>
    `});i.el.querySelector("[data-confirm]")?.addEventListener("click",()=>{const c=i.el.querySelector('select[name="target"]').value;P(m=>{m.devices.forEach(l=>{l.categoryId===e&&(l.categoryId=c,l.updatedAt=new Date().toISOString())}),m.categories=m.categories.filter(l=>l.id!==e)},"data"),i.close(),g("دسته حذف شد و دستگاه‌ها منتقل شدند.",{type:"ok"})})}function te(e="store"){if(!F()){A();return}const{store:t,settings:a}=s.data;return L({title:"تنظیمات فروشگاه",subtitle:"این اطلاعات بلافاصله در سایت استفاده می‌شوند",size:"wide",body:`
      <form id="settingsForm" class="sheet__section" novalidate>
        ${j("")}
        <div class="sheet__section">
          <div class="sheet__legend">${r("storefront",{size:18})} هویت فروشگاه</div>
          <div class="grid-2">
            ${k({label:"نام فروشگاه",name:"name",value:t.name,required:!0,maxlength:60})}
            ${k({label:"شعار کوتاه",name:"tagline",value:t.tagline,maxlength:100,hint:"زیر نام فروشگاه در صفحه اول"})}
          </div>
          ${k({label:"توضیح فروشگاه",name:"description",value:t.description,rows:2,maxlength:300})}
          <div class="grid-2">
            ${k({label:"تلفن",name:"phone",value:t.phone,ltr:!0,inputmode:"tel",placeholder:"۰۹۱۲۱۲۳۴۵۶۷"})}
            ${k({label:"واتساپ",name:"whatsapp",value:t.whatsapp,ltr:!0,inputmode:"tel",hint:"با کد کشور، مثلاً 989121234567"})}
          </div>
          <div class="grid-2">
            ${k({label:"اینستاگرام",name:"instagram",value:t.instagram,ltr:!0,placeholder:"shop_name",hint:"بدون @ یا آدرس کامل"})}
            ${k({label:"ساعات کاری",name:"hours",value:t.hours,maxlength:100})}
          </div>
          ${k({label:"آدرس",name:"address",value:t.address,maxlength:160})}
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${r("palette",{size:18})} نمایش لیست</div>
          <div class="grid-3">
            ${de({label:"پوسته پیش‌فرض",name:"theme",value:a.theme,options:[{value:"auto",label:"خودکار (سیستم)"},{value:"light",label:"روشن"},{value:"dark",label:"تاریک"}]})}
            ${k({label:"واحد پول",name:"currency",value:a.currency,maxlength:20})}
            ${de({label:"اعداد",name:"numerals",value:a.numerals,options:[{value:"fa",label:"فارسی (۱۲۳)"},{value:"en",label:"لاتین (123)"}]})}
          </div>
          <div class="grid-2">
            ${k({label:"آستانه «کمیاب»",name:"lowStockThreshold",type:"number",value:String(a.lowStockThreshold),min:0,max:99,ltr:!0,hint:"اگر موجودی از این عدد کمتر یا مساوی بود، «کمیاب» نمایش داده شود."})}
            ${k({label:"نام نمایشی مدیر",name:"adminName",value:a.adminName,maxlength:60,hint:"در «آخرین به‌روزرسانی» دیده می‌شود."})}
          </div>
          <div class="grid-2">
            ${ue({label:"نمایش قیمت‌ها",name:"showPrices",checked:a.showPrices,hint:"در صورت خاموش بودن، «استعلام قیمت» نمایش داده می‌شود."})}
            ${ue({label:"نمایش تعداد دقیق موجودی",name:"showExactStock",checked:a.showExactStock,hint:"در صورت خاموش بودن فقط «موجود / ناموجود» دیده می‌شود."})}
          </div>
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${r("security",{size:18})} امنیت و اتصال</div>
          <div class="form-note">
            ${r("key",{size:18})}
            <span>مخزن: <span dir="ltr" style="font-family:monospace">${f(Le(s.repo))}</span><br>
            ${s.vault?"توکن شما رمزگذاری‌شده در فایل vault.json ذخیره شده است.":"این نشست با توکن موقت باز شده؛ تغییر رمز در دسترس نیست."}</span>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--outlined btn--sm" type="button" data-inline-action="security">${r("key",{size:17})} تغییر رمز / توکن</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="logout">${r("lock",{size:17})} قفل کردن</button>
          </div>
        </div>

        <div class="sheet__section">
          <div class="sheet__legend">${r("download",{size:18})} نسخه پشتیبان</div>
          <p class="t-xs" style="color:var(--text-3);line-height:1.9">فایل JSON دوره‌ای از لیست بگیرید؛ برای بازیابی یا انتقال به مخزن دیگر لازم است.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--outlined btn--sm" type="button" data-inline-action="export-backup">${r("download",{size:17})} دریافت نسخه پشتیبان</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="export-csv">${r("table_rows",{size:17})} خروجی CSV (اکسل)</button>
            <button class="btn btn--text btn--sm" type="button" data-inline-action="import-backup">${r("cloud_upload",{size:17})} بازیابی از فایل</button>
            ${s.dirty?`<button class="btn btn--text btn--sm" type="button" data-inline-action="discard">${r("replay",{size:17})} بازگشت به نسخه منتشرشده</button>`:""}
          </div>
        </div>

        <div class="sheet__section danger-zone">
          <div class="sheet__legend">${r("warning",{size:18})} منطقه خطر</div>
          <p class="t-xs" style="color:var(--text-3);line-height:1.9">
            همه دستگاه‌ها و دسته‌بندی‌ها یک‌جا پاک می‌شوند. اطلاعات فروشگاه، تنظیمات و رمز دست‌نخورده می‌مانند.
            قبل از اجرا می‌توانید نسخه پشتیبان بگیرید.
          </p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button class="btn btn--danger btn--sm" type="button" data-inline-action="reset">
              ${r("delete_forever",{size:17})} بازنشانی همه داده‌های لیست
            </button>
          </div>
        </div>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="settingsForm" data-save>${r("check",{size:17})} ذخیره تنظیمات</button>
    `,onMount:n=>{const i=n.el.querySelector("#settingsForm"),c=n.el.querySelector("[data-save]");n.el.querySelectorAll("[data-inline-action]").forEach(m=>{m.addEventListener("click",()=>{const l=m.dataset.inlineAction;n.close(),l==="security"?Y():l==="logout"?me():l==="discard"?he():l==="export-backup"?ae():l==="export-csv"?sa():l==="import-backup"?ht():l==="reset"&&ve()})}),i.addEventListener("submit",m=>{m.preventDefault(),H(n);const l=w(i,"name");if(!l){E(i.elements.namedItem("name"),"نام فروشگاه را وارد کنید."),z(n,"نام فروشگاه نمی‌تواند خالی باشد.");return}const d=Ee(w(i,"lowStockThreshold")),u=Number.isFinite(d)?Math.min(99,Math.max(0,Math.round(d))):2;x(c,!0,"ذخیره…");try{P(p=>{Object.assign(p.store,{name:l,tagline:w(i,"tagline"),description:w(i,"description"),phone:w(i,"phone"),whatsapp:w(i,"whatsapp"),instagram:w(i,"instagram"),address:w(i,"address"),hours:w(i,"hours")}),Object.assign(p.settings,{theme:w(i,"theme"),currency:w(i,"currency")||"تومان",numerals:w(i,"numerals")==="en"?"en":"fa",lowStockThreshold:u,adminName:w(i,"adminName")||"مدیر فروشگاه",showPrices:ee(i,"showPrices"),showExactStock:ee(i,"showExactStock")})},"settings"),n.close(),g("تنظیمات ذخیره شد؛ برای اعمال روی سایت منتشر کنید.",{type:"ok"})}catch(p){x(c,!1),z(n,p.message||"ذخیره ناموفق بود.")}})}})}function Y(){if(!F()){A();return}if(!s.vault||!s.api){L({title:"رمز و توکن",size:"narrow",body:`
        <div class="form-note">
          ${r("info",{size:18})}
          <span>این نشست با «توکن موقت» باز شده و فایل امنیتی در دسترس نیست. برای ساخت رمز، صفحه راه‌اندازی را کامل کنید.</span>
        </div>
        <p class="t-xs" style="margin-top:12px;color:var(--text-3);line-height:1.9">با صفحه راه‌اندازی می‌توانید همین توکن را با یک رمز عبور سینک کنید؛ از آن به بعد ورود فقط با رمز انجام می‌شود.</p>
      `,footer:`<span class="spacer"></span>
        <button class="btn btn--text btn--sm btn--danger" type="button" data-reset-credential>${r("refresh",{size:17})} حذف فایل امنیتی</button>
        <a class="btn btn--filled btn--sm" href="setup/">${r("rocket_launch",{size:17})} صفحه راه‌اندازی</a>`}),document.querySelector("dialog.sheet[open] [data-reset-credential]")?.addEventListener("click",()=>{document.querySelectorAll("dialog.sheet[open]").forEach(t=>{try{t.close()}catch{}}),bt()});return}return L({title:"رمز و توکن",subtitle:"ریست رمز با رمز فعلی، یا جایگزینی توکن گیت‌هاب",size:"narrow",body:`
      <form id="securityForm" class="stack" style="gap:14px" novalidate>
        ${j("")}
        <div class="form-note">
          ${r("security",{size:18})}
          <span>برای عوض کردن رمز، <b>رمز فعلی</b> را هم می‌پرسیم تا فقط خودتان بتوانید این کار را بکنید.
          توکن دست‌نخورده می‌ماند و فایل رمزگذاری‌شده در <span dir="ltr">data/vault.json</span> بازنویسی می‌شود.</span>
        </div>
        <div class="field">
          <span class="field__label">رمز فعلی<span class="req">*</span></span>
          <div class="password-wrap">
            <input class="input" type="password" name="currentPassword" id="currentPassword" autocomplete="current-password" placeholder="همان رمزی که با آن وارد شدید">
            <button class="icon-btn" type="button" data-toggle-current aria-label="نمایش رمز فعلی">${r("visibility",{size:19})}</button>
          </div>
          <span class="field__hint">فقط برای تأیید هویت؛ نه ذخیره می‌شود و نه جایی فرستاده می‌شود.</span>
          <span class="field__error"></span>
        </div>
        <div class="sheet__section">
          <div class="sheet__legend">${r("lock",{size:18})} ریست رمز عبور</div>
        <div class="field">
          <span class="field__label">رمز عبور جدید<span class="req">*</span></span>
          <div class="password-wrap">
            <input class="input" type="password" name="password" id="newPassword" autocomplete="new-password" placeholder="حداقل ۱۰ کاراکتر">
            <button class="icon-btn" type="button" data-toggle-password aria-label="نمایش رمز">${r("visibility",{size:19})}</button>
          </div>
          <div class="pw-meter" data-pw-meter data-score="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
          <div class="pw-estimate" data-pw-estimate data-level="weak" role="status" hidden></div>
          <span class="field__hint">پیشنهاد: چهار کلمهٔ بی‌ربط با خط تیره؛ مثل «کتاب-پرنده-آبی-ماه».</span>
          <span class="field__error"></span>
        </div>
        ${k({label:"تکرار رمز جدید",name:"password2",type:"password",autocomplete:"new-password",required:!0})}
        </div>
        ${k({label:"یادآور رمز (اختیاری)",name:"hint",value:s.vault.hint||"",maxlength:80,hint:"مثلاً «شماره پلاک + اسم فروشگاه» — خود رمز را ننویسید."})}
        <div class="sheet__section">
          <div class="sheet__legend">${r("key",{size:18})} توکن گیت‌هاب</div>
          ${k({label:"توکن جدید (اختیاری)",name:"token",ltr:!0,autocomplete:"off",placeholder:"برای تغییر، توکن تازه را اینجا بگذارید",hint:"اگر خالی بماند، توکن فعلی دوباره رمزگذاری می‌شود."})}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn btn--outlined btn--sm" type="button" data-download-vault>${r("download",{size:17})} دریافت فایل پشتیبان امنیتی</button>
        </div>
        <div class="sheet__section danger-zone" style="margin-top:4px">
          <div class="sheet__legend">${r("refresh",{size:18})} ریست کلی رمزها</div>
          <p class="danger-zone__desc">
            فایل امنیتی (رمز و توکنِ رمزگذاری‌شده) از مخزن حذف می‌شود. بعد از آن ورود با رمز ممکن نیست
            تا دوباره صفحهٔ راه‌اندازی را باز کنید و <b>توکن تازه + رمز تازه</b> بسازید.
            لیست کالاها، دسته‌ها و تنظیمات فروشگاه پاک نمی‌شود.
            <br>
            اگر فقط می‌خواهید رمز را عوض کنید و توکن بماند، از بخش <b>ریست رمز عبور</b> بالا استفاده کنید.
          </p>
          <button class="btn btn--sm btn--danger" type="button" data-reset-credential>
            ${r("refresh",{size:17})} ریست کلی رمز و توکن
          </button>
        </div>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="securityForm" data-save>${r("shield",{size:17})} ذخیره امن</button>
    `,onMount:t=>{const a=t.el.querySelector("#securityForm"),o=a.elements.namedItem("password"),n=a.elements.namedItem("currentPassword"),i=t.el.querySelector("[data-pw-meter]"),c=t.el.querySelector("[data-save]"),m=t.el.querySelector("[data-pw-estimate]");t.el.querySelector("[data-toggle-current]")?.addEventListener("click",d=>{const u=n.type==="password";n.type=u?"text":"password",d.currentTarget.innerHTML=r(u?"visibility_off":"visibility",{size:19}),n.focus()});const l=()=>{const d=o.value;if(i.dataset.score=String(Ge(d)),!m)return;if(!d){m.hidden=!0,m.textContent="";return}const u=$e(d);m.hidden=!1,m.dataset.level=u<Ie?"weak":u<Mt?"ok":"strong",m.textContent=u<Ie?`در برابر حملهٔ آفلاین ${ze(u)} دوام می‌آورد — کافی نیست.`:`تخمین در برابر حملهٔ آفلاین (${ze(u)}) با فرض واژه‌نامه و یک کارت گرافیک.`};o.addEventListener("input",l),t.el.querySelector("[data-toggle-password]")?.addEventListener("click",d=>{const u=o.type==="password";o.type=u?"text":"password",d.currentTarget.innerHTML=r(u?"visibility_off":"visibility",{size:19}),o.focus()}),t.el.querySelector("[data-reset-credential]")?.addEventListener("click",()=>{t.close(),bt()}),t.el.querySelector("[data-download-vault]")?.addEventListener("click",()=>{s.vault&&(ce("vault.json",`${JSON.stringify(s.vault,null,2)}
`),g("فایل امنیتی دانلود شد؛ آن را در جای مطمئن نگه دارید.",{type:"ok"}))}),a.addEventListener("submit",async d=>{d.preventDefault(),H(t);const u=w(a,"currentPassword"),p=o.value,S=w(a,"password2"),I=w(a,"hint"),b=w(a,"token");if(!u){E(n,"برای تأیید، رمز فعلی را وارد کنید."),n.focus();return}if(!p&&!b){E(o,"رمز جدید را وارد کنید (یا برای تغییر فقط توکن، توکن تازه را بگذارید)."),o.focus();return}if(p){if(p.length<10){E(o,"رمز جدید باید حداقل ۱۰ کاراکتر باشد."),o.focus();return}if(p!==S){E(a.elements.namedItem("password2"),"تکرار رمز مطابقت ندارد.");return}if(Ge(p)<2){z(t,"رمز ضعیف است؛ از حروف و عدد یا یک عبارت بلندتر استفاده کنید.");return}if($e(p)<Ie){E(o,`این رمز در برابر حملهٔ آفلاین فقط ${ze($e(p))} دوام می‌آورد؛ چهار کلمهٔ بی‌ربط بگذارید.`),o.focus();return}}if(b&&!Ue(b)){z(t,"مقدار توکن جدید معتبر به نظر نمی‌رسد.");return}x(c,!0,"ذخیره امن…");try{let v;try{v=await Ve(s.vault,u)}catch(R){if(x(c,!1),R?.code==="bad-password"||R?.code==="crypto"){E(n,"رمز فعلی نادرست است."),n.select();return}throw R}let $=v.token||s.api.token;if(b){if((await ye({token:b,...s.repo}).getRepo()).canPush===!1)throw new oe("توکن جدید دسترسی نوشتن ندارد.");$=b}const _=await _t({password:p||u,token:$,login:s.user?.login||"",repo:s.repo,hint:I}),h=`${JSON.stringify(_,null,2)}
`,y=await s.api.getFile("data/vault.json"),T=await s.api.putFile({path:"data/vault.json",content:h,message:`به‌روزرسانی رمز مدیریت — ${X()}`,sha:y?.sha||null});s.vault=_,b&&(s.api=ye({token:$,...s.repo})),Re(),t.close(),g(p&&b?"رمز و توکن با موفقیت به‌روزرسانی شد.":p?"رمز با موفقیت تغییر کرد؛ از این به بعد با رمز جدید وارد شوید.":"توکن با موفقیت جایگزین شد؛ رمز فعلی دست‌نخورده ماند.",{type:"ok"}),T?.commitUrl&&console.info("[vault] updated:",T.commitUrl)}catch(v){x(c,!1),z(t,v?.message||"ذخیره امن ناموفق بود.")}})}})}function bt(){if(!F()){A();return}if(V()||!s.api){_e({title:"در پیش‌نمایش ممکن نیست",message:"حالت پیش‌نمایش توکنی ندارد، پس نمی‌تواند فایل امنیتی را از مخزن حذف کند.",iconName:"info"});return}const e=!!s.vault;return L({title:"ریست کلی رمز و توکن",subtitle:"بعد از این کار باید توکن تازه و رمز تازه بسازید",size:"narrow",body:`
      <form id="credentialResetForm" class="stack" style="gap:16px" novalidate>
        ${j("")}
        <div class="danger-card">
          ${r("warning",{size:22})}
          <div>
            <b>بعد از این کار، ورود با رمز ممکن نیست</b>
            <p>فایل <span dir="ltr">data/vault.json</span> حذف می‌شود؛ یعنی هیچ رمز و هیچ توکنی روی سایت نمی‌ماند.
            برای برگشتن باید یک <b>توکن تازه</b> در گیت‌هاب بسازید و در صفحهٔ راه‌اندازی یک <b>رمز تازه</b> بگذارید.</p>
          </div>
        </div>
        <div class="reset-summary">
          <div class="reset-summary__row is-removed">
            ${r("delete",{size:18})}
            <span>حذف می‌شود: فایل امنیتی، یعنی توکنِ رمزگذاری‌شده و رمزِ مربوط به آن</span>
          </div>
          <div class="reset-summary__row">
            ${r("check",{size:18})}
            <span>می‌ماند: لیست کالاها، دسته‌بندی‌ها، تنظیمات فروشگاه و تاریخچه</span>
          </div>
        </div>
        <div class="form-note">
          ${r("info",{size:18})}
          <span>این دکمه توکن را در گیت‌هاب باطل نمی‌کند. بعد از بازنشانی، توکن قدیمی را در
          <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" dir="ltr">github.com/settings/tokens</a>
          حذف (Revoke) کنید و یک توکن تازه بگیرید.</span>
        </div>
        ${s.dirty?`<div class="form-note form-note--danger">
          ${r("warning",{size:18})}
          <span>تغییرات منتشرنشدهٔ لیست دارید؛ با بازنشانی از بین می‌رود. اول «انتشار» بزنید یا نسخه پشتیبان بگیرید.</span>
        </div>`:""}
        ${e?`<label class="check">
          <input type="checkbox" name="backup" checked>
          <span>قبل از حذف، نسخهٔ پشتیبان فایل امنیتی را دانلود کن</span>
        </label>`:""}
        <label class="field">
          <span class="field__label">برای تأیید، عبارت <b>${f(ie)}</b> را بنویسید<span class="req">*</span></span>
          <input class="input" name="phrase" autocomplete="off" placeholder="${f(ie)}" required>
          <span class="field__hint">این عبارت جلوی بازنشانی اتفاقی را می‌گیرد.</span>
          <span class="field__error"></span>
        </label>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm btn--danger" type="submit" form="credentialResetForm" data-submit>
        ${r("refresh",{size:17})} حذف رمز و توکن
      </button>
    `,onMount:a=>{const o=a.el.querySelector("#credentialResetForm"),n=a.el.querySelector("[data-submit]"),i=o.elements.namedItem("phrase");i.focus(),o.addEventListener("submit",async c=>{if(c.preventDefault(),H(a),String(i.value||"").replace(/\s+/g," ").trim()!==ie){E(i,`برای تأیید، دقیقاً «${ie}» را بنویسید.`),i.select();return}e&&o.elements.namedItem("backup")?.checked&&s.vault&&ce("vault-backup.json",`${JSON.stringify(s.vault,null,2)}
`),x(n,!0,"در حال حذف…"),a.setBusy(!0);try{const d=await s.api.getFile("data/vault.json"),u=d?.sha?await s.api.deleteFile({path:"data/vault.json",sha:d.sha,message:`بازنشانی رمز و توکن (حذف فایل امنیتی) — ${X()}`}):{missing:!0,commitUrl:null};Re(),st(),document.querySelectorAll("dialog.sheet[open]").forEach(p=>{try{p.close()}catch{}}),Xt({commitUrl:u?.commitUrl||null,already:!!u?.missing})}catch(d){x(n,!1),a.setBusy(!1),z(a,d?.message||"حذف فایل امنیتی ناموفق بود.")}})}})}function Xt({commitUrl:e=null,already:t=!1}={}){L({title:"رمز و توکن پاک شد",size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${r("lock_open",{size:24})}</span>
          <div>
            <div class="login-hero__title">${t?"فایل امنیتی از قبل وجود نداشت":"از این لحظه هیچ رمزی روی سایت نیست"}</div>
            <div class="login-hero__sub">
              لیست کالاها، دسته‌ها و تنظیمات دست‌نخورده ماند. برای ورود مدیر باید یک توکن تازه و یک رمز تازه بسازید.
            </div>
          </div>
        </div>
        <ol class="cred-steps">
          <li>
            <span class="cred-steps__num">۱</span>
            <b>توکن قدیمی را باطل کنید.</b>
            در <a href="https://github.com/settings/tokens" target="_blank" rel="noopener" dir="ltr">github.com/settings/tokens</a>
            توکن قبلی را Revoke کنید و یک توکن تازه بسازید (Contents: Read and write).
          </li>
          <li>
            <span class="cred-steps__num">۲</span>
            <b>صفحهٔ راه‌اندازی را روی رایانه باز کنید:</b>
            <code dir="ltr">npm start</code> ← <code dir="ltr">http://localhost:8080/setup/</code>
          </li>
          <li>
            <span class="cred-steps__num">۳</span>
            توکن تازه و رمز تازه را وارد کنید؛ زیر کادر رمز، تخمین زمان شکستن را ببینید.
            بعد <b>ساخت فایل امنیتی</b> ← <b>نوشتن در مخزن گیت‌هاب</b>.
          </li>
          <li><span class="cred-steps__num">۴</span>به سایت برگردید و با رمز تازه وارد شوید.</li>
        </ol>
        <div class="form-note">
          ${r("info",{size:18})}
          <span>اگر رمز را فراموش کرده بودید، همین مسیر جواب می‌دهد: با «ورود موقت با توکن» وارد شوید،
          فایل امنیتی را پاک کنید و از نو رمز بسازید.</span>
        </div>
      </div>
    `,footer:`
      <span class="spacer"></span>
      ${e?`<a class="btn btn--text btn--sm" href="${f(e)}" target="_blank" rel="noopener">${r("open_in_new",{size:17})} کامیت حذف</a>`:""}
      <a class="btn btn--text btn--sm" href="help/#security">${r("help",{size:17})} راهنما</a>
      <button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>
    `})}let Te=null,fe=null;async function J(){return F()?(Te||(fe=fe||import("./manage.js").then(e=>(Te=e,e)).catch(e=>{throw fe=null,e}),await fe),Te.openManagePanel({edit:e=>B({id:e}),add:e=>B({categoryId:e}),addCategory:()=>W({}),settings:()=>te(),security:()=>Y(),backup:()=>ae(),history:()=>document.dispatchEvent(new CustomEvent("ol:history")),help:()=>Ne(),discard:()=>he(),reset:()=>ve(),logout:()=>me(),apply:e=>Zt(e)})):(A(),null)}function ft(e){return(s.data?.settings?.numerals==="en"?"en":"fa")==="fa"?Tt(String(e||"")):String(e||"")}async function Zt(e=""){if(V())return await _e({title:"در پیش‌نمایش ممکن نیست",message:"حالت پیش‌نمایش توکن ندارد؛ برای ثبت تغییرات، با رمز مدیریت وارد شوید.",iconName:"info"}),!1;if(!s.api)return await A(),!1;if(!s.dirty)return g("تغییری برای اعمال نیست.",{type:"info"}),!0;const t=e||ea(),a=ke(s.baseline,s.data);try{const o=tt(xe(s.data),{by:s.data?.settings?.adminName||s.user?.name||"مدیر فروشگاه",action:"publish",summary:ft(a?.stockOnly?"به‌روزرسانی موجودی":Ye(a,t)),stats:{added:a?.added.length||0,updated:a?.updated.length||0,removed:a?.removed.length||0}}),n=await Ae(o,t),i=n?.commitSha?n.commitSha.slice(0,7):"";return g(i?`تغییرات روی سایت اعمال شد (کامیت ${i}).`:"تغییرات روی سایت اعمال شد.",{type:"ok",duration:6e3}),!0}catch(o){return g(o?.message||"انتشار ناموفق بود.",{type:"err"}),!1}}function ea(){return`${ke(s.baseline,s.data)?.stockOnly?"به‌روزرسانی موجودی":"به‌روزرسانی لیست موجودی"} — ${X()}`}async function Ae(e,t){let a=s.sha;a||(a=(await s.api.getFile("data/store.json"))?.sha||null);const o=await s.api.putFile({path:"data/store.json",content:re(e),message:t,sha:a});return Lt({data:e,sha:o.sha,commit:o}),o}function ve(){if(!F()){A();return}const e=s.data,t=e?.devices?.length||0,a=e?.categories?.length||0,o=i=>O(i,M());return L({title:"بازنشانی لیست موجودی",subtitle:"همه دستگاه‌ها و دسته‌بندی‌ها حذف می‌شوند",size:"narrow",body:`
      <form id="resetForm" class="stack" style="gap:16px" novalidate>
        ${j("")}
        <div class="danger-card">
          ${r("warning",{size:22})}
          <div>
            <b>این کار قابل بازگشت نیست</b>
            <p>با تأیید، ${o(t)} دستگاه و ${o(a)} دسته‌بندی پاک می‌شوند و تغییر
            <b>بلافاصله</b> روی سایت منتشر می‌شود. بازدیدکننده‌ها از آن لحظه لیست خالی می‌بینند.</p>
          </div>
        </div>
        <div class="reset-summary">
          <div class="reset-summary__row is-removed">
            ${r("delete",{size:18})}
            <span>حذف می‌شود: دستگاه‌ها، دسته‌بندی‌ها و مشخصات آن‌ها</span>
          </div>
          <div class="reset-summary__row">
            ${r("check",{size:18})}
            <span>می‌ماند: نام فروشگاه، تماس و آدرس، تنظیمات نمایش، رمز و توکن، تاریخچه</span>
          </div>
        </div>
        <label class="check">
          <input type="checkbox" name="backup" checked>
          <span>قبل از حذف، یک نسخه پشتیبان (فایل JSON) دانلود کن</span>
        </label>
        <label class="field">
          <span class="field__label">برای تأیید، عبارت <b dir="rtl">${f(le)}</b> را بنویسید<span class="req">*</span></span>
          <input class="input" name="phrase" autocomplete="off" placeholder="${f(le)}" required>
          <span class="field__hint">این عبارت جلوی حذف اتفاقی را می‌گیرد.</span>
          <span class="field__error"></span>
        </label>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm btn--danger" type="submit" form="resetForm" data-submit>
        ${r("delete_forever",{size:17})} حذف همه و انتشار
      </button>
    `,onMount:i=>{const c=i.el.querySelector("#resetForm"),m=i.el.querySelector("[data-submit]"),l=c.elements.namedItem("phrase");l.focus(),c.addEventListener("submit",async d=>{if(d.preventDefault(),H(i),String(l.value||"").replace(/\s+/g," ").trim()!==le){E(l,`برای تأیید، دقیقاً «${le}» را بنویسید.`),l.select();return}c.elements.namedItem("backup").checked&&s.data&&ae(),x(m,!0,"در حال حذف…"),i.setBusy(!0);try{const p=s.user?.name||s.data?.settings?.adminName||"مدیر فروشگاه",{data:S,removedDevices:I,removedCategories:b}=zt(s.data,{by:p});let v=null;V()?it(S,{baseline:S}):v=await Ae(S,`بازنشانی لیست موجودی — ${X()}`),i.close(),document.querySelectorAll("dialog.sheet[open]").forEach($=>{try{$.close()}catch{}}),ta({removedDevices:I,removedCategories:b,res:v,demo:V()})}catch(p){x(m,!1),i.setBusy(!1),z(i,p?.message||"بازنشانی ناموفق بود.")}})}})}function ta({removedDevices:e,removedCategories:t,res:a,demo:o}){const n=c=>O(c,M()),i=a?.commitUrl||(s.repo?`https://github.com/${s.repo.owner}/${s.repo.repo}/commits/${s.repo.branch}`:"");L({title:"لیست بازنشانی شد",size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${r("delete_sweep",{size:24})}</span>
          <div>
            <div class="login-hero__title">${n(e)} دستگاه و ${n(t)} دسته حذف شد</div>
            <div class="login-hero__sub">
              ${o?"این تغییر فقط در پیش‌نمایش اعمال شد؛ چون توکنی وجود ندارد، چیزی روی مخزن نوشته نشد.":"فایل data/store.json بازنویسی شد. لیست عمومی تا یک دقیقه خالی می‌شود."}
            </div>
          </div>
        </div>
        ${o?"":`<div class="form-note">
          ${r("info",{size:18})}
          <span>نسخه پشتیبان در پوشه دانلودهای شماست. برای بازگردانی کامل: تنظیمات → بازیابی از فایل.
          همچنین می‌توانید همان کامیت را در گیت‌هاب Revert کنید.</span>
        </div>`}
      </div>
    `,footer:`
      <span class="spacer"></span>
      ${i?`<a class="btn btn--text btn--sm" href="${f(i)}" target="_blank" rel="noopener">${r("open_in_new",{size:17})} تاریخچه گیت‌هاب</a>`:""}
      <button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>
    `})}async function vt(){if(V()){await _e({title:"انتشار در پیش‌نمایش ممکن نیست",message:"در حالت پیش‌نمایش هیچ توکنی وجود ندارد. برای انتشار واقعی، از صفحه راه‌اندازی توکن را با رمز سینک کنید.",iconName:"info"});return}if(!F()||!s.api){A();return}if(!s.dirty){g("تغییری برای انتشار وجود ندارد.",{type:"info"});return}const e=ke(s.baseline,s.data),t=`به‌روزرسانی لیست موجودی — ${X()} · ${new Date().toLocaleTimeString("fa-IR",{hour:"2-digit",minute:"2-digit"})}`,a=[...e.added,...e.updated,...e.removed].slice(0,6);return L({title:"انتشار تغییرات",subtitle:`${Le(s.repo)}`,body:`
      <form id="publishForm" class="stack" style="gap:16px" novalidate>
        ${j("")}
        <div class="publish-summary">
          <div class="publish-stat"><b>${O(e.added.length,M())}</b><span>دستگاه جدید</span></div>
          <div class="publish-stat"><b>${O(e.updated.length,M())}</b><span>ویرایش دستگاه</span></div>
          <div class="publish-stat"><b>${O(e.removed.length,M())}</b><span>حذف‌شده</span></div>
        </div>
        ${e.total?`<div class="diff-list">
          ${[...e.added.map(n=>({tag:"+",cls:"",label:n.name})),...e.updated.map(n=>({tag:"~",cls:"tag--mod",label:n.name})),...e.removed.map(n=>({tag:"−",cls:"tag--del",label:n.name})),...e.catAdded.map(n=>({tag:"+",cls:"",label:`دسته: ${n.title}`})),...e.catUpdated.map(n=>({tag:"~",cls:"tag--mod",label:`دسته: ${n.title}`})),...e.catRemoved.map(n=>({tag:"−",cls:"tag--del",label:`دسته: ${n.title}`}))].slice(0,7).map(n=>`
            <div class="diff-item"><span class="tag ${n.cls}">${n.tag}</span><span>${f(n.label)}</span></div>
          `).join("")}
          ${e.total>7?`<div class="diff-item"><span class="tag">…</span><span>و ${O(e.total-7,M())} تغییر دیگر</span></div>`:""}
        </div>`:'<div class="form-note">'+r("info",{size:18})+"<span>تغییری در دستگاه‌ها نیست؛ فقط اطلاعات فروشگاه یا تنظیمات به‌روزرسانی می‌شود.</span></div>"}
        <label class="field">
          <span class="field__label">پیام کامیت<span class="req">*</span></span>
          <input class="input" name="message" value="${f(t)}" maxlength="160" dir="ltr" style="text-align:left">
          <span class="field__hint">این پیام در تاریخچه گیت‌هاب ثبت می‌شود.</span>
          <span class="field__error"></span>
        </label>
        <div class="form-note">
          ${r("cloud_upload",{size:18})}
          <span>با تأیید، فایل <span dir="ltr">data/store.json</span> در مخزن ذخیره می‌شود. انتشار روی GitHub Pages معمولاً کمتر از یک دقیقه طول می‌کشد.</span>
        </div>
        <div class="commit-row">
          ${r("cloud_done",{size:17})}
          <span>آخرین انتشار ثبت‌شده: ${rt(s.baseline.meta.updatedAt)}</span>
          <span class="spacer"></span>
          <span>${O(e.total,M())} تغییر</span>
        </div>
      </form>
    `,footer:`
      <span class="spacer"></span>
      <button class="btn btn--text btn--sm" type="button" data-close>انصراف</button>
      <button class="btn btn--filled btn--sm" type="submit" form="publishForm" data-submit>${r("cloud_upload",{size:17})} انتشار روی گیت‌هاب</button>
    `,onMount:n=>{const i=n.el.querySelector("#publishForm"),c=n.el.querySelector("[data-submit]");i.addEventListener("submit",async m=>{m.preventDefault(),H(n);const l=i.elements.namedItem("message"),d=w(i,"message");if(!d){E(l,"پیام کامیت خالی است."),l.focus();return}x(c,!0,"در حال انتشار…"),n.setBusy(!0);try{const u=tt(xe(s.data),{by:s.data?.settings?.adminName||s.user?.name||"مدیر فروشگاه",action:"publish",summary:ft(e.stockOnly?"به‌روزرسانی موجودی":Ye(e,d)),stats:{added:e.added.length,updated:e.updated.length,removed:e.removed.length}}),p=await Ae(u,d);n.close(),aa(p)}catch(u){x(c,!1),n.setBusy(!1),z(n,u?.message||"انتشار ناموفق بود.")}})}})}function aa(e){const t=e?.commitUrl||(s.repo?`https://github.com/${s.repo.owner}/${s.repo.repo}/commits/${s.repo.branch}`:"");L({title:"تغییرات منتشر شد",size:"narrow",body:`
      <div class="stack" style="gap:16px">
        <div class="login-hero">
          <span class="login-hero__icon">${r("check",{size:24})}</span>
          <div>
            <div class="login-hero__title">لیست جدید در مخزن ثبت شد</div>
            <div class="login-hero__sub">سایت عمومی معمولاً تا یک دقیقه بعد نسخه تازه را نشان می‌دهد. صفحه‌ای که همین حالا می‌بینید، از قبل به‌روز شده است.</div>
          </div>
        </div>
        ${e?.commitSha?`<div class="commit-row">${r("cloud_done",{size:17})}<span dir="ltr" style="font-family:monospace">${f(e.commitSha.slice(0,7))}</span><span class="spacer"></span><span>کامیت ثبت شد</span></div>`:""}
      </div>
    `,footer:`
      <span class="spacer"></span>
      ${t?`<a class="btn btn--text btn--sm" href="${f(t)}" target="_blank" rel="noopener">${r("open_in_new",{size:17})} مشاهده در گیت‌هاب</a>`:""}
      <button class="btn btn--filled btn--sm" type="button" data-close>باشه</button>
    `})}function ae(){if(!s.data)return;const e=new Date().toISOString().slice(0,10);ce(`${ct(s.data.store.name)}-store-${e}.json`,re(s.data)),g("نسخه پشتیبان دانلود شد.",{type:"ok"})}function sa(){if(!s.data)return;const{data:e}=s,t=l=>e.categories.find(d=>d.id===l)?.title||"",a=[],o=[];for(const l of e.categories)for(const d of l.fields){const u=`${l.id}:${d.key}`;a.includes(u)||(a.push(u),o.push(`${l.title} — ${d.label}${d.unit?` (${d.unit})`:""}`))}const n=[["نام فروشگاه",e.store.name],["تلفن",e.store.phone],["آدرس",e.store.address],["آخرین به‌روزرسانی",rt(e.meta.updatedAt)],["توسط",e.meta.updatedBy],[]],i=["نام دستگاه","دسته","برند","وضعیت","موجودی",`قیمت (${e.settings.currency})`,"گارانتی",...o,"مشخصات اضافه","توضیح"],c=e.devices.map(l=>{const d=e.categories.find(u=>u.id===l.categoryId);return[l.name,d?.title||"",l.brand,l.condition,l.stock,l.priceOnRequest||!l.price?"استعلام":l.price,l.warranty,...a.map(u=>{const[p,S]=u.split(":");return p!==l.categoryId?"":l.specs?.[S]||""}),We(l).map(u=>`${u.label}: ${u.value}`).join(" | "),l.note]}),m=Ct([...n,i,...c]);ce(`${ct(e.store.name)}-inventory-${new Date().toISOString().slice(0,10)}.csv`,m,"text/csv"),g("خروجی CSV آماده شد؛ در اکسل قابل باز کردن است.",{type:"ok"})}function ht(){if(!F())return;const e=document.createElement("input");e.type="file",e.accept="application/json,.json",e.style.display="none",document.body.append(e),e.addEventListener("change",async()=>{const t=e.files?.[0];if(e.remove(),!!t)try{const a=await t.text(),o=et(a);if(!await G({title:"بازیابی نسخه پشتیبان",message:"لیست فعلی با محتوای این فایل جایگزین می‌شود. تغییرات فعلی منتشرنشده از بین می‌رود.",confirmText:"بازیابی کن"}))return;it(o),ot(),g("فایل بازیابی شد؛ برای اعمال روی سایت منتشر کنید.",{type:"ok"})}catch(a){g(a.message||"فایل معتبر نیست.",{type:"err"})}}),e.click()}function fa(){document.addEventListener("click",async e=>{const t=e.target.closest("[data-action]");if(!t)return;const a=t.dataset.action;if(Nt.has(a)){e.preventDefault();try{switch(a){case"login":F()?await J():await A();break;case"logout":case"lock":case"demo-exit":await me();break;case"admin-menu":Vt(t);break;case"add-menu":Gt(t);break;case"manage":await J();break;case"publish":await vt();break;case"discard":await he();break;case"settings":te();break;case"security":Y();break;case"add-device":B({categoryId:t.dataset.cat||""});break;case"edit-device":B({id:t.dataset.deviceId});break;case"device-menu":Jt(t,t.dataset.deviceId);break;case"add-category":W({});break;case"edit-category":W({id:t.dataset.cat});break;case"export-backup":ae();break;case"import-backup":ht();break;default:break}}catch(o){console.error("[admin]",o),g(o?.message||"عملیات ناموفق بود.",{type:"err"})}}}),document.addEventListener("ol:edit-device",e=>{B({id:e.detail?.id})}),document.addEventListener("ol:login",()=>{A()}),document.addEventListener("ol:history",()=>{}),window.addEventListener("beforeunload",e=>{F()&&s.dirty&&(nt(),e.preventDefault(),e.returnValue="")}),window.addEventListener("pagehide",()=>{F()&&s.dirty&&nt()}),document.addEventListener("keydown",e=>{if(F()&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="s"){if(document.querySelector("dialog[open]"))return;if(e.preventDefault(),!s.dirty){g("تغییری برای اعمال نیست.",{type:"info"});return}J().then(()=>document.dispatchEvent(new CustomEvent("ol:apply-request"))).catch(t=>console.error("[manage]",t))}})}async function he(){if(!s.dirty){g("تغییری برای بازگردانی نیست.",{type:"info"});return}await G({title:"بازگردانی تغییرات",message:"همه تغییرات منتشرنشده پاک می‌شود و لیست به نسخه‌ی روی مخزن برمی‌گردد.",confirmText:"بازگردانی",danger:!0})&&(It(),at(),g("تغییرات بازگردانی شد.",{type:"ok"}))}function Ne(){const e=new URL("help/",document.baseURI).href;window.open(e,"_blank","noopener")}export{fa as initAdmin,W as openCategoryEditor,B as openDeviceEditor,Ne as openHelp,A as openLogin,J as openManage,vt as openPublish,ve as openResetSheet,Y as openSecurity,te as openSettings};
