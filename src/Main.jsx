import { useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBt4hJMPjXRT2RaKhWyRCVYLg4vO6Bev_8gULP52OhWz6SRPDr3nQLayNulzF8kjsDWA/exec';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const BRANDS = ['바로고', '모아라인', '딜버'];
const BRAND_COLOR = {
  '바로고':   {bg:'#eff6ff', color:'#2563eb', border:'#bfdbfe'},
  '모아라인': {bg:'#f0fdf4', color:'#16a34a', border:'#bbf7d0'},
  '딜버':     {bg:'#fdf4ff', color:'#9333ea', border:'#e9d5ff'},
};

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...options.headers,
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function Main({ user, onLogout, isAdmin, onAdminClick }) {
  const [tab, setTab] = useState('search');

  return (
    <>
      <nav className="nav">
        <button className={`nav-tab ${tab==='search'?'active':''}`} onClick={()=>setTab('search')}>🔍 상점 조회</button>
        <button className={`nav-tab ${tab==='map'?'active':''}`} onClick={()=>setTab('map')}>📐 권역 관리</button>
        {isAdmin && (
          <button className="nav-tab" style={{flex:'0 0 auto',padding:'16px 12px',fontSize:12,color:'var(--accent)',fontWeight:700}}
            onClick={onAdminClick}>
            👤 관리자
          </button>
        )}
        <button className="nav-tab" style={{flex:'0 0 auto',padding:'16px 12px',fontSize:12,color:'var(--text-dim)'}}
          onClick={()=>onLogout()}>
          {user.name} · 로그아웃
        </button>
      </nav>

      <div style={{display: tab==='search' ? 'block' : 'none'}}>
        <SearchPage />
      </div>

      <div style={{
        position:'fixed', top:49, left:0, right:0, bottom:0,
        visibility: tab==='map' ? 'visible' : 'hidden',
        pointerEvents: tab==='map' ? 'auto' : 'none',
      }}>
        <MapPage active={tab==='map'} />
      </div>
    </>
  );
}

function SearchPage() {
  const [db, setDb] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [storeInput, setStoreInput] = useState('');
  const [addrInput, setAddrInput] = useState('');
  const [stats, setStats] = useState({total:0,possible:0,impossible:0,check:0});

  useEffect(() => { loadDB(); }, []);

  async function loadDB() {
    try {
      const res = await fetch(SCRIPT_URL + '?action=getDB');
      const data = await res.json();
      const parsed = data.filter(r=>r['브랜드명']||r['상점명']).map(parseDBRow);
      setDb(parsed);
      const total = parsed.length;
      const possible = parsed.filter(d=>d.status&&d.status!=='X'&&d.status!=='확인필요'&&d.status!=='').length;
      const impossible = parsed.filter(d=>d.status==='X'||d.status==='불가'||d.status==='수행불가').length;
      setStats({total, possible, impossible, check: total-possible-impossible});
    } catch(e) { console.log('DB 로드 실패',e); }
  }

  async function doSearch() {
    if(!storeInput.trim()) { alert('상점명을 입력해주세요.'); return; }
    if(!addrInput.trim()) { alert('주소를 입력해주세요.'); return; }
    setLoading(true); setResult(null);
    const inputCoord = await getCoordFromAddr(addrInput);
    const inDong = inputCoord?.dong || extractDong(addrInput) || '';
    const parsed = parseKey(storeInput);
    const preScored = db.map(item=>({...item,_ns:strSim(parsed.store,item.store)})).sort((a,b)=>b._ns-a._ns).slice(0,30);
    await Promise.all(preScored.map(async item=>{
      if((!item.lat||!item.lng)&&item.address){
        const c=await getCoordFromAddr(item.address);
        if(c){item.lat=c.lat;item.lng=c.lng;item.dong=c.dong||item.dong;}
      }
    }));
    const scored = preScored.map(item=>{
      const ns=item._ns; let dSc=0,km=null;
      if(inputCoord&&item.lat&&item.lng){km=haversine(inputCoord.lat,inputCoord.lng,item.lat,item.lng);dSc=distScore(km);}
      const dong=dongScore(inDong,item.dong,km,addrInput,item.address);
      const total=Math.min(1,ns*0.10+dong*0.10+dSc*0.80);
      return{...item,_km:km?km.toFixed(2):null,score:total,sd:{name:Math.round(ns*100),dong:Math.round(dong*100),dist:Math.round(dSc*100),total:Math.round(total*100)}};
    }).sort((a,b)=>b.score-a.score);
    const best=scored[0];
    const others=scored.slice(1,4).filter(x=>x.score>0.05);
    const displayItem={...best,key:storeInput,brand:parsed.brand,store:parsed.store,address:addrInput,lat:inputCoord?.lat||best?.lat,lng:inputCoord?.lng||best?.lng,_km:null};
    setLoading(false);
    setResult({best,displayItem,others,inputCoord});
  }

  return (
    <div className="wrap">
      <div className="page-header"><h1>바로고 북부광역사업부</h1><p>B2B 실수행 상점 조회 시스템</p></div>
      <div className="stats">
        <div className="stat"><div className="stat-n">{stats.total}</div><div className="stat-l">전체 상점</div></div>
        <div className="stat"><div className="stat-n" style={{color:'var(--green)'}}>{stats.possible}</div><div className="stat-l">수행 가능</div></div>
        <div className="stat"><div className="stat-n" style={{color:'var(--red)'}}>{stats.impossible}</div><div className="stat-l">불가</div></div>
        <div className="stat"><div className="stat-n" style={{color:'var(--yellow)'}}>{stats.check}</div><div className="stat-l">확인 필요</div></div>
      </div>
      <div className="card">
        <div className="card-label">신규 실수행 조사 상점 입력</div>
        <div className="input-row">
          <div className="field">
            <div className="field-label">상점명</div>
            <input className="inp big" value={storeInput} onChange={e=>setStoreInput(e.target.value)} placeholder="맥도날드[강남점]" onKeyDown={e=>e.key==='Enter'&&doSearch()} />
          </div>
          <div className="field">
            <div className="field-label">주소</div>
            <input className="inp" value={addrInput} onChange={e=>setAddrInput(e.target.value)} placeholder="서울시 강남구 강남대로 396" onKeyDown={e=>e.key==='Enter'&&doSearch()} />
          </div>
        </div>
        <button className="btn-primary" onClick={doSearch}>🔍 &nbsp;DB 매칭 조회</button>
        <div className="format-tip">💡 형식: <code>브랜드명[상점명]</code> 예) <code>맥도날드[강남점]</code></div>
      </div>
      {loading && <div style={{textAlign:'center',padding:40,color:'var(--text-dim)'}}>🔍 매칭 중...</div>}
      {result && <ResultCard result={result} onReset={()=>{setResult(null);setStoreInput('');setAddrInput('');}} />}
    </div>
  );
}

