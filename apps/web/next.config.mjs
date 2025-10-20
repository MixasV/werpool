const parseList = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const normalizeOrigin = (origin) => origin.replace(/^https?:\/\//, "");

const extractHost = (origin) => {
  try {
    const candidate = origin.includes("://") ? origin : `http://${origin}`;
    return new URL(candidate).hostname;
  } catch {
    const withoutScheme = normalizeOrigin(origin);
    const colonIndex = withoutScheme.indexOf(":");
    return colonIndex === -1 ? withoutScheme : withoutScheme.slice(0, colonIndex);
  }
};

const defaultDevOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3200",
  "http://127.0.0.1:3200",
];

const allowedDevOrigins = Array.from(
  new Set(
    parseList(process.env.NEXT_DEV_ALLOWED_ORIGINS, defaultDevOrigins).flatMap((origin) => {
      const sanitized = normalizeOrigin(origin);
      const host = extractHost(origin);
      const entries = [origin];
      if (sanitized !== origin) {
        entries.push(sanitized);
      }
      if (host && host !== sanitized) {
        entries.push(host);
      }
      return entries;
    })
  )
);

const defaultCorsOrigin = process.env.NEXT_CORS_ORIGIN ?? "http://localhost:3000";
const corsOrigin = defaultCorsOrigin;
const corsMethods = process.env.NEXT_CORS_METHODS ?? "GET,POST,PATCH,PUT,DELETE,OPTIONS";
const corsHeaders =
  process.env.NEXT_CORS_HEADERS ?? "X-Requested-With,Content-Type,Authorization,x-api-token";

const nextConfig = {
  allowedDevOrigins,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: corsOrigin },
          { key: "Access-Control-Allow-Methods", value: corsMethods },
          { key: "Access-Control-Allow-Headers", value: corsHeaders },
        ],
      },
    ];
  },
};

export default nextConfig;
