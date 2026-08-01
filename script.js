const BASE="https://docs.google.com/spreadsheets/d/e/2PACX-1vT8A9cyBnjTF81P4O7C73qwvoFRA6PpQtaecCskdz-nzBGD8Ro6HiyEm3_y5fj8z4BbHj7whFhXNw10/pub";
const MOTION_REPO_RAW="https://raw.githubusercontent.com/Joon088/motions/main/";
const SHEETS={
  laws:{title:"서버법률",gid:"0"},
  newbie:{title:"뉴비가이드",gid:"734051668"},
  keys:{title:"키가이드",gid:"1492464768"},
  orgs:{title:"기업·조직",gid:"1750937681"},
  motions:{title:"행동모션",gid:"1149480911"},
  faq:{title:"FAQ",gid:"1126385556"},
  discord:{title:"디스코드",gid:"1653925883"}
};
const cache={};let activeKey=null;let rows=[];let motionLimit=12;
const lock=document.getElementById("lockScreen");
const appScreen=document.getElementById("appScreen");
const content=document.getElementById("appContent");
const search=document.getElementById("searchInput");
const searchBox=document.getElementById("searchBox");
const toTop=document.getElementById("toTop");
let startY=0,currentY=0,dragging=false;

function tick(){
  const now=new Date();
  const time=new Intl.DateTimeFormat("ko-KR",{hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
  const date=new Intl.DateTimeFormat("ko-KR",{month:"long",day:"numeric",weekday:"long"}).format(now);
  document.querySelectorAll(".clock-mini").forEach(x=>x.textContent=time);
  document.getElementById("lockTime").textContent=time;
  document.getElementById("lockDate").textContent=date;
}
tick();setInterval(tick,1000);

function dragStart(y){dragging=true;startY=currentY=y;lock.style.transition="none"}
function dragMove(y){if(!dragging)return;currentY=y;const d=Math.min(0,y-startY);lock.style.transform=`translateY(${d}px)`;lock.style.opacity=String(Math.max(.34,1+d/460))}
function dragEnd(){if(!dragging)return;dragging=false;const d=currentY-startY;lock.style.transition="transform .48s cubic-bezier(.2,.84,.18,1),opacity .4s";if(d<-95){lock.style.transform="translateY(-106%)";lock.style.opacity="0";setTimeout(()=>lock.style.pointerEvents="none",460)}else{lock.style.transform="translateY(0)";lock.style.opacity="1"}}
lock.addEventListener("touchstart",e=>dragStart(e.touches[0].clientY),{passive:true});
lock.addEventListener("touchmove",e=>dragMove(e.touches[0].clientY),{passive:true});
lock.addEventListener("touchend",dragEnd);
lock.addEventListener("mousedown",e=>dragStart(e.clientY));
window.addEventListener("mousemove",e=>dragMove(e.clientY));
window.addEventListener("mouseup",dragEnd);
lock.addEventListener("dblclick",()=>{dragStart(200);currentY=0;dragEnd()});

document.querySelectorAll("[data-app]").forEach(b=>b.addEventListener("click",()=>openApp(b.dataset.app)));
document.getElementById("backButton").addEventListener("click",closeApp);
document.getElementById("discordLauncher").addEventListener("click",openDiscord);
search.addEventListener("input",()=>filterRows(search.value));
content.addEventListener("scroll",()=>toTop.classList.toggle("show",content.scrollTop>360));
toTop.addEventListener("click",()=>content.scrollTo({top:0,behavior:"smooth"}));

const SHEET_ID="1FVSPWQpEeg0Qn_MzlnZJFoRO6Wq3K4asPyfOpOkw0V8";
function csvUrl(gid){return `${BASE}?output=csv&gid=${gid}`}

async function getSheet(key){
  if(cache[key])return cache[key];

  // 1차: 공개 CSV 주소
  try{
    const r=await fetch(csvUrl(SHEETS[key].gid),{
      cache:"no-store",
      mode:"cors",
      credentials:"omit"
    });
    if(!r.ok)throw new Error(`CSV HTTP ${r.status}`);
    const text=await r.text();
    const data=csvToObjects(text);
    cache[key]=data;
    return data;
  }catch(csvError){
    console.warn("CSV 방식 실패, GViz 방식으로 재시도:", csvError);
  }

  // 2차: script 태그를 이용한 Google Visualization 응답
  const data=await loadViaGViz(SHEETS[key].gid);
  cache[key]=data;
  return data;
}

function csvToObjects(text){
  const table=parseCSV(text);
  if(!table.length)return [];
  const headers=table[0].map(v=>v.trim());
  return table.slice(1)
    .filter(row=>row.some(v=>String(v).trim()!==""))
    .map(row=>Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??"").trim()])));
}

