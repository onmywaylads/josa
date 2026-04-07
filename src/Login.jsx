export default function Login() {
  const SLACK_AUTH_URL =
    `https://slack.com/oauth/v2/authorize` +
    `?client_id=${import.meta.env.VITE_SLACK_CLIENT_ID}` +
    `&scope=` +
    `&user_scope=identity.basic,identity.email` +
    `&redirect_uri=${encodeURIComponent(import.meta.env.VITE_SLACK_REDIRECT_URI)}`;

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">📦</div>
        <div className="login-title">바로고 북부광역사업부</div>
        <div className="login-sub">
          B2B 실수행 상점 조회 시스템<br />
          바로고 Slack 계정으로 로그인해주세요
        </div>
        <a href={SLACK_AUTH_URL}>
          <button className="login-btn">Slack으로 로그인</button>
        </a>
      </div>
    </div>
  );
}