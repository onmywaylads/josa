import { useEffect, useRef, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 법정동 GeoJSON (앱 전체에서 한 번만 fetch)
let emdCache = null;
async function loadEmd() {
  if (emdCache) return emdCache;
  try {
    const res = await fetch('/emd_simplified.geojson');
    emdCache = await res.json();
  } catch (e) { console.log('법정동 GeoJSON 로드 실패', e); }
  return emdCache;
}

function drawEmd(map, emdData, emdPolygonsRef, emdLabelsRef) {
  emdPolygonsRef.current.forEach(p => { try { p.setMap(null); } catch (e) {} });
  emdLabelsRef.current.forEach(l => { try { l.setMap(null); } catch (e) {} });
  emdPolygonsRef.current = [];
  emdLabelsRef.current = [];

  if (!emdData) return;
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  emdData.features.forEach(feature => {
    const { nm, cx, cy } = feature.properties;
    const geomType = feature.geometry.type;
    const coordsList = geomType === 'Polygon'
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

    let inBounds = false;
    coordsList.forEach(polygonCoords => {
      const outer = polygonCoords[0];
      const hasPoint = outer.some(([lng, lat]) =>
        lat >= sw.getLat() && lat <= ne.getLat() && lng >= sw.getLng() && lng <= ne.getLng()
      );
      if (!hasPoint) return;
      inBounds = true;
      const path = outer.map(([lng, lat]) => new window.kakao.maps.LatLng(lat, lng));
      const poly = new window.kakao.maps.Polygon({
        map, path, zIndex: 200,
        strokeWeight: 1, strokeColor: '#111111', strokeOpacity: 1,
        fillColor: '#ffffff', fillOpacity: 0.30,
      });
      emdPolygonsRef.current.push(poly);
    });

    if (inBounds && cx && cy) {
      const labelContent = `<div style="text-align:center;line-height:1.3;pointer-events:none;">
        <div style="font-size:13px;color:#111;font-weight:700;white-space:nowrap;letter-spacing:-0.3px;">${nm}</div>
      </div>`;
      const label = new window.kakao.maps.CustomOverlay({
        map, position: new window.kakao.maps.LatLng(cy, cx),
        content: labelContent, zIndex: 9999, yAnchor: 0.5, xAnchor: 0.5,
      });
      emdLabelsRef.current.push(label);
    }
  });
}

// ── 핵심 변경: 허브명이 아닌 좌표로 Supabase에서 직접 찾기 ──
async function fetchHubZoneByCoord(lat, lng) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/hubs?select=name,zone_path,sur_paths`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
        }
      }
    );
    const hubs = await res.json();
    if (!Array.isArray(hubs)) return null;

    const point = window.turf.point([lng, lat]);

    for (const hub of hubs) {
      if (!hub.zone_path || hub.zone_path.length < 3) continue;
      try {
        const coords = hub.zone_path.map(p => [p.lng, p.lat]);
        coords.push(coords[0]); // 닫기
        const polygon = window.turf.polygon([coords]);
        if (window.turf.booleanPointInPolygon(point, polygon)) {
          return hub; // name, zone_path, sur_paths 포함
        }
      } catch (e) { /* 개별 허브 오류 무시 */ }
    }
    return null;
  } catch (e) {
    console.log('허브 존 조회 실패', e);
    return null;
  }
}

// turf.js로 폴리곤 ∩ 원 교집합
function turfIntersect(pathData, cLat, cLng, radiusKm) {
  try {
    const circle = window.turf.circle([cLng, cLat], radiusKm, { steps: 64, units: 'kilometers' });
    const coords = pathData.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    const polygon = window.turf.polygon([coords]);
    const inter = window.turf.intersect(polygon, circle);
    if (!inter) return null;
    return inter.geometry.coordinates[0].map(c => new window.kakao.maps.LatLng(c[1], c[0]));
  } catch (e) {
    return null;
  }
}

export default function ResultMap({ lat, lng, hub, storeKey, hasSurcharge }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const overlaysRef = useRef([]);
  const emdPolygonsRef = useRef([]);
  const emdLabelsRef = useRef([]);
  const [matchedHub, setMatchedHub] = useState(null);

  useEffect(() => {
    if (!lat || !lng) return;

    function clearOverlays() {
      overlaysRef.current.forEach(o => { try { o.setMap(null); } catch (e) {} });
      overlaysRef.current = [];
    }

    async function initMap() {
      if (!mapRef.current) return;

      const center = new window.kakao.maps.LatLng(lat, lng);

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new window.kakao.maps.Map(mapRef.current, { center, level: 6 });
      } else {
        mapInstanceRef.current.setCenter(center);
        mapInstanceRef.current.setLevel(6);
      }

      clearOverlays();
      const map = mapInstanceRef.current;

      // 1. 2km 원
      const circle = new window.kakao.maps.Circle({
        map, center, radius: 2000,
        strokeWeight: 3, strokeColor: '#2563eb', strokeOpacity: 1, strokeStyle: 'dashed',
        fillColor: '#ffffff', fillOpacity: 0,
      });
      overlaysRef.current.push(circle);

      // 2. Supabase 전체 허브에서 좌표로 매칭 (구글 시트 허브명 무관)
      const zoneData = await fetchHubZoneByCoord(lat, lng);
      if (zoneData) {
        setMatchedHub(zoneData.name);

        // 기본 권역 ∩ 2km → 파란색
        if (zoneData.zone_path?.length >= 3) {
          const inter = turfIntersect(zoneData.zone_path, lat, lng, 2.0);
          if (inter) {
            const poly = new window.kakao.maps.Polygon({
              map, path: inter,
              strokeWeight: 2, strokeColor: '#2563eb', strokeOpacity: 0.9,
              fillColor: '#2563eb', fillOpacity: 0.35, zIndex: 9500,
            });
            overlaysRef.current.push(poly);
          }
        }

        // 할증 구역(들) ∩ 2km → 빨간색
        const surPaths = zoneData.sur_paths || [];
        for (const surPath of surPaths) {
          if (surPath?.length >= 3) {
            const inter = turfIntersect(surPath, lat, lng, 2.0);
            if (!inter) continue; // 2km 원 밖이면 스킵
            const poly = new window.kakao.maps.Polygon({
              map, path: inter,
              strokeWeight: 2, strokeColor: '#dc2626', strokeOpacity: 1,
              fillColor: '#dc2626', fillOpacity: 0.4, zIndex: 9500,
            });
            overlaysRef.current.push(poly);
          }
        }
      } else {
        setMatchedHub(null);
      }

      // 3. 마커 + 인포윈도우
      const marker = new window.kakao.maps.Marker({ map, position: center });
      overlaysRef.current.push(marker);

      const info = new window.kakao.maps.InfoWindow({
        content: `<div style="padding:6px 10px;font-size:12px;font-weight:700;white-space:nowrap">${storeKey}${hasSurcharge ? ' ⚡' : ''}</div>`,
        removable: false,
      });
      info.open(map, marker);
      overlaysRef.current.push(info);

      // 4. 법정동 경계 + 이름
      const emdData = await loadEmd();
      drawEmd(map, emdData, emdPolygonsRef, emdLabelsRef);
      window.kakao.maps.event.addListener(map, 'zoom_changed', () => drawEmd(map, emdData, emdPolygonsRef, emdLabelsRef));
      window.kakao.maps.event.addListener(map, 'dragend', () => drawEmd(map, emdData, emdPolygonsRef, emdLabelsRef));

      setTimeout(() => map.relayout(), 150);
    }

    if (window.kakaoMapReady) {
      initMap();
    } else {
      window._onKakaoReady = initMap;
    }

    return () => {
      clearOverlays();
      emdPolygonsRef.current.forEach(p => { try { p.setMap(null); } catch (e) {} });
      emdLabelsRef.current.forEach(l => { try { l.setMap(null); } catch (e) {} });
    };
  }, [lat, lng, storeKey, hasSurcharge]);

  if (!lat || !lng) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
        🗺 권역 지도
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 8 }}>
        {storeKey} · 반경 2km
        {matchedHub && <span style={{ color: 'var(--accent)', fontWeight: 700 }}> · {matchedHub} 권역</span>}
        {matchedHub === null && <span style={{ color: 'var(--text-dim)' }}> · 권역 미설정 구역</span>}
        {hasSurcharge ? <span style={{ color: 'var(--orange)', fontWeight: 700 }}> · ⚡ 할증 구역 포함</span> : ''}
      </div>
      <div ref={mapRef} style={{ width: '100%', height: 680, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }} />
      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-mid)', flexWrap: 'wrap' }}>
        <span>⬜ 2km 반경</span>
        <span>🔵 수행 가능 권역</span>
        {hasSurcharge && <span>🔴 할증 구역</span>}
        <span>📍 상점 위치</span>
      </div>
    </div>
  );
}
