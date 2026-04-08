const REDIRECT_URI = "https://josa-ten.vercel.app/api/slack-oauth";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  const code = req.query?.code;
  if (!code) return res.status(400).send("code 없음");

  // 1. code → access_token 교환
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
  if (!tokenData.ok) return res.status(400).send("토큰 교환 실패: " + tokenData.error);

  const userToken = tokenData.authed_user?.access_token;
  const userId    = tokenData.authed_user?.id;
  const teamId    = tokenData.team?.id;

  // 2. 바로고 워크스페이스 검증
  if (teamId !== process.env.SLACK_TEAM_ID) {
    return res.status(403).send("바로고 Slack 계정으로만 로그인할 수 있어요.");
  }

  // 3. 유저 프로필 조회
  const profileRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const profileData = await profileRes.json();
  if (!profileData.ok) return res.status(400).send("프로필 조회 실패");

  const name  = profileData.user?.profile?.real_name || "";
  const email = profileData.user?.profile?.email     || "";

  // 4. Supabase profiles 테이블에 upsert (없으면 추가, 있으면 유지)
  await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify({ slack_user_id: userId, name, email, approved: false }),
  });

  // 5. 승인 여부 조회
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?slack_user_id=eq.${userId}&select=approved`,
    {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    }
  );
  const checkData = await checkRes.json();
  const approved = checkData?.[0]?.approved === true;

  // 6. josa로 리다이렉트
  const params = new URLSearchParams({
    slack_user_id: userId,
    slack_name:    name,
    slack_email:   email,
    approved:      approved ? "true" : "false",
  });

  return res.redirect(`/?${params.toString()}`);
}
