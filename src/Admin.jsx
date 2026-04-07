import { useEffect, useState } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const ADMIN_ID = 'UJWLF6KE1'; // Jay Slack User ID

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export default function Admin({ user, onBack }) {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | pending | approved

  // 관리자 체크
  if (user.userId !== ADMIN_ID) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">🚫</div>
          <div className="login-title">접근 권한 없음</div>
          <div className="login-sub">관리자만 접근할 수 있어요.</div>
          <button className="login-btn" style={{marginTop:16}} onClick={onBack}>← 돌아가기</button>
        </div>
      </div>
    );
  }

  useEffect(() => { loadProfiles(); }, []);

  async function loadProfiles() {
    setLoading(true);
    try {
      const data = await sbFetch('/profiles?order=created_at.desc');
      setProfiles(data || []);
    } catch(e) { console.error(e); }
    setLoading(false);
  }

  async function toggleApprove(userId, current) {
    try {
      await sbFetch(`/profiles?slack_user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ approved: !current }),
      });
      setProfiles(prev => prev.map(p =>
        p.slack_user_id === userId ? {...p, approved: !current} : p
      ));
    } catch(e) { alert('오류 발생: ' + e.message); }
  }

  async function deleteProfile(userId) {
    if (!confirm('이 유저를 삭제할까요?')) return;
    try {
      await sbFetch(`/profiles?slack_user_id=eq.${userId}`, { method: 'DELETE' });
      setProfiles(prev => prev.filter(p => p.slack_user_id !== userId));
    } catch(e) { alert('오류 발생: ' + e.message); }
  }

  const filtered = profiles.filter(p => {
    if (filter === 'pending') return !p.approved;
    if (filter === 'approved') return p.approved;
    return true;
  });

  const pendingCount = profiles.filter(p => !p.approved).length;

  return (
    <div style={{minHeight:'100vh',background:'var(--bg)'}}>
      {/* 헤더 */}
      <div style={{background:'var(--white)',borderBottom:'1px solid var(--border)',padding:'16px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={onBack} style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg)',cursor:'pointer',fontSize:13,fontWeight:600}}>
            ← 돌아가기
          </button>
          <span style={{fontSize:16,fontWeight:800}}>👤 사용자 승인 관리</span>
          {pendingCount > 0 && (
            <span style={{background:'var(--red)',color:'#fff',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20}}>
              대기 {pendingCount}
            </span>
          )}
        </div>
        <button onClick={loadProfiles} style={{padding:'6px 12px',border:'1px solid var(--border)',borderRadius:8,background:'var(--bg)',cursor:'pointer',fontSize:12}}>
          🔄 새로고침
        </button>
      </div>

      <div style={{maxWidth:640,margin:'0 auto',padding:'24px 16px'}}>

        {/* 필터 탭 */}
        <div style={{display:'flex',gap:8,marginBottom:20}}>
          {[['all','전체'],['pending','승인 대기'],['approved','승인됨']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)} style={{
              padding:'7px 16px',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer',
              border:`1.5px solid ${filter===v?'var(--accent)':'var(--border)'}`,
              background:filter===v?'var(--accent-light)':'var(--white)',
              color:filter===v?'var(--accent)':'var(--text-mid)',
            }}>{l}</button>
          ))}
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text-dim)'}}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{textAlign:'center',padding:40,color:'var(--text-dim)'}}>유저 없음</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {filtered.map(p => (
              <div key={p.slack_user_id} style={{
                background:'var(--white)',border:'1px solid var(--border)',borderRadius:12,padding:'16px',
                display:'flex',alignItems:'center',gap:12,boxShadow:'var(--shadow)'
              }}>
                {/* 아바타 */}
                <div style={{width:40,height:40,borderRadius:'50%',background:p.approved?'var(--accent-light)':'var(--bg)',
                  border:`2px solid ${p.approved?'var(--accent)':'var(--border)'}`,
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                  {p.name?.[0]||'?'}
                </div>

                {/* 정보 */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{p.name||'이름 없음'}</div>
                  <div style={{fontSize:12,color:'var(--text-dim)',marginTop:2}}>{p.email||'이메일 없음'}</div>
                  <div style={{fontSize:10,color:'var(--text-dim)',marginTop:2}}>
                    {new Date(p.created_at).toLocaleDateString('ko-KR', {month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'})} 가입
                  </div>
                </div>

                {/* 상태 + 버튼 */}
                <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                  <span style={{
                    fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:6,
                    background:p.approved?'var(--green-light)':'var(--yellow-light)',
                    color:p.approved?'var(--green)':'var(--yellow)',
                    border:`1px solid ${p.approved?'#6ee7b7':'#fde68a'}`
                  }}>
                    {p.approved?'승인됨':'대기중'}
                  </span>
                  <button onClick={()=>toggleApprove(p.slack_user_id, p.approved)} style={{
                    padding:'5px 12px',borderRadius:7,fontSize:12,fontWeight:700,cursor:'pointer',
                    border:'none',
                    background:p.approved?'var(--red-light)':'var(--accent)',
                    color:p.approved?'var(--red)':'#fff',
                  }}>
                    {p.approved?'취소':'승인'}
                  </button>
                  <button onClick={()=>deleteProfile(p.slack_user_id)} style={{
                    padding:'5px 8px',borderRadius:7,fontSize:12,cursor:'pointer',
                    border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text-dim)',
                  }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