function ResultCard({ result, onReset }) {
  const { best, displayItem, others } = result;
  if (!best || best.score < 0.12) return (
    <div className="no-match">
      <div className="no-match-icon">🔍</div>
      <div className="no-match-title">일치 데이터 없음</div>
      <div className="no-match-desc"><strong>{displayItem.key}</strong>에 대한 기존 데이터가 없습니다.</div>
      <div style={{display:'flex',gap:8,justifyContent:'center',marginTop:16}}>
        <button className="btn btn-ghost" onClick={onReset}>↩ 다시</button>
      </div>
    </div>
  );
  const d = displayItem.sd;
  const sc = v => v>=80?'possible':v>=50?'check':'impossible';
  const bc = v => v>=80?'var(--accent)':v>=70?'var(--yellow)':v>=50?'var(--orange)':'var(--red)';
  const label = v => v>=80?'수행 가능 O':v>=50?'확인 필요 △':'DB 업데이트 필요 X';
  return (
    <>
      <div className={`res-card ${sc(d.total)}`}>
        <div className="res-top">
          <div>
            <div className="res-name">
              <span>{displayItem.brand}</span><span style={{color:'var(--text-dim)'}}>[</span>
              <span style={{color:'var(--accent)'}}>{displayItem.store}</span><span style={{color:'var(--text-dim)'}}>]</span>
            </div>
            <div className="res-addr">📍 {displayItem.address}</div>
          </div>
          <div className={`status-pill ${sc(d.total)}`}>{label(d.total)}</div>
        </div>
        <div className="info-grid">
          <div className="itile"><div className="itile-l">수행배대사</div><div className="itile-v c-accent">{best.deliveryCompany||'—'}</div></div>
          <div className="itile"><div className="itile-l">수행허브</div><div className="itile-v">{best.hub||'—'}</div></div>
          <div className="itile"><div className="itile-l">공유허브</div><div className="itile-v">{best.sharedHub||'없음'}</div></div>
          <div className="itile"><div className="itile-l">총판 선차감</div><div className="itile-v">{best.preDeductTotal||'—'}</div></div>
          <div className="itile"><div className="itile-l">허브 선차감</div><div className="itile-v">{best.preDeductHub||'—'}</div></div>
          <div className="itile"><div className="itile-l">허브 운영시간</div><div className="itile-v">{best.hubOpen&&best.hubClose?`${best.hubOpen} ~ ${best.hubClose}`:'—'}</div></div>
          <div className="itile"><div className="itile-l">허브 담당자</div><div className="itile-v">{best.hubManager||'—'}</div></div>
        </div>
        {best.memo && <div className="memo">⚠️ <span>{best.memo}</span></div>}
        <div className="score-sec">
          <div className="score-title">매칭 신뢰도 분석</div>
          {[['상점명 유사도',d.name],['법정동 일치',d.dong],['거리 근접도',d.dist]].map(([l,v])=>(
            <div className="srow" key={l}>
              <div className="srow-l">{l}</div>
              <div className="sbar"><div className="sfill" style={{width:`${v}%`,background:bc(v)}}></div></div>
              <div className="spct" style={{color:bc(v)}}>{v}%</div>
            </div>
          ))}
          <div className="stotal"><div className="stotal-l">종합 매칭 신뢰도</div><div className="stotal-v">{d.total}%</div></div>
        </div>
      </div>
      <div className="action-row">
        <button className="btn btn-outline" onClick={onReset}>↩ 다시</button>
      </div>
      {others.length > 0 && (
        <div className="similar-card">
          <div className="card-label">유사 상점 후보</div>
          <div className="sim-list">
            {others.map(o => (
              <div className="sim-item" key={o.key}>
                <div>
                  <div className="sim-name">{o.brand}[{o.store}]</div>
                  <div className="sim-addr">📍 {o.address}{o._km?` · ${o._km}km`:''}</div>
                </div>
                <div className="sim-right">
                  <div className="chips">
                    <span className="chip chip-n">명 {o.sd.name}%</span>
                    <span className="chip chip-d">동 {o.sd.dong}%</span>
                    <span className="chip chip-k">거 {o.sd.dist}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── 유틸 ──
function parseDBRow(row) {
  const brand=String(row['브랜드명']||'').trim();
  const storeFull=String(row['상점명']||'').trim();
  const hasFormat=storeFull.includes('[')&&storeFull.includes(']');
  const key=hasFormat?storeFull:(storeFull?`${brand}[${storeFull}]`:brand);
  const storeMatch=storeFull.match(/\[(.+?)\]/);
  const store=storeMatch?storeMatch[1]:storeFull;
  const addr=String(row['상점주소']||'').trim();
  return {
    key,brand,store,address:addr,dong:extractDong(addr),lat:0,lng:0,
    status:String(row['수행가능답변']||'확인필요').trim(),
    hub:String(row['메인허브명']||'').trim(),
    sharedHub:String(row['공유허브명']||'').trim(),
    preDeductTotal:row['총판']!==undefined?String(row['총판']).trim():'',
    preDeductHub:row['허브']!==undefined?String(row['허브']).trim():'',
    hubOpen:String(row['허브오픈시간']||'').trim(),
    hubClose:String(row['허브마감시간']||'').trim(),
    deliveryCompany:String(row['수행배대사']||'').trim(),
    hubManager:String(row['담당자2']||'').trim(),
    memo:String(row['불가/보류사유']||'').trim(),
  };
}
function parseKey(raw){const m=raw.match(/^(.+?)\[(.+?)\]$/);return m?{brand:m[1].trim(),store:m[2].trim()}:{brand:raw.trim(),store:''};}
function extractDong(a){const m=(a||'').match(/([가-힣]+동|[가-힣]+가)\b/);return m?m[1]:'';}
function norm(s){return(s||'').replace(/\s/g,'').toLowerCase();}
function strSim(a,b){
  const ex=s=>{const m=(s||'').match(/\[(.+?)\]/);return m?m[1]:s;};
  a=norm(ex(a));b=norm(ex(b));
  if(!a||!b)return 0;if(a===b)return 1;
  let max=0;
  for(let i=0;i<a.length;i++)for(let j=i+1;j<=a.length;j++){const s=a.slice(i,j);if(b.includes(s)&&s.length>max)max=s.length;}
  return max>=4?1.0:max>=3?0.9:max>=2?0.8:0;
}
function haversine(la1,lo1,la2,lo2){const R=6371,d=Math.PI/180,dla=(la2-la1)*d,dlo=(lo2-lo1)*d,av=Math.sin(dla/2)**2+Math.cos(la1*d)*Math.cos(la2*d)*Math.sin(dlo/2)**2;return R*2*Math.atan2(Math.sqrt(av),Math.sqrt(1-av));}
function distScore(km){if(km<=0.10)return 1.00;if(km<=0.15)return 0.95;if(km<=0.20)return 0.90;if(km<=0.30)return 0.85;if(km<=0.40)return 0.80;if(km<=0.50)return 0.75;if(km<=0.70)return 0.65;if(km<=1.00)return 0.55;if(km<=1.50)return 0.40;if(km<=2.00)return 0.25;if(km<=3.00)return 0.10;return 0;}
function dongScore(inDong,itemDong,km,inAddr,itemAddr){
  if(!inDong||!itemDong)return 0;if(inDong===itemDong)return 1;
  const inGu=(inAddr||'').match(/([가-힣]+구)/)?.[1]||'';
  const itemGu=(itemAddr||'').match(/([가-힣]+구)/)?.[1]||'';
  const sameGu=inGu&&itemGu&&inGu===itemGu;
  if(km!==null){if(km<=0.10)return 0.95;if(km<=0.20)return 0.85;if(km<=0.30)return sameGu?0.80:0.75;if(km<=0.50)return sameGu?0.70:0.50;if(km<=1.00)return sameGu?0.50:0.20;}
  return sameGu?0.30:0;
}
function getCoordFromAddr(addr){
  return new Promise(resolve=>{
    if(!window.kakao?.maps?.services){resolve(null);return;}
    const gc=new window.kakao.maps.services.Geocoder();
    gc.addressSearch(addr,(res,st)=>{
      if(st===window.kakao.maps.services.Status.OK){
        const r=res[0];
        resolve({lat:parseFloat(r.y),lng:parseFloat(r.x),dong:r.address?.region_3depth_name||r.road_address?.region_3depth_name||''});
      } else resolve(null);
    });
  });
}

// ── 법정동 point-in-polygon ──
function pointInPolygon([px,py], ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const[xi,yi]=ring[i],[xj,yj]=ring[j];
    if(((yi>py)!==(yj>py))&&(px<(xj-xi)*(py-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

// ── 권역 관리 ──
function MapPage({ active }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const [hubList, setHubList] = useState([]);
  const [savedZones, setSavedZones] = useState({});
  const [hubVisible, setHubVisible] = useState({});
  const [currentLayer, setCurrentLayer] = useState('zone');
  const [isDrawing, setIsDrawing] = useState(false);
  const [status, setStatus] = useState('허브를 추가하고 선택 후 그리기 시작');
  const [hubAddName, setHubAddName] = useState('');
  const [hubAddBrand, setHubAddBrand] = useState('');
  const [selectedHub, setSelectedHub] = useState('');
  const [brandFilter, setBrandFilter] = useState('전체');
  const [emdOn, setEmdOn] = useState(false); // 법정동 표시 토글

  const currentPathRef = useRef([]);
  const tempPolylineRef = useRef(null);
  const tempPolygonRef = useRef(null);
  const savedZonesRef = useRef({});
  const hubListRef = useRef([]);
  const isDrawingRef = useRef(false);
  const currentLayerRef = useRef('zone');

  // 법정동 오버레이용 ref
  const emdDataRef = useRef(null);       // 로드된 GeoJSON (한 번만 fetch)
  const emdPolygonsRef = useRef([]);     // 카카오 폴리곤 객체들
  const emdLabelsRef = useRef([]);       // 카카오 커스텀오버레이(이름 라벨)들
  const emdOnRef = useRef(false);        // 토글 상태 ref (이벤트 클로저용)

  useEffect(()=>{savedZonesRef.current=savedZones;},[savedZones]);
  useEffect(()=>{hubListRef.current=hubList;},[hubList]);
  useEffect(()=>{isDrawingRef.current=isDrawing;},[isDrawing]);
  useEffect(()=>{currentLayerRef.current=currentLayer;},[currentLayer]);
  useEffect(()=>{emdOnRef.current=emdOn;},[emdOn]);

  useEffect(()=>{
    loadZonesFromSupabase();
    initMapWhenReady();
  },[]);

  useEffect(()=>{
    if(active&&mapInstanceRef.current) setTimeout(()=>mapInstanceRef.current.relayout(),50);
  },[active]);

  // 법정동 토글 버튼 눌렀을 때
  useEffect(()=>{
    if(!mapInstanceRef.current) return;
    const whiteEl = document.getElementById('emd-white-overlay');
    if(emdOn){
      if(whiteEl) whiteEl.style.display='block';
      handleEmdZoom();
    } else {
      if(whiteEl) whiteEl.style.display='none';
      clearEmdOverlay();
    }
  },[emdOn]);

  function initMapWhenReady(){
    const tryInit=()=>{
      if(window.kakao&&window.kakao.maps&&window.kakaoMapReady&&mapRef.current) initMap();
      else setTimeout(tryInit,300);
    };
    tryInit();
  }

  function initMap(){
    if(!mapRef.current||mapInstanceRef.current) return;
    const map=new window.kakao.maps.Map(mapRef.current,{center:new window.kakao.maps.LatLng(37.5172,127.0473),level:8});
    mapInstanceRef.current=map;
    window.kakao.maps.event.addListener(map,'click',onMapClick);
    window.kakao.maps.event.addListener(map,'zoom_changed',handleEmdZoom);
    window.kakao.maps.event.addListener(map,'dragend',handleEmdZoom);

    // 흰막 div를 mapRef 안에 삽입 (Kakao 레이어들과 같은 stacking context)
    const whiteEl = document.createElement('div');
    whiteEl.id = 'emd-white-overlay';
    whiteEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.60);pointer-events:none;z-index:150;display:none;';
    mapRef.current.appendChild(whiteEl);

    restorePolygonsOnMap(map,savedZonesRef.current,hubVisible);
  }

  // 법정동 GeoJSON 로드 (최초 1회)
  async function loadEmdData(){
    if(emdDataRef.current) return;
    try {
      const res = await fetch('/emd_simplified.geojson');
      emdDataRef.current = await res.json();
    } catch(e){ console.log('법정동 GeoJSON 로드 실패',e); }
  }

  // 줌 변경 시 법정동 오버레이 처리
  async function handleEmdZoom(){
    if(!emdOnRef.current) return;
    const map = mapInstanceRef.current;
    if(!map) return;
    const level = map.getLevel();

    // 레벨 5~6 구간에서만 표시
    if(level >= 5 && level <= 6){
      await loadEmdData();
      drawEmdOverlay();
    } else {
      clearEmdOverlay();
    }
  }

  // 법정동 경계 + 이름 그리기
  function drawEmdOverlay(){
    const map = mapInstanceRef.current;
    if(!map || !emdDataRef.current) return;
    clearEmdOverlay();

    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    emdDataRef.current.features.forEach(feature=>{
      const { nm, cx, cy, gu } = feature.properties;
      const geomType = feature.geometry.type;
      const coordsList = geomType === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

      let inBounds = false;

      coordsList.forEach(polygonCoords=>{
        const outer = polygonCoords[0];
        const hasPoint = outer.some(([lng,lat])=>
          lat>=sw.getLat()&&lat<=ne.getLat()&&lng>=sw.getLng()&&lng<=ne.getLng()
        );
        if(!hasPoint) return;
        inBounds = true;

        const path = outer.map(([lng,lat])=>new window.kakao.maps.LatLng(lat,lng));
        const poly = new window.kakao.maps.Polygon({
          map, path,
          zIndex: 200,
          strokeWeight: 2,
          strokeColor: '#222222',
          strokeOpacity: 1,
          fillColor: '#000000',
          fillOpacity: 0,
        });
        emdPolygonsRef.current.push(poly);
      });

      if(inBounds && cx && cy){
        const labelContent = `<div style="text-align:center;line-height:1.3;pointer-events:none;">
          ${gu?`<div style="font-size:10px;color:#000;font-weight:500;white-space:nowrap;">${gu}</div>`:''}
          <div style="font-size:13px;color:#000;font-weight:700;white-space:nowrap;letter-spacing:-0.3px;">${nm}</div>
        </div>`;
        const label = new window.kakao.maps.CustomOverlay({
          map,
          position: new window.kakao.maps.LatLng(cy, cx),
          content: labelContent,
          zIndex: 9999,
          yAnchor: 0.5,
          xAnchor: 0.5,
        });
        emdLabelsRef.current.push(label);
      }
    });
  }

  // 법정동 오버레이 전부 제거
  function clearEmdOverlay(){
    emdPolygonsRef.current.forEach(p=>{ try{ p.setMap(null); }catch(e){} });
    emdLabelsRef.current.forEach(l=>{ try{ l.setMap(null); }catch(e){} });
    emdPolygonsRef.current=[];
    emdLabelsRef.current=[];

  }

  function restorePolygonsOnMap(map,zones,visible){
    Object.entries(zones).forEach(([hub,v])=>{
      const show=visible[hub]!==false;
      if(v.zonePolygon){try{v.zonePolygon.setMap(null);}catch(e){}}
      (v.surPolygons||[]).forEach(p=>{try{p.setMap(null);}catch(e){}});
      v.zonePolygon=null;v.surPolygons=[];
      if(v.zonePath?.length>=3){
        v.zonePolygon=new window.kakao.maps.Polygon({
          map,path:v.zonePath.map(p=>new window.kakao.maps.LatLng(p.lat,p.lng)),
          strokeWeight:2,strokeColor:'#2563eb',strokeOpacity:1,fillColor:'#2563eb',fillOpacity:0.15
        });
        if(!show) v.zonePolygon.setMap(null);
        window.kakao.maps.event.addListener(v.zonePolygon,'click',()=>selectHub(hub));
      }
      v.surPolygons=(v.surPaths||[]).filter(sp=>sp?.length>=3).map(sp=>{
        const poly=new window.kakao.maps.Polygon({
          map,path:sp.map(p=>new window.kakao.maps.LatLng(p.lat,p.lng)),
          strokeWeight:2,strokeColor:'#ea580c',strokeOpacity:1,fillColor:'#ea580c',fillOpacity:0.25
        });
        if(!show) poly.setMap(null);
        window.kakao.maps.event.addListener(poly,'click',()=>selectHub(hub));
        return poly;
      });
    });
  }

  function selectHub(name){
    setSelectedHub(name);
    setStatus(`[${name}] 선택됨 — 그리기 시작을 눌러주세요`);
    const el=document.getElementById(`hub-item-${name}`);
    if(el) el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function onMapClick(e){
    if(!isDrawingRef.current) return;
    currentPathRef.current.push(new window.kakao.maps.LatLng(e.latLng.getLat(),e.latLng.getLng()));
    updateTempDraw();
  }

  function updateTempDraw(){
    const map=mapInstanceRef.current;
    if(!map) return;
    if(tempPolylineRef.current) tempPolylineRef.current.setMap(null);
    if(tempPolygonRef.current) tempPolygonRef.current.setMap(null);
    const color=currentLayerRef.current==='surcharge'?'#ea580c':'#2563eb';
    const path=currentPathRef.current;
    if(path.length>=2) tempPolygonRef.current=new window.kakao.maps.Polygon({map,path,strokeWeight:2,strokeColor:color,strokeOpacity:0.9,fillColor:color,fillOpacity:0.15});
    tempPolylineRef.current=new window.kakao.maps.Polyline({map,path,strokeWeight:2,strokeColor:color,strokeOpacity:1});
  }

  function toggleDraw(){
    if(!selectedHub){alert('허브 관리에서 허브를 먼저 선택해주세요!');return;}
    const next=!isDrawing;
    setIsDrawing(next);
    if(next) setStatus(`[${selectedHub}] ${currentLayer==='zone'?'🔵 기본 권역':'🟠 할증 구역'} 그리는 중 — 지도 클릭`);
    else setStatus('그리기 중단');
  }

  function undoLast(){currentPathRef.current.pop();updateTempDraw();}

  function saveZone(){
    if(!selectedHub){alert('허브를 선택해주세요!');return;}
    if(currentPathRef.current.length<3){alert('최소 3개 이상 점을 찍어주세요!');return;}
    const map=mapInstanceRef.current;
    const color=currentLayer==='surcharge'?'#ea580c':'#2563eb';
    const polygon=new window.kakao.maps.Polygon({
      map,path:currentPathRef.current,
      strokeWeight:2,strokeColor:color,strokeOpacity:1,
      fillColor:color,fillOpacity:currentLayer==='surcharge'?0.25:0.15
    });
    window.kakao.maps.event.addListener(polygon,'click',()=>selectHub(selectedHub));
    const pathData=currentPathRef.current.map(p=>({lat:p.getLat(),lng:p.getLng()}));
    setSavedZones(prev=>{
      const next={...prev};
      if(!next[selectedHub]) next[selectedHub]={zonePolygon:null,surPolygons:[],zonePath:[],surPaths:[],brand:''};
      if(currentLayer==='zone'){
        if(next[selectedHub].zonePolygon) next[selectedHub].zonePolygon.setMap(null);
        next[selectedHub].zonePolygon=polygon;
        next[selectedHub].zonePath=pathData;
      } else {
        next[selectedHub].surPolygons=[...(next[selectedHub].surPolygons||[]),polygon];
        next[selectedHub].surPaths=[...(next[selectedHub].surPaths||[]),pathData];
      }
      saveHubToSupabase(selectedHub, next[selectedHub]);
      return next;
    });
    clearCurrent();
    setStatus(`[${selectedHub}] ${currentLayer==='zone'?'기본 권역':'할증 구역'} 저장 완료! ✅`);
  }

  function clearCurrent(){
    if(tempPolylineRef.current) tempPolylineRef.current.setMap(null);
    if(tempPolygonRef.current) tempPolygonRef.current.setMap(null);
    currentPathRef.current=[];
    tempPolylineRef.current=null;tempPolygonRef.current=null;
    setIsDrawing(false);
  }

  async function addHub(){
    if(!hubAddName.trim()){alert('허브명을 입력해주세요!');return;}
    if(!hubAddBrand){alert('브랜드를 선택해주세요!');return;}
    if(hubList.find(h=>h.name===hubAddName.trim())){alert('이미 존재하는 허브입니다!');return;}
    const newName=hubAddName.trim();
    try {
      await sbFetch('/hubs', {
        method:'POST',
        headers:{'Prefer':'resolution=ignore-duplicates,return=minimal'},
        body:JSON.stringify({name:newName, brand:hubAddBrand, zone_path:[], sur_paths:[]})
      });
    } catch(e) { console.log('허브 추가 실패',e); }
    const next=[...hubList,{name:newName,brand:hubAddBrand}];
    setHubList(next);
    setSavedZones(prev=>{
      const z={...prev};
      if(!z[newName]) z[newName]={zonePolygon:null,surPolygons:[],zonePath:[],surPaths:[],brand:hubAddBrand};
      return z;
    });
    selectHub(newName);
    setHubAddName('');setHubAddBrand('');
  }

  async function deleteHub(name){
    if(!confirm(`[${name}] 허브를 삭제할까요?\n그려진 권역도 함께 삭제됩니다.`)) return;
    try {
      await sbFetch(`/hubs?name=eq.${encodeURIComponent(name)}`, {method:'DELETE'});
    } catch(e) { console.log('허브 삭제 실패',e); }
    const z=savedZonesRef.current[name];
    if(z){
      if(z.zonePolygon) z.zonePolygon.setMap(null);
      (z.surPolygons||[]).forEach(p=>{try{p.setMap(null);}catch(e){}});
    }
    const nextList=hubList.filter(h=>h.name!==name);
    const nextZones={...savedZonesRef.current};
    delete nextZones[name];
    setHubList(nextList);setSavedZones(nextZones);
    if(selectedHub===name){setSelectedHub('');setStatus('허브를 선택해주세요');}
  }

  async function saveHubToSupabase(name, zone){
    try {
      const brand = hubListRef.current.find(h=>h.name===name)?.brand || zone.brand || '';
      await sbFetch(`/hubs?name=eq.${encodeURIComponent(name)}`, {
        method:'PATCH',
        headers:{'Prefer':'return=minimal'},
        body:JSON.stringify({
          brand,
          zone_path: zone.zonePath||[],
          sur_paths: zone.surPaths||[],
        })
      });
    } catch(e) { console.log('권역 저장 실패',e); }
  }

  function toggleHubVisible(name){
    const next={...hubVisible,[name]:hubVisible[name]===false?true:false};
    setHubVisible(next);
    const map=mapInstanceRef.current;
    if(!map) return;
    const z=savedZonesRef.current[name];
    if(!z) return;
    const show=next[name];
    if(show){
      if(z.zonePolygon) z.zonePolygon.setMap(map);
      (z.surPolygons||[]).forEach(p=>{try{p.setMap(map);}catch(e){}});
    } else {
      if(z.zonePolygon) z.zonePolygon.setMap(null);
      (z.surPolygons||[]).forEach(p=>{try{p.setMap(null);}catch(e){}});
    }
  }

  async function loadZonesFromSupabase(){
    try {
      const data = await sbFetch('/hubs?order=created_at.asc');
      if(!data) return;
      const newHubList = data.map(h=>({name:h.name, brand:h.brand||''}));
      const newZones = {};
      data.forEach(h=>{
        newZones[h.name]={
          zonePolygon:null, surPolygons:[],
          zonePath: h.zone_path||[],
          surPaths: h.sur_paths||[],
          brand: h.brand||''
        };
      });
      setHubList(newHubList);
      setSavedZones(newZones);
      if(mapInstanceRef.current) restorePolygonsOnMap(mapInstanceRef.current, newZones, hubVisible);
    } catch(e) { console.log('Supabase 로드 실패',e); }
  }

  const filteredHubs=brandFilter==='전체'?hubList:hubList.filter(h=>{
    const brand=savedZones[h.name]?.brand||h.brand||'';
    return brand===brandFilter;
  });

  return (
    <div style={{width:'100%',height:'100%',position:'relative'}}>
      <div ref={mapRef} style={{width:'100%',height:'100%'}} />


      <div className="map-toolbar">
        <div className="map-panel">
          <div className="map-panel-title">✏️ 권역 그리기</div>
          <input
            value={hubAddName} onChange={e=>setHubAddName(e.target.value)}
            placeholder="새 허브명 입력" onKeyDown={e=>e.key==='Enter'&&addHub()}
            style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'8px 12px',
              fontFamily:'Pretendard',fontSize:13,fontWeight:600,outline:'none',marginBottom:7,color:'var(--text)'}}
          />
          <div style={{display:'flex',gap:5,marginBottom:8}}>
            {BRANDS.map(b=>{
              const c=BRAND_COLOR[b]||{};
              const sel=hubAddBrand===b;
              return (
                <button key={b} onClick={()=>setHubAddBrand(b)} style={{
                  flex:1,padding:'6px 2px',borderRadius:7,cursor:'pointer',transition:'all 0.15s',
                  border:`1.5px solid ${sel?c.border:'var(--border)'}`,
                  background:sel?c.bg:'var(--bg)',color:sel?c.color:'var(--text-dim)',
                  fontFamily:'Pretendard',fontSize:11,fontWeight:700
                }}>{b}</button>
              );
            })}
          </div>
          <button onClick={addHub} style={{
            width:'100%',padding:'8px',background:'var(--accent)',border:'none',borderRadius:8,
            color:'#fff',fontFamily:'Pretendard',fontSize:13,fontWeight:700,cursor:'pointer',marginBottom:12
          }}>+ 허브 추가</button>
          <div style={{borderTop:'1px solid var(--border)',marginBottom:12}} />
          <div style={{
            padding:'8px 10px',borderRadius:8,marginBottom:10,fontSize:12,fontWeight:700,
            background:selectedHub?'#eff6ff':'var(--bg)',
            border:`1.5px solid ${selectedHub?'var(--accent)':'var(--border)'}`,
            color:selectedHub?'var(--accent)':'var(--text-dim)'
          }}>
            {selectedHub?`✅ ${selectedHub}`:'← 허브 관리에서 허브 클릭'}
          </div>
          <div className="layer-tabs">
            <button className={`layer-tab zone ${currentLayer==='zone'?'active':''}`} onClick={()=>setCurrentLayer('zone')}>🔵 기본 권역</button>
            <button className={`layer-tab surcharge ${currentLayer==='surcharge'?'active':''}`} onClick={()=>setCurrentLayer('surcharge')}>🟠 할증 구역</button>
          </div>
          <div className="draw-btns">
            <button className={`draw-btn ${isDrawing?(currentLayer==='surcharge'?'drawing-sur':'drawing'):''}`} onClick={toggleDraw}>
              {isDrawing?'⏹️ 그리기 중단':'✏️ 그리기 시작'}
            </button>
            <button className="draw-btn" onClick={undoLast}>↩️ 마지막 점 취소</button>
            <button className="draw-btn save" onClick={saveZone}>💾 저장</button>
            <button className="draw-btn del" onClick={clearCurrent}>🗑 취소</button>
          </div>

          {/* 법정동 경계 토글 */}
          <div style={{borderTop:'1px solid var(--border)',marginTop:12,paddingTop:12}}>
            <button
              onClick={()=>setEmdOn(v=>!v)}
              style={{
                width:'100%',padding:'8px',borderRadius:8,cursor:'pointer',
                fontFamily:'Pretendard',fontSize:12,fontWeight:700,
                border:`1.5px solid ${emdOn?'#2563eb':'var(--border)'}`,
                background:emdOn?'#eff6ff':'var(--bg)',
                color:emdOn?'#2563eb':'var(--text-dim)',
                transition:'all 0.15s',
              }}
            >
              🗺️ 법정동 경계 {emdOn?'ON':'OFF'}
            </button>
            {emdOn && (
              <div style={{fontSize:10,color:'var(--text-dim)',textAlign:'center',marginTop:4}}>
                줌 레벨 5~6에서 경계선 표시
              </div>
            )}
          </div>
        </div>

        <div className="map-panel">
          <div className="map-panel-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>📋 허브 관리</span>
            <span style={{fontSize:10,color:'var(--text-dim)',fontWeight:400}}>{filteredHubs.length}개</span>
          </div>
          <div style={{display:'flex',gap:4,marginBottom:10,flexWrap:'wrap'}}>
            {['전체',...BRANDS].map(b=>{
              const c=BRAND_COLOR[b]||{};
              const sel=brandFilter===b;
              return (
                <button key={b} onClick={()=>setBrandFilter(b)} style={{
                  padding:'4px 8px',borderRadius:6,fontSize:10,fontWeight:700,cursor:'pointer',transition:'all 0.15s',
                  border:`1px solid ${sel?(b==='전체'?'var(--accent)':c.border):'var(--border)'}`,
                  background:sel?(b==='전체'?'var(--accent-light)':c.bg):'var(--bg)',
                  color:sel?(b==='전체'?'var(--accent)':c.color):'var(--text-dim)',
                }}>{b}</button>
              );
            })}
          </div>
          <div style={{maxHeight:320,overflowY:'auto',display:'flex',flexDirection:'column',gap:5}}>
            {filteredHubs.length===0
              ? <div style={{fontSize:12,color:'var(--text-dim)',textAlign:'center',padding:'16px 0'}}>
                  {hubList.length===0?'추가된 허브 없음':'해당 브랜드 허브 없음'}
                </div>
              : filteredHubs.map(h=>{
                  const zone=savedZones[h.name];
                  const brand=zone?.brand||h.brand||'';
                  const surCount=(zone?.surPaths||[]).length;
                  const hasZone=(zone?.zonePath||[]).length>=3;
                  const bc=BRAND_COLOR[brand]||{};
                  const visible=hubVisible[h.name]!==false;
                  const isSelected=selectedHub===h.name;
                  return (
                    <div key={h.name} id={`hub-item-${h.name}`}
                      onClick={()=>selectHub(h.name)}
                      style={{
                        background:isSelected?'#eff6ff':'var(--bg)',
                        border:`1.5px solid ${isSelected?'var(--accent)':'var(--border)'}`,
                        borderRadius:9,padding:'8px 10px',cursor:'pointer',transition:'all 0.15s'
                      }}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:5}}>
                        <input type="checkbox" checked={visible}
                          onChange={e=>{e.stopPropagation();toggleHubVisible(h.name);}}
                          onClick={e=>e.stopPropagation()}
                          style={{width:14,height:14,accentColor:'#2563eb',cursor:'pointer',flexShrink:0}} />
                        <span style={{fontSize:12,fontWeight:700,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:isSelected?'var(--accent)':'var(--text)'}}>
                          {h.name}
                        </span>
                        {brand&&(
                          <span style={{fontSize:10,fontWeight:700,padding:'1px 5px',borderRadius:4,background:bc.bg,color:bc.color,border:`1px solid ${bc.border}`,flexShrink:0}}>
                            {brand}
                          </span>
                        )}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        {hasZone
                          ?<span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'#d1fae5',color:'#059669',border:'1px solid #6ee7b7'}}>권역 ✓</span>
                          :<span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'#fef2f2',color:'var(--red)',border:'1px solid #fca5a5'}}>미그림</span>
                        }
                        {surCount>0&&(
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'#fff7ed',color:'#ea580c',border:'1px solid #fed7aa'}}>할증 {surCount}</span>
                        )}
                        <button onClick={e=>{e.stopPropagation();deleteHub(h.name);}}
                          style={{marginLeft:'auto',padding:'2px 8px',fontSize:10,fontWeight:700,border:'1px solid #fca5a5',background:'#fef2f2',color:'var(--red)',borderRadius:5,cursor:'pointer'}}>
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      <div className={`map-status ${currentLayer}`}>{status}</div>
    </div>
  );
}
