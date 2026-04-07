import { useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBt4hJMPjXRT2RaKhWyRCVYLg4vO6Bev_8gULP52OhWz6SRPDr3nQLayNulzF8kjsDWA/exec';

export default function Main({ user }) {
  const [tab, setTab] = useState('search');

  return (
    <>
      <nav className="nav">
        <button className={`nav-tab ${tab==='search'?'active':''}`} onClick={()=>setTab('search')}>🔍 상점 조회</button>
        <button className={`nav-tab ${tab==='map'?'active':''}`} onClick={()=>setTab('map')}>📐 권역 관리</button>
        <button className="nav-tab" style={{flex:'0 0 auto',padding:'16px 12px',fontSize:12,color:'var(--text-dim)'}}
          onClick={()=>{sessionStorage.removeItem('josa_user');window.location.reload();}}>
          {user.name} · 로그아웃
        </button>
      </nav>

      {/* 상점 조회 */}
      <div style={{display: tab==='search' ? 'block' : 'none'}}>
        <SearchPage />
      </div>

      {/* 권역 관리 - 항상 DOM에 존재, visibility로만 제어 */}
      <div style={{
        position: 'fixed', top: 49, left: 0, right: 0, bottom: 0,
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
    setLoading(true);
    setResult(null);
    const inputCoord = await getCoordFromAddr(addrInput);
    const inDong = inputCoord?.dong || extractDong(addrInput) || '';
    const parsed = parseKey(storeInput);
    const preScored = db.map(item=>({...item,_ns:strSim(parsed.store,item.store)}))
      .sort((a,b)=>b._ns-a._ns).slice(0,30);
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
      <div className="page-header">
        <h1>바로고 북부광역사업부</h1>
        <p>B2B 실수행 상점 조회 시스템</p>
      </div>
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
            <input className="inp big" value={storeInput} onChange={e=>setStoreInput(e.target.value)}
              placeholder="맥도날드[강남점]" onKeyDown={e=>e.key==='Enter'&&doSearch()} />
          </div>
          <div className="field">
            <div className="field-label">주소</div>
            <input className="inp" value={addrInput} onChange={e=>setAddrInput(e.target.value)}
              placeholder="서울시 강남구 강남대로 396" onKeyDown={e=>e.key==='Enter'&&doSearch()} />
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
          <div className="stotal">
            <div className="stotal-l">종합 매칭 신뢰도</div>
            <div className="stotal-v">{d.total}%</div>
          </div>
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

// ── 유틸 함수들 ──
function parseDBRow(row) {
  const brand = String(row['브랜드명']||'').trim();
  const storeFull = String(row['상점명']||'').trim();
  const hasFormat = storeFull.includes('[') && storeFull.includes(']');
  const key = hasFormat ? storeFull : (storeFull ? `${brand}[${storeFull}]` : brand);
  const storeMatch = storeFull.match(/\[(.+?)\]/);
  const store = storeMatch ? storeMatch[1] : storeFull;
  const addr = String(row['상점주소']||'').trim();
  return {
    key, brand, store, address: addr, dong: extractDong(addr),
    lat: 0, lng: 0,
    status: String(row['수행가능답변']||'확인필요').trim(),
    hub: String(row['메인허브명']||'').trim(),
    sharedHub: String(row['공유허브명']||'').trim(),
    preDeductTotal: row['총판']!==undefined ? String(row['총판']).trim() : '',
    preDeductHub: row['허브']!==undefined ? String(row['허브']).trim() : '',
    hubOpen: String(row['허브오픈시간']||'').trim(),
    hubClose: String(row['허브마감시간']||'').trim(),
    deliveryCompany: String(row['수행배대사']||'').trim(),
    hubManager: String(row['담당자2']||'').trim(),
    memo: String(row['불가/보류사유']||'').trim(),
  };
}

function parseKey(raw) {
  const m = raw.match(/^(.+?)\[(.+?)\]$/);
  return m ? {brand:m[1].trim(), store:m[2].trim()} : {brand:raw.trim(), store:''};
}

function extractDong(a) {
  const m = (a||'').match(/([가-힣]+동|[가-힣]+가)\b/);
  return m ? m[1] : '';
}

function norm(s) { return (s||'').replace(/\s/g,'').toLowerCase(); }

function strSim(a, b) {
  const extract = s => { const m=(s||'').match(/\[(.+?)\]/); return m?m[1]:s; };
  a = norm(extract(a)); b = norm(extract(b));
  if(!a||!b) return 0;
  if(a===b) return 1;
  let maxCommon = 0;
  for(let i=0;i<a.length;i++)
    for(let j=i+1;j<=a.length;j++){
      const sub=a.slice(i,j);
      if(b.includes(sub)&&sub.length>maxCommon) maxCommon=sub.length;
    }
  if(maxCommon>=4) return 1.0;
  if(maxCommon>=3) return 0.9;
  if(maxCommon>=2) return 0.8;
  return 0;
}

function haversine(la1,lo1,la2,lo2) {
  const R=6371,d=Math.PI/180,dla=(la2-la1)*d,dlo=(lo2-lo1)*d;
  const av=Math.sin(dla/2)**2+Math.cos(la1*d)*Math.cos(la2*d)*Math.sin(dlo/2)**2;
  return R*2*Math.atan2(Math.sqrt(av),Math.sqrt(1-av));
}

function distScore(km) {
  if(km<=0.10)return 1.00; if(km<=0.15)return 0.95; if(km<=0.20)return 0.90;
  if(km<=0.30)return 0.85; if(km<=0.40)return 0.80; if(km<=0.50)return 0.75;
  if(km<=0.70)return 0.65; if(km<=1.00)return 0.55; if(km<=1.50)return 0.40;
  if(km<=2.00)return 0.25; if(km<=3.00)return 0.10; return 0;
}

function dongScore(inDong, itemDong, km, inAddr, itemAddr) {
  if(!inDong||!itemDong) return 0;
  if(inDong===itemDong) return 1;
  const inGu=(inAddr||'').match(/([가-힣]+구)/)?.[1]||'';
  const itemGu=(itemAddr||'').match(/([가-힣]+구)/)?.[1]||'';
  const sameGu=inGu&&itemGu&&inGu===itemGu;
  if(km!==null){
    if(km<=0.10)return 0.95; if(km<=0.20)return 0.85;
    if(km<=0.30)return sameGu?0.80:0.75; if(km<=0.50)return sameGu?0.70:0.50;
    if(km<=1.00)return sameGu?0.50:0.20;
  }
  return sameGu?0.30:0;
}

function getCoordFromAddr(addr) {
  return new Promise(resolve => {
    if(!window.kakao?.maps?.services) { resolve(null); return; }
    const gc = new window.kakao.maps.services.Geocoder();
    gc.addressSearch(addr, (res, st) => {
      if(st===window.kakao.maps.services.Status.OK){
        const r=res[0];
        const dong=r.address?.region_3depth_name||r.road_address?.region_3depth_name||'';
        resolve({lat:parseFloat(r.y), lng:parseFloat(r.x), dong});
      } else resolve(null);
    });
  });
}

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
  const [selectedHub, setSelectedHub] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');

  const currentPathRef = useRef([]);
  const tempPolylineRef = useRef(null);
  const tempPolygonRef = useRef(null);
  const savedZonesRef = useRef({});
  const hubListRef = useRef([]);
  const isDrawingRef = useRef(false);
  const currentLayerRef = useRef('zone');

  useEffect(() => { savedZonesRef.current = savedZones; }, [savedZones]);
  useEffect(() => { hubListRef.current = hubList; }, [hubList]);
  useEffect(() => { isDrawingRef.current = isDrawing; }, [isDrawing]);
  useEffect(() => { currentLayerRef.current = currentLayer; }, [currentLayer]);

  // 컴포넌트 마운트 시 바로 지도 초기화 시작
  useEffect(() => {
    loadFromStorage();
    loadZonesFromSheet();
    initMapWhenReady();
  }, []);

  // 탭 전환 시 relayout
  useEffect(() => {
    if (active && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.relayout(), 50);
    }
  }, [active]);

  function initMapWhenReady() {
    const tryInit = () => {
      if (window.kakao && window.kakao.maps && window.kakaoMapReady && mapRef.current) {
        initMap();
      } else {
        setTimeout(tryInit, 300);
      }
    };
    tryInit();
  }

  function initMap() {
    if (!mapRef.current || mapInstanceRef.current) return;
    const map = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(37.5172, 127.0473),
      level: 8
    });
    mapInstanceRef.current = map;
    window.kakao.maps.event.addListener(map, 'click', onMapClick);
    restorePolygonsOnMap(map, savedZonesRef.current, hubVisible);
  }

  function restorePolygonsOnMap(map, zones, visible) {
    Object.entries(zones).forEach(([hub, v]) => {
      const show = visible[hub] !== false;
      if (v.zonePolygon) { try { v.zonePolygon.setMap(null); } catch(e) {} }
      (v.surPolygons||[]).forEach(p => { try { p.setMap(null); } catch(e) {} });
      v.zonePolygon = null; v.surPolygons = [];
      if (v.zonePath?.length >= 3) {
        v.zonePolygon = new window.kakao.maps.Polygon({
          map, path: v.zonePath.map(p => new window.kakao.maps.LatLng(p.lat, p.lng)),
          strokeWeight:2, strokeColor:'#2563eb', strokeOpacity:1, fillColor:'#2563eb', fillOpacity:0.15
        });
        if (!show) v.zonePolygon.setMap(null);
      }
      v.surPolygons = (v.surPaths||[]).filter(sp => sp?.length >= 3).map(sp => {
        const poly = new window.kakao.maps.Polygon({
          map, path: sp.map(p => new window.kakao.maps.LatLng(p.lat, p.lng)),
          strokeWeight:2, strokeColor:'#ea580c', strokeOpacity:1, fillColor:'#ea580c', fillOpacity:0.25
        });
        if (!show) poly.setMap(null);
        return poly;
      });
    });
  }

  function onMapClick(e) {
    if (!isDrawingRef.current) return;
    currentPathRef.current.push(new window.kakao.maps.LatLng(e.latLng.getLat(), e.latLng.getLng()));
    updateTempDraw();
  }

  function updateTempDraw() {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (tempPolylineRef.current) tempPolylineRef.current.setMap(null);
    if (tempPolygonRef.current) tempPolygonRef.current.setMap(null);
    const color = currentLayerRef.current === 'surcharge' ? '#ea580c' : '#2563eb';
    const path = currentPathRef.current;
    if (path.length >= 2) {
      tempPolygonRef.current = new window.kakao.maps.Polygon({
        map, path, strokeWeight:2, strokeColor:color, strokeOpacity:0.9, fillColor:color, fillOpacity:0.15
      });
    }
    tempPolylineRef.current = new window.kakao.maps.Polyline({
      map, path, strokeWeight:2, strokeColor:color, strokeOpacity:1
    });
  }

  function toggleDraw() {
    if (!selectedHub) { alert('허브를 먼저 선택해주세요!'); return; }
    const next = !isDrawing;
    setIsDrawing(next);
    if (next) {
      setStatus(`[${selectedHub}] ${currentLayer==='zone'?'🔵 기본 권역':'🟠 할증 구역'} 그리는 중 — 지도 클릭`);
    } else {
      setStatus('그리기 중단');
    }
  }

  function undoLast() {
    currentPathRef.current.pop();
    updateTempDraw();
  }

  function saveZone() {
    if (!selectedHub) { alert('허브를 선택해주세요!'); return; }
    if (currentPathRef.current.length < 3) { alert('최소 3개 이상 점을 찍어주세요!'); return; }
    const map = mapInstanceRef.current;
    const color = currentLayer === 'surcharge' ? '#ea580c' : '#2563eb';
    const polygon = new window.kakao.maps.Polygon({
      map, path: currentPathRef.current,
      strokeWeight:2, strokeColor:color, strokeOpacity:1,
      fillColor:color, fillOpacity: currentLayer==='surcharge' ? 0.25 : 0.15
    });
    const pathData = currentPathRef.current.map(p => ({lat:p.getLat(), lng:p.getLng()}));
    setSavedZones(prev => {
      const next = {...prev};
      if (!next[selectedHub]) next[selectedHub] = {zonePolygon:null, surPolygons:[], zonePath:[], surPaths:[], brand:''};
      if (currentLayer === 'zone') {
        if (next[selectedHub].zonePolygon) next[selectedHub].zonePolygon.setMap(null);
        next[selectedHub].zonePolygon = polygon;
        next[selectedHub].zonePath = pathData;
        if (selectedBrand) next[selectedHub].brand = selectedBrand;
      } else {
        next[selectedHub].surPolygons = [...(next[selectedHub].surPolygons||[]), polygon];
        next[selectedHub].surPaths = [...(next[selectedHub].surPaths||[]), pathData];
      }
      saveToStorageData(hubListRef.current, next);
      saveZonesToSheetData(hubListRef.current, next);
      return next;
    });
    clearCurrent();
    setIsDrawing(false);
    setStatus(`[${selectedHub}] ${currentLayer==='zone'?'기본 권역':'할증 구역'} 저장 완료! ✅`);
  }

  function clearCurrent() {
    if (tempPolylineRef.current) tempPolylineRef.current.setMap(null);
    if (tempPolygonRef.current) tempPolygonRef.current.setMap(null);
    currentPathRef.current = [];
    tempPolylineRef.current = null;
    tempPolygonRef.current = null;
    setIsDrawing(false);
  }

  function addHub() {
    if (!hubAddName.trim()) { alert('허브명을 입력해주세요!'); return; }
    if (hubList.find(h => h.name === hubAddName.trim())) { alert('이미 존재하는 허브입니다!'); return; }
    const next = [...hubList, {name: hubAddName.trim()}];
    setHubList(next);
    setSelectedHub(hubAddName.trim());
    setHubAddName('');
    saveToStorageData(next, savedZonesRef.current);
    saveZonesToSheetData(next, savedZonesRef.current);
  }

  function deleteHub(name) {
    if (!confirm(`[${name}] 허브를 삭제할까요?`)) return;
    const z = savedZonesRef.current[name];
    if (z) {
      if (z.zonePolygon) z.zonePolygon.setMap(null);
      (z.surPolygons||[]).forEach(p => { try { p.setMap(null); } catch(e) {} });
    }
    const nextList = hubList.filter(h => h.name !== name);
    const nextZones = {...savedZonesRef.current};
    delete nextZones[name];
    setHubList(nextList);
    setSavedZones(nextZones);
    saveToStorageData(nextList, nextZones);
    saveZonesToSheetData(nextList, nextZones);
  }

  function toggleHubVisible(name) {
    const next = {...hubVisible, [name]: hubVisible[name] === false ? true : false};
    setHubVisible(next);
    const map = mapInstanceRef.current;
    if (!map) return;
    const z = savedZonesRef.current[name];
    if (!z) return;
    const show = next[name];
    if (show) {
      if (z.zonePolygon) z.zonePolygon.setMap(map);
      (z.surPolygons||[]).forEach(p => { try { p.setMap(map); } catch(e) {} });
    } else {
      if (z.zonePolygon) z.zonePolygon.setMap(null);
      (z.surPolygons||[]).forEach(p => { try { p.setMap(null); } catch(e) {} });
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('barogo_data');
      if (!raw) return;
      const data = JSON.parse(raw);
      setHubList(data.hubList||[]);
      const zones = {};
      Object.entries(data.zones||{}).forEach(([k,v]) => {
        zones[k] = {zonePolygon:null, surPolygons:[], zonePath:v.zonePath||[], surPaths:v.surPaths||[], brand:v.brand||''};
      });
      setSavedZones(zones);
    } catch(e) {}
  }

  async function loadZonesFromSheet() {
    try {
      const res = await fetch(SCRIPT_URL + '?action=getZones');
      const data = await res.json();
      setHubList(data.hubList||[]);
      const zones = {};
      Object.entries(data.zones||{}).forEach(([k,v]) => {
        zones[k] = {zonePolygon:null, surPolygons:[], zonePath:v.zonePath||[], surPaths:v.surPaths||(v.surPath?.length>=3?[v.surPath]:[]), brand:v.brand||''};
      });
      setSavedZones(zones);
      if (mapInstanceRef.current) restorePolygonsOnMap(mapInstanceRef.current, zones, hubVisible);
    } catch(e) { console.log('시트 로드 실패', e); }
  }

  function saveToStorageData(hList, zones) {
    try {
      const data = {hubList: hList, zones: Object.fromEntries(Object.entries(zones).map(([k,v])=>[k,{zonePath:v.zonePath, surPaths:v.surPaths}]))};
      localStorage.setItem('barogo_data', JSON.stringify(data));
    } catch(e) {}
  }

  async function saveZonesToSheetData(hList, zones) {
    try {
      const zonesData = {};
      Object.entries(zones).forEach(([k,v]) => {
        zonesData[k] = {zonePath:v.zonePath||[], surPaths:v.surPaths||[], brand:v.brand||''};
      });
      await fetch(SCRIPT_URL, {method:'POST', body:JSON.stringify({action:'saveZones', zones:zonesData, hubList:hList})});
    } catch(e) {}
  }

  return (
    <div style={{width:'100%',height:'100%',position:'relative'}}>
      <div ref={mapRef} style={{width:'100%',height:'100%'}} />
      <div className="map-toolbar">
        <div className="map-panel">
          <div className="map-panel-title">✏️ 권역 그리기</div>
          <select className="hub-select" value={selectedHub} onChange={e=>setSelectedHub(e.target.value)}>
            <option value="">— 허브 선택 —</option>
            {hubList.map(h=><option key={h.name} value={h.name}>{h.name}</option>)}
          </select>
          <select className="hub-select" value={selectedBrand} onChange={e=>setSelectedBrand(e.target.value)} style={{marginBottom:4,fontSize:12}}>
            <option value="">— 브랜드 선택 (선택사항) —</option>
            <option value="바로고">바로고</option>
            <option value="모아라인">모아라인</option>
            <option value="딜버">딜버</option>
          </select>
          <div style={{fontSize:10,color:'var(--text-dim)',marginBottom:10}}>특정 브랜드 권역을 그릴 때 선택하세요</div>
          <div style={{marginBottom:12}}>
            <input value={hubAddName} onChange={e=>setHubAddName(e.target.value)}
              placeholder="새 허브명 입력"
              style={{width:'100%',border:'1.5px solid var(--border)',borderRadius:8,padding:'9px 12px',fontFamily:'Pretendard',fontSize:13,fontWeight:600,outline:'none',marginBottom:6}} />
            <button onClick={addHub} style={{width:'100%',padding:9,background:'var(--accent)',border:'none',borderRadius:8,color:'#fff',fontFamily:'Pretendard',fontSize:13,fontWeight:700,cursor:'pointer'}}>+ 허브 추가</button>
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
        </div>
        <div className="map-panel">
          <div className="map-panel-title">📋 허브 관리</div>
          {hubList.length === 0
            ? <div style={{fontSize:12,color:'var(--text-dim)'}}>추가된 허브 없음</div>
            : hubList.map(h => (
              <div key={h.name} className="hub-mgr-item" style={{flexDirection:'column',alignItems:'stretch',gap:6,marginBottom:6}}>
                <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
                  <input type="checkbox" checked={hubVisible[h.name]!==false} onChange={()=>toggleHubVisible(h.name)}
                    style={{width:15,height:15,accentColor:'#2563eb',cursor:'pointer'}} />
                  <span className="hub-mgr-name">{h.name}</span>
                </label>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn btn-sm btn-danger" style={{fontSize:10,padding:'3px 7px'}} onClick={()=>deleteHub(h.name)}>삭제</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>
      <div className={`map-status ${currentLayer}`}>{status}</div>
    </div>
  );
}
