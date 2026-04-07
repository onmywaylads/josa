import { useState, useEffect } from 'react';
import Login from './Login';
import Main from './Main';
import './styles.css';

export default function App() {
  const [auth, setAuth] = useState(null); // null=로딩중, false=미로그인, object=로그인됨

  useEffect(() => {
    // URL 파라미터에서 Slack 로그인 정보 수신
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('slack_user_id');
    const name   = params.get('slack_name');
    const email  = params.get('slack_email');
    const approved = params.get('approved');

    if (userId) {
      // 파라미터 정리
      window.history.replaceState({}, '', '/');
      if (approved === 'true') {
        const user = { userId, name, email };
        sessionStorage.setItem('josa_user', JSON.stringify(user));
        setAuth(user);
      } else {
        setAuth('pending'); // 승인 대기
      }
      return;
    }

    // 세션에서 복원
    const saved = sessionStorage.getItem('josa_user');
    if (saved) {
      setAuth(JSON.parse(saved));
    } else {
      setAuth(false);
    }
  }, []);

  if (auth === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>로딩 중...</div>
      </div>
    );
  }

  if (auth === false) return <Login />;

  if (auth === 'pending') {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">⏳</div>
          <div className="login-title">검토 중입니다</div>
          <div className="login-sub">
            관리자 승인 후 접근 가능해요.<br />
            승인이 완료되면 다시 로그인해주세요.
          </div>
        </div>
      </div>
    );
  }

  return <Main user={auth} />;
}