function loadViaGViz(gid){
  return new Promise((resolve,reject)=>{
    const previousGoogle=window.google;
    const previousVisualization=previousGoogle?.visualization;
    const previousQuery=previousVisualization?.Query;
    const previousSetResponse=previousQuery?.setResponse;

    window.google=window.google||{};
    window.google.visualization=window.google.visualization||{};
    window.google.visualization.Query=window.google.visualization.Query||{};

    const cleanup=(script)=>{
      script.remove();
      if(previousSetResponse){
        window.google.visualization.Query.setResponse=previousSetResponse;
      }else{
        delete window.google.visualization.Query.setResponse;
      }
    };

    const script=document.createElement("script");
    const timeout=setTimeout(()=>{
      cleanup(script);
      reject(new Error("응답 시간 초과"));
    },12000);

    window.google.visualization.Query.setResponse=(response)=>{
      clearTimeout(timeout);
      cleanup(script);

      if(!response||response.status==="error"){
        reject(new Error("응답 오류"));
        return;
      }

      try{
        const cols=(response.table.cols||[]).map((c,i)=>String(c.label||c.id||`열${i+1}`).trim());
        const rows=(response.table.rows||[]).map(r=>{
          const obj={};
          cols.forEach((h,i)=>{
            const cell=r.c?.[i];
            const raw=cell?.v;
            const formatted=cell?.f;
            obj[h]=String(formatted??raw??"").trim();
          });
          return obj;
        }).filter(obj=>Object.values(obj).some(v=>v!==""));
        resolve(rows);
      }catch(err){
        reject(err);
      }
    };

    script.onerror=()=>{
      clearTimeout(timeout);
      cleanup(script);
      reject(new Error("로드 실패"));
    };

    script.src=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${encodeURIComponent(gid)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function parseCSV(s){
  const out=[];let row=[],cell="",q=false;
  for(let i=0;i<s.length;i++){const c=s[i],n=s[i+1];
    if(c=='"'&&q&&n=='"'){cell+='"';i++}
    else if(c=='"'){q=!q}
    else if(c==','&&!q){row.push(cell);cell=""}
    else if((c=='\n'||c=='\r')&&!q){if(c=='\r'&&n=='\n')i++;row.push(cell);out.push(row);row=[];cell=""}
    else cell+=c;
  }
  if(cell.length||row.length){row.push(cell);out.push(row)}return out;
}
function shown(data){
  return data
    .filter(r=>!r["표시"]||["TRUE","true","1","예","Y","y","표시"].includes(String(r["표시"]).trim()))
    .sort((a,b)=>{
      const av=Number(value(a,["순서","번호","order"]));
      const bv=Number(value(b,["순서","번호","order"]));
      if(Number.isFinite(av)&&Number.isFinite(bv))return av-bv;
      if(Number.isFinite(av))return -1;
      if(Number.isFinite(bv))return 1;
      return 0;
    });
}
function value(r,names){for(const n of names)if(r[n]!==undefined&&r[n]!=="")return r[n];return""}

async function openApp(key){
  activeKey=key;motionLimit=12;search.value="";
  document.getElementById("appTitle").textContent=SHEETS[key].title;
  searchBox.style.display=key==="newbie"?"none":"block";
  appScreen.classList.add("open");appScreen.setAttribute("aria-hidden","false");
  content.innerHTML='<div class="loading">불러오는 중…</div>';
  try{rows=shown(await getSheet(key));render(rows)}
  catch(e){
    console.error(e);
    content.innerHTML='<div class="empty">데이터를 불러오지 못했어요.<br>Google Sheets 게시 상태와 인터넷 연결을 확인해주세요.</div>';
  }
}
function closeApp(){appScreen.classList.remove("open");appScreen.setAttribute("aria-hidden","true");activeKey=null;toTop.classList.remove("show")}
function filterRows(term){
  const all=shown(cache[activeKey]||[]),q=term.trim().toLowerCase();
  rows=!q?all:all.filter(r=>Object.values(r).join(" ").toLowerCase().includes(q));
  motionLimit=12;render(rows);
}
function render(data){
  if(!data.length){content.innerHTML='<div class="empty">표시할 내용이 없습니다.<br>확인해주세요.</div>';return}
  if(activeKey==="laws")renderCards(data,["분류","카테고리"],["제목"],["내용"]);
  if(activeKey==="newbie")renderCards(data,[],["제목"],["내용"]);
  if(activeKey==="keys")renderKeys(data);
  if(activeKey==="orgs")renderCards(data,["종류","분류"],["이름"],["설명"]);
  if(activeKey==="motions")renderMotions(data);
  if(activeKey==="faq")renderFaq(data);
}
function renderCards(data,catNames,titleNames,bodyNames){
  content.innerHTML=data.map(r=>`<article class="card">${catNames.length&&value(r,catNames)?`<div class="category">${esc(value(r,catNames))}</div>`:""}<h3>${esc(value(r,titleNames))}</h3><p>${esc(value(r,bodyNames))}</p></article>`).join("");
}
function renderKeys(data){
  content.innerHTML=data.map(r=>`<article class="card key-card"><div class="keycap">${esc(value(r,["키","단축키"]))}</div><div><div class="category">${esc(value(r,["카테고리","분류"]))}</div><h3>${esc(value(r,["설명","기능","내용"]))}</h3></div></article>`).join("");
}
function encodeRepoPath(path){
  return String(path)
    .trim()
    .replace(/^\/+/,"")
    .split("/")
    .map(part=>encodeURIComponent(part))
    .join("/");
}

function normalizeMotionFilename(filename){
  let cleaned=String(filename||"").trim();

  // 사용자가 전체 GitHub 주소를 넣어도 그대로 사용할 수 있게 처리
  if(/^https?:\/\//i.test(cleaned))return cleaned;

  // 파일명 끝에 확장자를 빠뜨렸다면 MP4 자동 추가
  if(cleaned&&!/\.(mp4|webm|gif)$/i.test(cleaned)){
    cleaned+=".mp4";
  }

  return cleaned;
}

function motionUrl(row){
  const direct=value(row,[
    "미디어_URL","미디어 URL","URL","영상_URL","영상 URL",
    "GIF_URL","GIF URL","링크"
  ]);

  if(/^https?:\/\//i.test(direct))return direct;

  const filename=normalizeMotionFilename(value(row,[
    "파일명","파일","미디어파일","미디어 파일",
    "영상파일","영상 파일","MP4","mp4"
  ]));

  if(!filename)return "";
  if(/^https?:\/\//i.test(filename))return filename;

  return MOTION_REPO_RAW+encodeRepoPath(filename);
}

function motionFilename(row){
  return normalizeMotionFilename(value(row,[
    "파일명","파일","미디어파일","미디어 파일",
    "영상파일","영상 파일","MP4","mp4"
  ]));
}

function createMotionFallback(message){
  const fallback=document.createElement("div");
  fallback.className="motion-placeholder motion-error";
  const span=document.createElement("span");
  span.textContent=message;
  fallback.appendChild(span);
  return fallback;
}

function mediaHtml(url,name,filename){
  if(!url){
    return `<div class="motion-placeholder motion-error"><span>파일명을 입력해주세요</span></div>`;
  }

  if(/\.(mp4|webm)(\?|$)/i.test(url)){
    return `<video
      class="motion-video"
      src="${attr(url)}"
      muted
      loop
      playsinline
      preload="metadata"
      aria-label="${attr(name)}"
      data-filename="${attr(filename)}"
    ></video>`;
  }

  return `<img
    class="motion-image"
    src="${attr(url)}"
    alt="${attr(name)}"
    loading="lazy"
    data-filename="${attr(filename)}"
  >`;
}

function setupMotionMedia(){
  const videos=[...content.querySelectorAll(".motion-video")];
  const images=[...content.querySelectorAll(".motion-image")];

  videos.forEach(video=>{
    video.addEventListener("loadedmetadata",()=>{
      const card=video.closest(".motion");
      if(!card||!video.videoWidth||!video.videoHeight)return;

      const ratio=video.videoWidth/video.videoHeight;
      card.classList.remove("portrait","landscape","square");

      if(ratio>1.08){
        card.classList.add("landscape");
      }else if(ratio<0.92){
        card.classList.add("portrait");
      }else{
        card.classList.add("square");
      }

      card.classList.add("media-ready");
    },{once:true});

    video.addEventListener("error",()=>{
      const filename=video.dataset.filename||"알 수 없는 파일";
      const card=video.closest(".motion");
      if(card)card.classList.add("media-ready");
      video.replaceWith(createMotionFallback(`파일을 찾지 못했어요\n${filename}`));
    },{once:true});
  });

  images.forEach(image=>{
    image.addEventListener("load",()=>{
      const card=image.closest(".motion");
      if(!card||!image.naturalWidth||!image.naturalHeight)return;

      const ratio=image.naturalWidth/image.naturalHeight;
      card.classList.remove("portrait","landscape","square");

      if(ratio>1.08){
        card.classList.add("landscape");
      }else if(ratio<0.92){
        card.classList.add("portrait");
      }else{
        card.classList.add("square");
      }

      card.classList.add("media-ready");
    },{once:true});

    image.addEventListener("error",()=>{
      const filename=image.dataset.filename||"알 수 없는 파일";
      const card=image.closest(".motion");
      if(card)card.classList.add("media-ready");
      image.replaceWith(createMotionFallback(`파일을 찾지 못했어요\n${filename}`));
    },{once:true});
  });

  if(!("IntersectionObserver" in window)){
    videos.forEach(video=>video.play().catch(()=>{}));
    return;
  }

  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const video=entry.target;
      if(entry.isIntersecting&&entry.intersectionRatio>=0.4){
        video.play().catch(()=>{});
      }else{
        video.pause();
      }
    });
  },{
    root:content,
    threshold:[0,.4,.75]
  });

  videos.forEach(video=>observer.observe(video));
}

function renderMotions(data){
  const part=data.slice(0,motionLimit);

  content.innerHTML=part.map(row=>{
    const name=value(row,["이름","모션이름","모션 이름","제목"])||"이름 없음";
    const filename=motionFilename(row);
    const url=motionUrl(row);

    return `<article class="card motion">
      ${mediaHtml(url,name,filename)}
      <div class="motion-title">${esc(name)}</div>
    </article>`;
  }).join("")+
  (motionLimit<data.length
    ?'<button class="load-more" id="loadMore">더 불러오기</button>'
    :"");

  setupMotionMedia();

  document.getElementById("loadMore")?.addEventListener("click",()=>{
    motionLimit+=12;
    renderMotions(data);
  });
}

function renderFaq(data){
  content.innerHTML=data.map((r,i)=>`<div><button class="faq-q" data-i="${i}">Q. ${esc(value(r,["질문","제목"]))}</button><div class="faq-a" id="faq-${i}" hidden>${esc(value(r,["답변","내용"]))}</div></div>`).join("");
  content.querySelectorAll("[data-i]").forEach(b=>b.addEventListener("click",()=>{const a=document.getElementById(`faq-${b.dataset.i}`);a.hidden=!a.hidden}));
}
async function openDiscord(){
  try{
    const d=await getSheet("discord");const first=d[0]||{};
    const url=value(first,["URL","링크","discord_url","Value","값","초대링크"])||Object.values(first).find(v=>/^https?:\/\//.test(v));
    if(!url)throw new Error();
    window.open(url,"_blank","noopener");
  }catch{toast("링크를 입력해주세요.")}
}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function attr(v=""){return esc(v)}

/* localhost에서는 오래된 서비스워커 캐시를 사용하지 않음 */
async function configureServiceWorker(){
  if(!("serviceWorker" in navigator))return;

  const isLocal=["localhost","127.0.0.1","[::1]"].includes(location.hostname);

  if(isLocal){
    try{
      const registrations=await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration=>registration.unregister()));

      if("caches" in window){
        const keys=await caches.keys();
        await Promise.all(keys.map(key=>caches.delete(key)));
      }
    }catch(error){
      console.warn("로컬 캐시 정리 실패:",error);
    }
    return;
  }

  window.addEventListener("load",()=>{
    navigator.serviceWorker.register("./sw.js").catch(error=>{
      console.warn("서비스워커 등록 실패:",error);
    });
  });
}

configureServiceWorker();


/* PF Premium Glass 스플래시 */
(function setupSplash(){
  const splash=document.getElementById("splashScreen");
  if(!splash)return;

  const hideSplash=()=>{
    splash.classList.add("is-hidden");
    window.setTimeout(()=>splash.remove(),520);
  };

  const minimumVisible=1050;
  const started=performance.now();

  const finish=()=>{
    const elapsed=performance.now()-started;
    const remaining=Math.max(0,minimumVisible-elapsed);
    window.setTimeout(hideSplash,remaining);
  };

  if(document.readyState==="complete"){
    finish();
  }else{
    window.addEventListener("load",finish,{once:true});
    window.setTimeout(finish,2200);
  }
})();

