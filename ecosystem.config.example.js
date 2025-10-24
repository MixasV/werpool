module.exports = {
  apps: [
    {
      name: "forte-api",
      script: "dist/main.js",
      cwd: "./apps/api",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3333",
        DATABASE_URL: "postgresql://USER:PASSWORD@db:5432/forte",
        REDIS_URL: "redis://redis:6379",
      },
      max_restarts: 5,
      restart_delay: 3000,
    },
    {
      name: "forte-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "./apps/web",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://your-domain/api",
        NEXT_PUBLIC_FLOW_NETWORK: "testnet",
        NEXT_PUBLIC_FLOW_SESSION_COOKIE: "flow_session",
      },
      max_restarts: 5,
      restart_delay: 3000,
    },
  ],
};
