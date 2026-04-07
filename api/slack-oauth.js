const REDIRECT_URI = "https://josa-ten.vercel.app/api/slack-oauth";

const APPROVED_USERS = [
  'UJWLF6KE1',
];

export default async function handler(req, res) {
  const code = req.query?.code;
  if (!code) return res.status(400).send("code 없음");

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

  if (teamId !== process.env.SLACK_TEAM_ID) {
    return res.status(403).send("바로고 Slack 계정으로만 로그인할 수 있어요.");
  }

  const profileRes = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const profileData = await profileRes.json();
  if (!profileData.ok) return res.status(400).send("프로필 조회 실패");

  const slackName  = profileData.user?.profile?.real_name || "";
  const slackEmail = profileData.user?.profile?.email     || "";
  const approved   = APPROVED_USERS.includes(userId);

  const params = new URLSearchParams({
    slack_user_id: userId,
    slack_name:    slackName,
    slack_email:   slackEmail,
    approved:      approved ? "true" : "false",
  });

  return res.redirect(`/?${params.toString()}`);
}
