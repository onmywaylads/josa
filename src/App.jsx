import { useState, useEffect } from 'react';
import Login from './Login';
import Main from './Main';
import './styles.css';

const STORAGE_KEY = 'josa_user';

export default function App() {
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId  = params.get('slack_user_id');
    const name    = params.get('slack_name');
    const email   = params.get('slack_email');
    const approved = params.get('approved');

    if (userId) {
      window.history.replaceState({}, '', '/');
      if (approved === 'true') {
        const user = { userId, name, email };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
        setAuth(user);
      } else {
        setAuth('pending');
      }
      return;
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setAuth(JSON.parse(saved)); }
      catch { setAuth(false); }
    } else {
      setAuth(false);
    }
  }, []);

  if (auth === null) return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{color:'var(--text-dim)',fontSize:14}}>로딩 중...</div>
    </div>
  );

  if (auth === false) return <Login />;

  if (auth === 'pending') return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">⏳</div>
        <div className="login-title">승인 대기 중</div>
        <div className="login-sub">
          관리자 승인 후 접근 가능해요.<br/>
          승인 완료 후 다시 로그인해주세요.
        </div>
        <button className="login-btn" style={{marginTop:8,background:'var(--bg)',color:'var(--text-mid)',border:'1px solid var(--border)'}}
          onClick={()=>{localStorage.removeItem(STORAGE_KEY);setAuth(false);}}>
          다시 로그인
        </button>
      </div>
    </div>
  );

  return <Main user={auth} onLogout={()=>{localStorage.removeItem(STORAGE_KEY);setAuth(false);}} />;
}
