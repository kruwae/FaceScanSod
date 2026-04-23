export default function handler(req, res) {
  res.status(200).json({
    apiUrl: process.env.GAS_API_URL || process.env.NEXT_PUBLIC_GAS_API_URL || ""
  });
}
