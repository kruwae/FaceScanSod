export default function handler(req, res) {
  res.status(200).json({
    apiUrl: process.env.GAS_API_URL || process.env.NEXT_PUBLIC_GAS_API_URL || "",
    googleClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ""
  });
}
