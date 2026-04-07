const REDIRECT_URI = "https://josa-ten.vercel.app/api/slack-oauth"; // ← Vercel 배포 후 실제 도메인으로 교체

// 승인된 사용자 목록 (Slack User ID 기준)
// 나중에 Google Sheets 연동으로 바꿀 수 있어요
const APPROVED_USERS = [
  // 'U0XXXXXXX1', // 예시 — 실제 팀원 Slack User ID 추가
];

export default async function handler(req, res) {
  const code = req.query?.code;

  if (!code) {
    return res.status(400).send("code 없음");
  }

  // ── 1. code → access_token 교환 ──────────────────────────
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code,
      redirect_uri:  REDIRECT_URI,
    }),
  });

  const tokenData = await tokenRes.json();

  if (!tokenData.ok) {
    return res.status(400).send("토큰 교환 실패: " + tokenData.error);
  }

  const userToken = tokenData.authed_user?.access_token; // xoxp-
  const userId    = tokenData.authed_user?.id;
  const teamId    = tokenData.team?.id;

  // ── 2. 바로고 워크스페이스 검증 ──────────────────────────
  if (teamId !== process.env.SLACK_TEAM_ID) {
    return res.status(403).send("바로고 Slack 계정으로만 로그인할 수 있어요.");
  }

  // ── 3. 유저 프로필 조회 ───────────────────────────────────
  const profileRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const profileData = await profileRes.json();

  if (!profileData.ok) {
    return res.status(400).send("프로필 조회 실패: " + profileData.error);
  }

  const slackName  = profileData.user?.profile?.real_name || "";
  const slackEmail = profileData.user?.profile?.email     || "";

  // ── 4. 승인 여부 확인 ────────────────────────────────────
  const approved = APPROVED_USERS.includes(userId);

  // ── 5. josa 앱으로 리다이렉트 ────────────────────────────
  const params = new URLSearchParams({
    slack_user_id: userId,
    slack_name:    slackName,
    slack_email:   slackEmail,
    approved:      approved ? "true" : "false",
  });

  return res.redirect(`/?${params.toString()}`);
}
