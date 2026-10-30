try {
  process.loadEnvFile();
} catch {}

const config = {
  use_env_variable: "DATABASE_URL",
  dialect: "postgres",
  define: { underscored: true },
};

module.exports = {
  development: config,
  production: config,
};
